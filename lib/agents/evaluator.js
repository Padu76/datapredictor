// lib/agents/evaluator.js
export async function run(ctx) {
  const warnings = [];
  const acts = [
    ...(ctx.actions?.short || []),
    ...(ctx.actions?.medium || []),
    ...(ctx.actions?.long || [])
  ];
  const textAll = acts.join(' ').toLowerCase();
  const hasNumbers = /\d+%|\b\d{2,}\b/.test(textAll);     // percentuali o numeri >= 2 cifre
  if (acts.length < 9) warnings.push({ code: 'FEW_ACTIONS', msg: 'Azioni insufficienti (minimo 9 in totale).' });
  if (!hasNumbers) warnings.push({ code: 'NO_NUMBERS', msg: 'Mancano numeri/percentuali nelle azioni.' });

  const narrativeLines = String(ctx.narrative || '').split(/\r?\n/).filter(Boolean).length;
  if (narrativeLines < 35) warnings.push({ code: 'NARRATIVE_SHORT', msg: 'Narrativa breve: servono 35+ righe.' });

  ctx.warnings = warnings;
  ctx.acceptable = warnings.length === 0;
  return ctx;
}
