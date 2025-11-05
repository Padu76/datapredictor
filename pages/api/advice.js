export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { rows, target, dateCol, domain = 'marketing' } = req.body || {};
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Missing OPENAI_API_KEY (server env).' });
    }
    if (!rows?.length || !target) {
      return res.status(400).json({ error: 'rows[] and target are required' });
    }

    // Basic stats summary to feed the model
    const vals = rows.map(r => Number(r[target])).filter(v => Number.isFinite(v));
    const n = vals.length;
    const mean = n ? vals.reduce((a,b)=>a+b,0)/n : 0;
    const min = n ? Math.min(...vals) : 0;
    const max = n ? Math.max(...vals) : 0;

    const system = `You are a senior ${domain} and finance advisor. You read numeric time-series and produce an actionable plan. Always answer in Italian. Return strict JSON with keys: summary, actions:{short,medium,long}, risks[], kpis[], tone.`;

    const user = {
      instruction: "Generate an advisor report for this dataset",
      meta: { target, dateCol, domain },
      stats: { n, mean, min, max },
      sample: rows.slice(0, 50)
    };

    const payload = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) }
      ],
      temperature: 0.4,
      response_format: { type: "json_object" }
    };

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const t = await resp.text();
      return res.status(500).json({ error: "OpenAI error", detail: t });
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    let parsed;
    try { parsed = JSON.parse(content); } catch (e) { parsed = { summary: content }; }
    return res.status(200).json(parsed);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Advisor failed', detail: String(err) });
  }
}
