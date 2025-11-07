// lib/orchestrator.js - Pipeline AI completa multi-agente
import OpenAI from 'openai';

// ==================== STATISTICHE COMPATTE ====================
export function compactStats(rows, target, dateCol) {
  if (!rows?.length || !target) return null;
  
  const vals = rows.map(r => parseFloat(r[target])).filter(v => !isNaN(v));
  if (!vals.length) return null;
  
  const sum = vals.reduce((a, b) => a + b, 0);
  const mean = sum / vals.length;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  
  const variance = vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / vals.length;
  const std = Math.sqrt(variance);
  const cv = mean !== 0 ? (std / mean) * 100 : 0;
  
  // Trend semplice (primo vs ultimo)
  const first = vals[0];
  const last = vals[vals.length - 1];
  const trendPct = first !== 0 ? ((last - first) / first) * 100 : 0;
  
  let trendLabel = 'stabile';
  if (trendPct > 15) trendLabel = 'crescita';
  else if (trendPct < -15) trendLabel = 'decrescita';
  
  // Volatilità
  let volatility = 'bassa';
  if (cv > 30) volatility = 'alta';
  else if (cv > 15) volatility = 'media';
  
  // Rischio base
  let risk = 50;
  if (cv > 30) risk = 75;
  else if (cv < 10) risk = 25;
  
  return {
    mean: mean.toFixed(2),
    min: min.toFixed(2),
    max: max.toFixed(2),
    std: std.toFixed(2),
    cv: cv.toFixed(2),
    count: vals.length,
    trendPct: trendPct.toFixed(2),
    trendLabel,
    volatility,
    risk
  };
}

// ==================== AGENTI AI ====================

// 1️⃣ DATA CLEANER - Analizza qualità dati
async function dataCleaner(openai, ctx) {
  const start = Date.now();
  try {
    const { rows, target, kpi } = ctx;
    
    const prompt = `Sei un Data Quality Analyst. Analizza questi dati:

Target: ${target}
Righe: ${kpi?.count || rows?.length || 0}
Media: ${kpi?.mean || 'N/A'}
Range: ${kpi?.min} - ${kpi?.max}
Std Dev: ${kpi?.std}
CV: ${kpi?.cv}%

Fornisci UNA singola raccomandazione pratica sulla qualità dei dati (max 100 caratteri).
Esempi: "Dati solidi, campione sufficiente" / "Pochi dati, aumentare campione 3x" / "Alta varianza, segmentare per cluster"`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 150
    });

    const quality = completion.choices[0].message.content.trim();
    
    return {
      ok: true,
      ms: Date.now() - start,
      quality
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - start, error: String(e) };
  }
}

// 2️⃣ DOMAIN PLANNER - Crea piano strategico per dominio
async function domainPlanner(openai, ctx) {
  const start = Date.now();
  try {
    const { domain, target, kpi } = ctx;
    
    const domainContext = {
      marketing: 'campagne, conversion rate, CAC, ROAS, engagement',
      sales: 'pipeline, deal velocity, win rate, ACV, churn',
      finance: 'revenue, EBITDA, cash flow, ROI, margins',
      business: 'KPI generali, crescita, efficienza operativa'
    };
    
    const context = domainContext[domain] || domainContext.business;
    
    const prompt = `Sei un ${domain.toUpperCase()} Strategist. Analizza:

Metrica: ${target}
Trend: ${kpi?.trendLabel || 'N/A'} (${kpi?.trendPct}%)
Volatilità: ${kpi?.volatility || 'N/A'}
Contesto: ${context}

Genera esattamente 12 azioni strategiche CONCRETE con NUMERI SPECIFICI:
- 4 azioni BREVE termine (1-3 mesi) - quick wins con KPI target
- 4 azioni MEDIO termine (3-6 mesi) - ottimizzazioni strutturali
- 4 azioni LUNGO termine (6+ mesi) - trasformazione strategica

FORMATO RICHIESTO (esempio):
BREVE:
- Ottimizza campagne Facebook: target +15-20% CTR con A/B test creatività 3 varianti
- Riduci CAC del 10-15% eliminando 2 canali peggiori e concentrando budget top 3
- Implementa lead scoring: +25-30% conversion qualificando lead >70 punti
- Test 5 nuove audience lookalike: espandi reach +40% mantenendo CPL sotto €8

MEDIO:
- Automation funnel: sales velocity +30% con 4 email sequences e 2 webinar mensili
- Partnership strategiche: 3-4 accordi per co-marketing, target +50K contatti/trimestre
- Content hub SEO: 25 articoli pillar, target 15K visite organiche/mese in 4 mesi
- CRM advanced: implementa predictive analytics per churn -20% e upsell +35%

LUNGO:
- AI personalization engine: dynamic content per +40-60% engagement e ROAS 4.5x
- Expansion 2 nuovi mercati: Italia+Francia, target €500K revenue Y1, break-even M8
- Brand repositioning: refresh identità, +80% brand awareness, NPS da 45 a 75
- Platform switch: migrate da HubSpot a custom stack, -€40K/anno, +50% flessibilità

OBBLIGATORIO: Ogni azione DEVE contenere numeri/percentuali/KPI specifici!`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1500
    });

    const text = completion.choices[0].message.content.trim();
    
    // Parsing manuale delle azioni
    const parseActions = (text, keyword) => {
      const regex = new RegExp(`${keyword}[:\\s]*([\\s\\S]*?)(?=(MEDIO|LUNGO|$))`, 'i');
      const match = text.match(regex);
      if (!match) return [];
      return match[1]
        .split(/\n/)
        .map(line => line.replace(/^[\s\-\•\*]+/, '').trim())
        .filter(line => line.length > 20 && /\d/.test(line)) // Filtra solo righe con numeri
        .slice(0, 4); // Max 4 per categoria
    };
    
    const short = parseActions(text, 'BREVE');
    const medium = parseActions(text, 'MEDIO');
    const long = parseActions(text, 'LUNGO');
    
    return {
      ok: true,
      ms: Date.now() - start,
      actions: { short, medium, long }
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - start, error: String(e) };
  }
}

