export function inferSchema(rows) {
  if (!rows?.length) return {};
  const cols = Object.keys(rows[0]);
  const schema = {};
  for (const c of cols) {
    const sample = rows.slice(0, 20).map(r => r[c]).filter(v => v !== null && v !== undefined);
    const asNum = sample.filter(v => typeof v === 'number' || (!isNaN(Number(v))));
    const asDate = sample.filter(v => typeof v === 'string' && !isNaN(Date.parse(v)));
    if (asDate.length >= sample.length * 0.7) schema[c] = 'date';
    else if (asNum.length >= sample.length * 0.7) schema[c] = 'number';
    else schema[c] = 'string';
  }
  return schema;
}
