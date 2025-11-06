// pages/api/advice.js
export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { rows = [], target = '', dateCol = '', domain = 'business', stats = null, baseline = null, narrativeLines = 36 } = req.body || {};
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Missing OPENAI_API_KEY (server env).' });
    }
    if (!rows?.length || !target) {
      return res.status(400).json({ error: 'rows[] and target are required' });
    }

    const compact = computeCompact(rows, target, dateCol);

    const domainBrief = domainPrompt(domain);

    const context = {
      target, dateCol,
      compact,
      clientStats: stats || null,
      baselineAdvisor: baseline || null,
      samplePreview: rows.slice(0, 60)
    };

    const sys = `Sei un consulente analitico senior. Genera un piano operativo e misurabile, con leve, KPI e range numerici realistici.
Contesto dominio: ${domainBrief}
Rispondi SOLO in JSON con lo schema:
{
  "summary": "6-7 righe",
  "tone": "positivo|neutro|negativo",
  "risk": "basso|medio|alto",
  "horizonActions": {
    "short": ["..."],
    "medium": ["..."],
    "long": ["..."]
  },
  "risks": ["..."],
  "narrative": "testo discorsivo completo (almeno ${Math.max(30, narrativeLines)} righe), strutturato in paragrafi con consigli pratici per ${domain}"
}`;

    const prompt = `DATI E INDICATORI:\n${JSON.stringify(context, null, 2)}\n\nOBIETTIVO: Consulenza PRO dettagliata per "${target}". Evita frasi generiche, inserisci %/range, suggerisci A/B test, allocazioni e priorità.`;

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
    // ensure narrative string exists
    if (typeof out.narrative !== 'string' || out.narrative.trim().length < 200) {
      // fallback: synthesize basic narrative from actions
      out.narrative = synthesizeNarrative(out);
    }
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: 'Advisor error', detail: String(e) });
  }
}

function domainPrompt(domain) {
  const m = {
    marketing: "Marketing performance: acquisizione, CPL, CPA, ROAS, conversion rate, retention, canali paid/organic, creatività, segmentazione.",
    sales: "Vendite: pipeline, win-rate, CAC payback, pricing & scontistica, cicli commerciali, onboarding, upsell & cross-sell, churn.",
    finance: "Finanza/Business: ricavi, costi, margini, MRR/ARR, LTV/CAC, cassa, budget, inventario, rotazioni, controllo di gestione.",
    business: "Business generale: efficienza operativa, crescita sostenibile, priorità roadmap, staffing, processi, KPI e governance."
  };
  return m[(domain || '').toLowerCase()] || m.business;
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
  out.narrative = typeof a?.narrative === 'string' ? a.narrative : '';
  return out;
}
function synthesizeNarrative(a) {
  const b = [...(a?.horizonActions?.short||[]), ...(a?.horizonActions?.medium||[]), ...(a?.horizonActions?.long||[])];
  if (!b.length) return 'Analisi narrativa non disponibile.';
  const lines = b.map((x,i) => `${i+1}. ${String(x)}`);
  // Ensure at least ~30 lines by repeating with slight formatting
  while (lines.length < 30) lines.push(lines[lines.length % b.length]);
  return lines.join('\n');
}

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
