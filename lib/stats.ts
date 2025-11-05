export function summarizeStats(rows, col) {
  const vals = rows.map(r => Number(r[col])).filter(v => Number.isFinite(v));
  if (!vals.length) return { min: 0, max: 0, mean: 0, std: 0, cv: 0, growthPct: 0 };
  const n = vals.length;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n);
  const cv = std / (mean || 1);
  const growthPct = ((vals[n - 1] - mean) / (mean || 1)) * 100;
  return { min, max, mean: round(mean), std: round(std), cv, growthPct };
}
function round(x, d = 3) { const p = 10 ** d; return Math.round(x * p) / p; }
