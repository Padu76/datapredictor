// lib/agents/narrativeWriter.js
export async function run(ctx) {
  if (!process.env.OPENAI_API_KEY) {
    ctx.narrative = 'Configura OPENAI_API_KEY per generare il report discorsivo.';
    return ctx;
  }
  const minLines = 35;
  const domain = (ctx.domain || 'business').toLowerCase();
  let userPrompt = `Scrivi un report discorsivo lungo per il dominio ${domain}, almeno ${minLines} righe, ` +
                   `in paragrafi separati, con esempi numerici e riferimenti ai KPI; chiudi con una roadmap.`;
  if (ctx.retryHint?.reasons?.includes('NARRATIVE_SHORT')) {
    userPrompt += `\n\n*** OBBLIGO ***: Estendi oltre ${minLines} righe, aggiungi esempi numerici e milestone temporalizzate.`;
  }
  const ctxData = { target: ctx.target, dateCol: ctx.dateCol, kpi: ctx.kpi, actions: ctx.actions, forecast: ctx.forecast };

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Sei un consulente senior. Rispondi con testo piano, senza markdown.' },
        { role: 'user', content: `${userPrompt}\n\nContesto:\n${JSON.stringify(ctxData, null, 2)}` }
      ],
      temperature: 0.55
    })
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  ctx.narrative = (data?.choices?.[0]?.message?.content || '').trim();
  return ctx;
}
