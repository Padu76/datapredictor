// pages/api/advice.js
// Advisor PRO API with robust output normalization to avoid client crashes
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { rows = [], target = '', dateCol = '', domain = 'business' } = req.body || {};
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Missing OPENAI_API_KEY (server env).' });
    }
    if (!rows?.length || !target) {
      return res.status(400).json({ error: 'rows[] and target are required' });
    }

    // Build prompt
    const sample = rows.slice(0, 50);
    const preview = JSON.stringify({ target, dateCol, sample }, null, 2);

    const sys = `Sei un consulente analitico molto pragmatico. Genera un'analisi concisa e piani d'azione a orizzonte breve/medio/lungo.
Rispondi in JSON puro con questo schema:
{
  "summary": "testo",
  "tone": "positivo|neutro|negativo",
  "risk": "basso|medio|alto",
  "horizonActions": {
    "short": ["azione 1", "azione 2"],
    "medium": ["azione 1", "azione 2"],
    "long": ["azione 1", "azione 2"]
  },
  "risks": ["rischio 1"]
}`;

    const prompt = `Dati (anteprima):\n${preview}\n\nObiettivo: ${domain} su metrica "${target}"`;

    // Minimal OpenAI fetch to avoid bringing SDK. (works on edge/node runtimes)
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
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return res.status(500).json({ error: "OpenAI error", detail: t });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "";

    // Try to parse JSON inside content; tolerate extra text
    const parsed = safeJson(content);

    // Normalize for client safety
    const out = normalizeAdvisor(parsed);

    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: 'Advisor error', detail: String(e) });
  }
}

// ---- helpers ----
function safeJson(s) {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    // try to extract the first JSON block
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch {}
    }
    return { summary: s };
  }
}

function toArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  if (typeof v === 'string') {
    // split bullet points and lines
    return v.split(/\r?\n+/)
      .map(s => s.replace(/^\s*[-•\d\.\)]\s*/, '').trim())
      .filter(Boolean);
  }
  if (typeof v === 'object') {
    try {
      const vals = Object.values(v).flat();
      return vals.map(x => typeof x === 'string' ? x : JSON.stringify(x));
    } catch { return []; }
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