// 3️⃣ RISK ANALYST - Analizza rischi e mitigation
async function riskAnalyst(openai, ctx) {
  const start = Date.now();
  try {
    const { kpi, target } = ctx;
    
    const prompt = `Sei un Risk Management Analyst. Analizza:

Metrica: ${target}
Volatilità: ${kpi?.volatility || 'N/A'} (CV: ${kpi?.cv}%)
Rischio base: ${kpi?.risk || 50}/100

Identifica esattamente 3 RISCHI CRITICI con PROBABILITÀ e IMPATTO:

FORMATO RICHIESTO:
- [ALTO 70%] Stagionalità Q4: -25-40% vendite, mitigazione: diversifica canali retail+B2B
- [MEDIO 45%] Competizione aggravata: rischio perdita 15-20% market share, azione: differenziazione prodotto
- [BASSO 20%] Dipendenza fornitore: rischio disruption supply, strategia: dual sourcing +2 vendor

Ogni rischio DEVE avere: probabilità %, impatto quantificato, azione di mitigazione specifica.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 400
    });

    const text = completion.choices[0].message.content.trim();
    const risks = text
      .split(/\n/)
      .map(line => line.replace(/^[\s\-\•\*]+/, '').trim())
      .filter(line => line.length > 30 && /\d/.test(line))
      .slice(0, 3);
    
    return {
      ok: true,
      ms: Date.now() - start,
      risks
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - start, error: String(e) };
  }
}

// 4️⃣ NARRATIVE WRITER - Report discorsivo esteso
async function narrativeWriter(openai, ctx) {
  const start = Date.now();
  try {
    const { target, kpi, domain, actions, risks, quality } = ctx;
    
    const actionsText = [
      ...(actions?.short || []).map((a, i) => `${i + 1}. ${a}`),
      ...(actions?.medium || []).map((a, i) => `${i + 1}. ${a}`),
      ...(actions?.long || []).map((a, i) => `${i + 1}. ${a}`)
    ].join('\n');
    
    const risksText = (risks || []).map((r, i) => `${i + 1}. ${r}`).join('\n');
    
    const prompt = `Sei un Business Consultant esperto. Scrivi un REPORT ESECUTIVO DETTAGLIATO di MINIMO 40 RIGHE.

CONTESTO ANALISI:
- Metrica: ${target}
- Dominio: ${domain}
- Trend: ${kpi?.trendLabel} (${kpi?.trendPct}%)
- Volatilità: ${kpi?.volatility}
- Qualità dati: ${quality || 'Buona'}

AZIONI STRATEGICHE IDENTIFICATE:
${actionsText}

RISCHI PRINCIPALI:
${risksText}

SCRIVI UN REPORT STRUTTURATO CON:

1️⃣ EXECUTIVE SUMMARY (3-4 paragrafi)
   - Situazione attuale con numeri chiave
   - Diagnosi principale (trend, opportunità, criticità)
   - Raccomandazione strategica prioritaria

2️⃣ ANALISI APPROFONDITA (10-15 paragrafi)
   - Breakdown dettagliato del trend e cause
   - Analisi comparativa vs benchmark settore
   - Opportunità di ottimizzazione immediate
   - Leve strategiche a medio-lungo termine
   - Esempi concreti e case study

3️⃣ ROADMAP IMPLEMENTAZIONE (8-12 paragrafi)
   - Quick wins (primi 30 giorni) con KPI target
   - Milestone trimestrali con metriche di successo
   - Resource allocation e budget indicativo
   - Risk mitigation plan dettagliato
   - Success metrics e dashboard KPI

4️⃣ NEXT STEPS OPERATIVI (5-8 paragrafi)
   - Azioni immediate (settimana 1)
   - Setup team e governance
   - Tool e tecnologie da implementare
   - Monitoring plan e review cadence

REQUISITI OBBLIGATORI:
✅ MINIMO 40 RIGHE (non paragrafi, RIGHE di testo!)
✅ Ogni paragrafo deve contenere NUMERI SPECIFICI (%, €, target KPI)
✅ Esempi pratici e actionable insights
✅ Tono professionale ma accessibile
✅ Usa elenchi puntati quando serve per chiarezza

INIZIA SUBITO CON IL REPORT (no introduzioni tipo "Ecco il report..."):`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 3000
    });

    const narrative = completion.choices[0].message.content.trim();
    
    return {
      ok: true,
      ms: Date.now() - start,
      narrative
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - start, error: String(e) };
  }
}

// 5️⃣ EVALUATOR - Valida output e genera warnings
function evaluator(ctx) {
  const warnings = [];
  const { actions, risks, narrative } = ctx;
  
  // Check 1: Numero azioni
  const totalActions = 
    (actions?.short?.length || 0) + 
    (actions?.medium?.length || 0) + 
    (actions?.long?.length || 0);
  
  if (totalActions < 9) {
    warnings.push({ 
      code: 'FEW_ACTIONS', 
      msg: `Solo ${totalActions} azioni trovate, target minimo 12` 
    });
  }
  
  // Check 2: Numeri nelle azioni
  const allActions = [
    ...(actions?.short || []),
    ...(actions?.medium || []),
    ...(actions?.long || [])
  ];
  
  const withNumbers = allActions.filter(a => /\d+[%€\+\-]/.test(a)).length;
  
  if (withNumbers < totalActions * 0.7) {
    warnings.push({ 
      code: 'NO_NUMBERS', 
      msg: `Solo ${withNumbers}/${totalActions} azioni hanno numeri specifici` 
    });
  }
  
  // Check 3: Lunghezza narrative
  const lines = (narrative || '').split('\n').filter(l => l.trim().length > 20);
  
  if (lines.length < 35) {
    warnings.push({ 
      code: 'NARRATIVE_SHORT', 
      msg: `Report troppo breve: ${lines.length} righe (minimo 35)` 
    });
  }
  
  const acceptable = warnings.length === 0;
  
  return { acceptable, warnings };
}

// ==================== PIPELINE PRINCIPALE ====================
export async function runPipeline(ctx) {
  const logs = [];
  let result = { ...ctx };
  
  // Check API key
  if (!process.env.OPENAI_API_KEY) {
    return {
      ...ctx,
      acceptable: false,
      warnings: [{ code: 'NO_API_KEY', msg: 'OPENAI_API_KEY non configurato' }],
      logs: [{ step: 'init', ok: false, error: 'Missing API key' }]
    };
  }
  
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  // STEP 1: Data Cleaner
  const cleanerRes = await dataCleaner(openai, result);
  logs.push({ step: 'dataCleaner', ...cleanerRes });
  if (cleanerRes.ok) result.quality = cleanerRes.quality;
  
  // STEP 2: Domain Planner (azioni strategiche)
  const plannerRes = await domainPlanner(openai, result);
  logs.push({ step: 'domainPlanner', ...plannerRes });
  if (plannerRes.ok) result.actions = plannerRes.actions;
  
  // STEP 3: Risk Analyst
  const riskRes = await riskAnalyst(openai, result);
  logs.push({ step: 'riskAnalyst', ...riskRes });
  if (riskRes.ok) result.risks = riskRes.risks;
  
  // STEP 4: Narrative Writer (report esteso)
  const narrativeRes = await narrativeWriter(openai, result);
  logs.push({ step: 'narrativeWriter', ...narrativeRes });
  if (narrativeRes.ok) result.narrative = narrativeRes.narrative;
  
  // STEP 5: Evaluator
  const evaluation = evaluator(result);
  result.acceptable = evaluation.acceptable;
  result.warnings = evaluation.warnings;
  
  result.logs = logs;
  result.summary = `Analisi ${ctx.domain} su ${ctx.target}: ${result.quality || 'Completata'}`;
  
  return result;
}
