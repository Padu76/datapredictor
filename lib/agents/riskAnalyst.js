// lib/agents/riskAnalyst.js
export async function run(ctx) {
  const cv = Math.abs(ctx.kpi?.cv ?? 0);      // volatilità relativa
  const trend = ctx.kpi?.trend ?? 0;          // >0 meglio
  // rischio base da volatilità (clamp a 1.5)
  const volScore = Math.min(cv/0.5, 1.5) * 60; // fino a ~90
  // bonus/malus trend
  const trendAdj = trend >= 0 ? Math.max(0, 20 - trend*50) : Math.min(30, 30 + trend*100);
  const risk = Math.max(0, Math.min(100, Math.round(volScore + trendAdj)));

  ctx.kpi = { ...(ctx.kpi||{}), risk };
  ctx.risk = risk;
  ctx.summary = ctx.summary || `Volatilità ~ ${(cv*100).toFixed(1)}%, trend ${(trend*100).toFixed(1)}%.`;
  return ctx;
}
