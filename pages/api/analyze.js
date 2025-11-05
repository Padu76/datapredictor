export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    // Compat: accetta payload legacy e lo traduce in quello dell'Advisor PRO locale
    const body = req.body || {};
    const rows = body.rows || body.data || [];
    const target = body.target || body.metric || body.column;
    const dateCol = body.dateCol || body.date || body.time || null;

    if (!rows?.length || !target) {
      return res.status(400).json({ error: 'rows[] and target are required (compat /analyze)' });
    }

    // Forward alla nostra API locale /api/advice
    const forwardUrl = (process.env.NEXT_PUBLIC_SITE_URL ? process.env.NEXT_PUBLIC_SITE_URL : '') + '/api/advice';
    const resp = await fetch(forwardUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, target, dateCol, domain: body.domain || 'marketing' })
    });

    if (!resp.ok) {
      const t = await resp.text();
      return res.status(500).json({ error: 'Advisor forward failed', detail: t });
    }

    const data = await resp.json();
    // Risposta compat: formato atteso da alcune UI legacy
    return res.status(200).json({
      ok: true,
      advisor: data,
      meta: { source: 'compat-analyze', target, dateCol }
    });
  } catch (e) {
    return res.status(500).json({ error: 'Compat analyze failed', detail: String(e) });
  }
}
