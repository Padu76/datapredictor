// lib/connectors/googleSheets.js
export async function fetchPublicCSV(url) {
  if (!url) throw new Error('URL mancante');

  // se è un link Google Sheets, forziamo export=csv
  if (/docs.google.com\/spreadsheets/.test(url) && !/export\?format=csv/.test(url)) {
    const gid = (url.match(/gid=(\d+)/)||[])[1] || '0';
    const base = url.split('/edit')[0];
    url = `${base}/export?format=csv&gid=${gid}`;
  }

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch CSV fallito: ${r.status}`);
  const csvText = await r.text();

  // prova a usare il parser del progetto
  try {
    const mod = await import('../csv');
    const rows = mod.parseCSV ? mod.parseCSV(csvText) : mod.default?.parseCSV?.(csvText);
    if (Array.isArray(rows)) return rows;
  } catch (_) { /* fallback */ }

  // fallback minimal CSV → array di oggetti
  const lines = csvText.trim().split(/\r?\n/);
  const headers = lines.shift().split(',').map(h=>h.trim());
  const rows = lines.map(line => {
    const cols = line.split(','); const obj = {};
    headers.forEach((h,i)=> obj[h]=cols[i]);
    return obj;
  });
  return rows;
}
