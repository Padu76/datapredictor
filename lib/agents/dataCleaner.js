// lib/agents/dataCleaner.js
export async function run(ctx) {
  const rows = Array.isArray(ctx.rows) ? ctx.rows : [];
  const target = ctx.target;
  const dateCol = ctx.dateCol || null;

  const clean = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;

    const out = { ...r };

    // numerico target
    if (target in out) {
      const v = Number(String(out[target]).replace(',', '.'));
      if (Number.isFinite(v)) out[target] = v; else continue;
    } else {
      continue;
    }

    // parse data opzionale
    if (dateCol && (dateCol in out)) {
      const d = new Date(out[dateCol]);
      if (!isNaN(d.getTime())) out[dateCol] = d.toISOString().slice(0, 10);
    }

    clean.push(out);
  }

  ctx.rows = clean;
  ctx.cleanInfo = { kept: clean.length, dropped: (rows.length - clean.length) };
  return ctx;
}
