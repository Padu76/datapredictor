export function computeForecast(rows, opts) {
  const { target, dateCol, horizon = 12, window = 5 } = opts;
  const y = rows.map(r => Number(r[target])).filter(v => Number.isFinite(v));
  const dates = dateCol ? rows.map(r => String(r[dateCol])) : rows.map((_, i) => String(i + 1));

  const ma = movingAverage(y, window);
  const lastMA = ma[ma.length - 1] ?? y[y.length - 1];
  const { a, b } = olsTrend(y);

  const startIndex = y.length + 1;
  const forecast = Array.from({ length: horizon }).map((_, i) => {
    const idx = startIndex + i;
    const y_hat_ma = lastMA;
    const y_hat_trend = a + b * idx;
    const date = dateCol ? nextDate(dates[dates.length - 1], i + 1) : String(idx);
    return { index: idx, date, y_hat_ma: round(y_hat_ma), y_hat_trend: round(y_hat_trend) };
  });

  const insight = buildInsight(y, b);
  return { forecast, insight };
}

function movingAverage(arr, k) {
  if (k <= 1) return arr.slice();
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - k + 1);
    const slice = arr.slice(start, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}
function olsTrend(y) {
  const n = y.length;
  const x = Array.from({ length: n }, (_, i) => i + 1);
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (x[i] - meanX) * (y[i] - meanY); den += (x[i] - meanX) ** 2; }
  const b = den === 0 ? 0 : num / den;
  const a = meanY - b * meanX;
  return { a, b };
}
function nextDate(last, step) {
  const t = Date.parse(last); if (isNaN(t)) return '';
  const d = new Date(t); d.setDate(d.getDate() + step);
  return d.toISOString().slice(0, 10);
}
function round(x, d = 2) { const p = 10 ** d; return Math.round(x * p) / p; }
function buildInsight(y, slope) {
  const dir = slope > 0 ? 'crescente' : slope < 0 ? 'decrescente' : 'piatta';
  const vol = volatility(y);
  return `Trend ${dir} (pendenza ~ ${round(slope, 4)}). Volatilità ${vol.label} (CV=${round(vol.cv,3)}).`;
}
function volatility(y) {
  const n = y.length;
  const mean = y.reduce((a, b) => a + b, 0) / (n || 1);
  const std = Math.sqrt(y.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n || 1));
  const cv = std / (mean || 1);
  const label = cv < 0.1 ? 'bassa' : cv < 0.25 ? 'media' : 'alta';
  return { cv, label };
}
