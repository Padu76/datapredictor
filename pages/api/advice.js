// pages/api/advice.js
// Advisor PRO+ : prompt potenziato + normalizzazione output
export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { rows = [], target = '', dateCol = '', domain = 'business', stats = null, baseline = null } = req.body || {};
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Missing OPENAI_API_KEY (server env).' });
    }
    if (!rows?.length || !target) {
      return res.status(400).json({ error: 'rows[] and target are required' });
    }

    // Build compact numeric summary server-side (robust even if client didn't send stats)
    const compact = computeCompact(rows, target, dateCol);

    const context = {
      target, dateCol, domain,
      compact,
      clientStats: stats || null,
      baselineAdvisor: baseline || null,
      samplePreview: rows.slice(0, 60)
    };

    const sys = `Sei un consulente analitico senior (marketing & business). Devi fornire un piano d'azione *operativo* e misurabile.
Usa numeri realistici (range % o valori) e collega le azioni a KPI e vincoli tipici (budget, margini, capacità, funnel).
Rispondi SOLO in JSON con lo schema seguente (nessun testo fuori dal JSON):
{
  "summary": "max 6-7 righe con insight chiave",
  "tone": "positivo|neutro|negativo",
  "risk": "basso|medio|alto",
  "horizonActions": {
    "short": ["azioni per 1–3 mesi (con leve, %/range, test A/B, quick wins)"],
    "medium": ["azioni per 3–6 mesi (scalabilità, allocazioni, processi)"],
    "long": ["azioni per 6+ mesi (diversificazione, product/channel, sistemi)"]
  },
  "risks": ["rischi pratici e come mitigarli"]
}`;

    const prompt = `CONTESTO:\n${JSON.stringify(context, null, 2)}\n\n
OBIETTIVO: Genera una consulenza potenziata. Evita frasi generiche. Usa punti elenco chiari e misurabili.`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: prompt }
        ],
        temperature: 0.55,
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return res.status(500).json({ error: "OpenAI error", detail: t });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = safeJson(content);
    const out = normalizeAdvisor(parsed);

    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: 'Advisor error', detail: String(e) });
  }
}

// ---- helpers ----
function safeJson(s) {
  if (!s) return {};
  try { return JSON.parse(s); } catch {}
  const m = s && s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return { summary: String(s) };
}
function toArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  if (typeof v === 'string') {
    return v.split(/\r?\n+/).map(s => s.replace(/^\s*[-•\d\.\)]\s*/, '').trim()).filter(Boolean);
  }
  if (typeof v === 'object') {
    try { return Object.values(v).flat().map(x => typeof x === 'string' ? x : JSON.stringify(x)); } catch { return []; }
  }
  return [String(v)];
}
function normalizeAdvisor(a) {
  const out = {};
  out.summary = a?.summary || a?.synopsis || '';
  out.tone = a?.tone || a?.health || null;
  out.risk = a?.risk ?? null;
  out.horizonActions = {
    short: toArray(a?.horizonActions?.short || a?.actions?.short || a?.shortTerm || a?.short),
    medium: toArray(a?.horizonActions?.medium || a?.actions?.medium || a?.midTerm || a?.medium),
    long: toArray(a?.horizonActions?.long || a?.actions?.long || a?.longTerm || a?.long),
  };
  out.risks = toArray(a?.risks || a?.watchouts);
  return out;
}

// Create compact numeric summary
function computeCompact(rows, target, dateCol) {
  const vals = rows.map(r => num(r[target])).filter(isFinite);
  const n = vals.length;
  const mean = n ? vals.reduce((a,b)=>a+b,0)/n : 0;
  const std = n ? Math.sqrt(vals.reduce((s,v)=>s+Math.pow(v-mean,2),0)/n) : 0;
  const cv = mean ? std/mean : 0;
  const first = n ? vals[0] : 0;
  const last = n ? vals[n-1] : 0;
  const trend = first ? (last-first)/first : 0;

  return { n, mean, std, cv, first, last, trend, dateColPresent: Boolean(dateCol) };
}
function num(v){ const n = Number(v); return Number.isFinite(n) ? n : NaN; }
