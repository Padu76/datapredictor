// lib/agents/featureEngineer.js
export async function run(ctx) {
  const rows = ctx.rows || [];
  const t = ctx.target;

  const vals = rows.map(r => Number(r[t])).filter(Number.isFinite);
  const n = vals.length;
  const mean = n ? vals.reduce((a,b)=>a+b,0)/n : 0;
  const std = n ? Math.sqrt(vals.reduce((s,v)=>s+(v-mean)**2,0)/n) : 0;
  const cv = mean ? std/mean : 0;
  const trend = (n > 1 && vals[0]) ? (vals[n-1]-vals[0])/vals[0] : 0;

  // media mobile semplice (finestra 3)
  const ma = [];
  for (let i=0;i<n;i++){
    const w = vals.slice(Math.max(0,i-2), i+1);
    ma.push(w.reduce((a,b)=>a+b,0)/w.length);
  }

  ctx.features = { n, mean, std, cv, trend, ma };
  ctx.kpi = ctx.kpi || {};
  ctx.kpi.cv = cv;
  ctx.kpi.trend = trend;
  ctx.trendLabel = trend > 0 ? 'crescente' : (trend < 0 ? 'decrescente' : 'stabile');
  return ctx;
}
