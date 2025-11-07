// pages/api/ingest/sheets.js
import { fetchPublicCSV } from '../../lib/connectors/googleSheets';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { url } = req.query || {};
    if (!url) return res.status(400).json({ error: 'Missing url' });

    const rows = await fetchPublicCSV(decodeURIComponent(url));
    return res.status(200).json({ rows, count: rows.length });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
