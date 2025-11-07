// lib/agents/domainPlanner.js
export async function run(ctx) {
  if (!process.env.OPENAI_API_KEY) {
    ctx.actions = ctx.actions || { short: [], medium: [], long: [] };
    ctx.actions.short.push('Configura OPENAI_API_KEY per la consulenza PRO.');
    return ctx;
  }
  const domain = (ctx.domain || 'business').toLowerCase();
  const brief = {
    marketing: "Marketing: ROAS, CPA, CPL, CR%, retention; mix paid/organic e creatività.",
    sales: "Sales: pipeline, win-rate, CAC payback, pricing, cicli, upsell/cross-sell.",
    finance: "Finance: ricavi, costi, margini, cassa, LTV/CAC, MRR/ARR, budget.",
    business: "Business: efficienza, crescita sostenibile, processi, staffing."
  }[domain] || "Business.";

  const compact = {
    target: ctx.target, dateCol: ctx.dateCol, kpi: ctx.kpi, sample: (ctx.rows || []).slice(0, 60)
  };

  let user = `${brief}\n\nKPI & Dati:\n${JSON.stringify(compact, null, 2)}\n\n` +
    `Task: rispondi SOLO in JSON valido con chiavi {summary, tone, risk, horizonActions{short,medium,long}, risks[]}. ` +
    `Ogni azione deve essere concreta e includere numeri (KPI/range).`;

  if (ctx.retryHint?.text) {
    user += `\n\n*** CORREZIONI OBBLIGATORIE ***\n${ctx.retryHint.text}`;
  }

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `Sei un consulente ${domain} senior. Rispondi SOLO in JSON valido.` },
        { role: 'user', content: user }
      ],
      temperature: 0.5
    })
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  const content = data?.choices?.[0]?.message?.content || '{}';

  const j = safeJson(content);
  const toArr = v => Array.isArray(v) ? v :
    (typeof v === 'string' ? v.split(/\r?\n+/).map(s=>s.replace(/^\s*[-•\d\.)]\s*/,'').trim()).filter(Boolean) :
      (v && typeof v === 'object' ? Object.values(v).flat() : []));
  ctx.actions = {
    short: toArr(j?.horizonActions?.short || j?.actions?.short),
    medium: toArr(j?.horizonActions?.medium || j?.actions?.medium),
    long: toArr(j?.horizonActions?.long || j?.actions?.long),
  };
  ctx.risks = toArr(j?.risks || j?.watchouts);
  ctx.tone = j?.tone || null;
  ctx.risk = j?.risk ?? ctx.kpi?.risk ?? null;
  return ctx;
}

function safeJson(s) {
  try { return JSON.parse(s); } catch (e) {}
  const m = s?.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return {};
}
