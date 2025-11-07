// lib/agents/forecaster.js
export async function run(ctx) {
  const rows = ctx.rows || [];
  const t = ctx.target;
  const vals = rows.map(r => Number(r[t])).filter(Number.isFinite);
  const n = vals.length;
  if (!n) { ctx.forecast = { method:'none', points: [] }; return ctx; }

  // prendi ultima MA (se presente) o media
  const base = (ctx.features?.ma?.length ? ctx.features.ma[ctx.features.ma.length-1] : null)
    ?? (vals.reduce((a,b)=>a+b,0)/n);

  // proietta 15 step piatti + piccolo drift dal trend
  const drift = (ctx.features?.trend || 0) * (base/10);
  const points = Array.from({length:15}, (_,i)=> Math.max(0, base + (i+1)*drift));

  ctx.forecast = { method: 'moving-average', window_days: 15, points };
  return ctx;
}
