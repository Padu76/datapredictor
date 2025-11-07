// pages/api/advice.js
import { runPipeline, compactStats } from '../../lib/orchestrator.js';

function buildRetryHint(warnings = []) {
  const codes = new Set(warnings.map(w => w.code));
  const parts = [];
  const reasons = [];
  if (codes.has('FEW_ACTIONS')) {
    parts.push('Aggiungi almeno **12 azioni totali**: 4 Breve, 4 Medio, 4 Lungo.');
    reasons.push('FEW_ACTIONS');
  }
  if (codes.has('NO_NUMBERS')) {
    parts.push('Ogni azione deve includere **numeri** (KPI/range): es. +5–8% CR, -10–15% CPA.');
    reasons.push('NO_NUMBERS');
  }
  if (codes.has('NARRATIVE_SHORT')) {
    parts.push('Scrivi **35+ righe** con paragrafi, esempi numerici e **milestone** temporalizzate.');
    reasons.push('NARRATIVE_SHORT');
  }
  if (!parts.length) return null;
  return { text: 'Correggi e rigenera:\n- ' + parts.join('\n- '), reasons };
}

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { rows = [], target = '', dateCol = '', domain = 'business', stats = null } = req.body || {};
    if (!rows?.length || !target) return res.status(400).json({ error: 'rows[] and target are required' });

    const kpi = stats || compactStats(rows, target, dateCol);

    // 1° passaggio
    let ctx = await runPipeline({ rows, target, dateCol, domain, kpi, retryHint: null });

    // retry guidato (1 volta) se l'evaluator boccia l'output
    let retryApplied = false;
    let retryReasons = [];
    if (ctx && ctx.acceptable === false && process.env.OPENAI_API_KEY) {
      const hint = buildRetryHint(ctx.warnings || []);
      retryReasons = hint?.reasons || [];
      if (retryReasons.length) {
        retryApplied = true;
        ctx = await runPipeline({ rows, target, dateCol, domain, kpi, retryHint: hint });
      }
    }

    // normalizzazione output
    const fixArr = v =>
      Array.isArray(v) ? v :
      (typeof v === 'string' ? v.split(/\r?\n+/).map(s => s.trim()).filter(Boolean) : []);
    const out = {
      summary: ctx?.summary || '',
      tone: ctx?.tone || null,
      risk: ctx?.risk ?? kpi?.risk ?? null,
      horizonActions: {
        short: fixArr(ctx?.actions?.short),
        medium: fixArr(ctx?.actions?.medium),
        long: fixArr(ctx?.actions?.long),
      },
      risks: fixArr(ctx?.risks),
      narrative: ctx?.narrative || '',
      logs: ctx?.logs || [],
      warnings: ctx?.warnings || [],
      acceptable: ctx?.acceptable ?? true,
      retryApplied,
      retryReasons
    };

    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: 'Advisor error', detail: String(e) });
  }
}
