import { summarizeStats } from './stats';
import { computeForecast } from './forecast';

/**
 * Analisi "consulente" che interpreta i dati e propone azioni.
 * Ritorna:
 *  - summary: string
 *  - trend: { slope, label, growthPct }
 *  - volatility: { cv, label }
 *  - health: 'eccellente'|'buona'|'attenzione'|'critica'
 *  - risk: 0..100
 *  - horizonActions: { short:string[], medium:string[], long:string[] }
 */
export function analyzeWithAdvisor(rows, { target, dateCol }) {
  if (!rows?.length || !target) {
    return { summary: 'Dati insufficienti', trend: { slope: 0, label: 'sconosciuto', growthPct: 0 }, volatility: { cv: 0, label: 'sconosciuta' }, health: 'attenzione', risk: 50, horizonActions: { short: [], medium: [], long: [] } };
  }

  const stats = summarizeStats(rows, target);
  const { forecast, insight } = computeForecast(rows, { target, dateCol, horizon: 12, window: 5 });

  // Ricava la pendenza dal testo "insight" e ricalcola meglio
  const y = rows.map(r => Number(r[target])).filter(v => Number.isFinite(v));
  const slope = olsSlope(y);

  const trendLabel = slope > 0.0001 ? 'crescente' : slope < -0.0001 ? 'decrescente' : 'piatto';
  const cv = stats.cv ?? 0;
  const volLabel = cv < 0.1 ? 'bassa' : cv < 0.25 ? 'media' : 'alta';

  // Growth pct già calcolato su ultimo vs media
  const growthPct = stats.growthPct ?? 0;

  // Punteggio di salute & rischio
  // logica semplice: trend up + bassa volatilità = salute alta, rischio basso
  let health = 'buona';
  let risk = 50;
  if (trendLabel === 'crescente' && cv < 0.15 && growthPct > 3) { health = 'eccellente'; risk = 20; }
  else if (trendLabel === 'crescente' && cv <= 0.3) { health = 'buona'; risk = 35; }
  else if (trendLabel === 'piatto' && cv <= 0.25) { health = 'attenzione'; risk = 55; }
  else if (trendLabel === 'decrescente' && cv > 0.2) { health = 'critica'; risk = 75; }
  else { health = 'attenzione'; risk = 60; }

  // Azioni consigliate
  const actions = suggestActions({ trendLabel, cv, growthPct });

  const summary = buildSummary({ trendLabel, slope, cv, growthPct, health, risk });

  return {
    summary,
    trend: { slope: round(slope, 4), label: trendLabel, growthPct: round(growthPct, 2) },
    volatility: { cv: round(cv, 3), label: volLabel },
    health,
    risk,
    horizonActions: actions,
    forecastInsight: insight,
    forecastSample: forecast.slice(0, 6)
  };
}

function olsSlope(y) {
  const n = y.length;
  const x = Array.from({ length: n }, (_, i) => i + 1);
  const meanX = x.reduce((a,b)=>a+b,0)/n;
  const meanY = y.reduce((a,b)=>a+b,0)/n;
  let num=0, den=0;
  for (let i=0;i<n;i++){ num += (x[i]-meanX)*(y[i]-meanY); den += (x[i]-meanX)**2; }
  return den === 0 ? 0 : num/den;
}

function suggestActions({ trendLabel, cv, growthPct }) {
  const short = [], medium = [], long = [];

  if (trendLabel === 'crescente') {
    short.push('Aumenta leggermente la spesa sul canale top performer (A/B test 10–20%).');
    short.push('Proteggi margine: rivedi sconti/promo con soglia minima.');
    medium.push('Amplia la capacità (stock/servizio) per evitare colli di bottiglia.');
    medium.push('Espandi 1 nuovo canale con ROI atteso > 1.5x rispetto attuale.');
    long.push('Diversifica l’offerta: nuova linea/prodotto complementare.');
  } else if (trendLabel === 'piatto') {
    short.push('Micro-ottimizzazioni CRO (landing, checkout) per +2–5% conversione.');
    short.push('Ribilancia il budget verso campagne con CPA più basso.');
    medium.push('Sperimenta una promo “back-in-motion” per stimolare domanda.');
    medium.push('Analizza segmenti poco penetrati e crea offerte mirate.');
    long.push('Ricerca di mercato per differenziazione di prodotto e pricing.');
  } else { // decrescente
    short.push('Stop/pausa delle campagne con ROI < 1.0; ridistribuisci budget.');
    short.push('Sonda cause: churn, prezzo, qualità lead, saturazione canale.');
    medium.push('Piano di recupero: bundle, upsell, retention program.');
    medium.push('Riposizionamento messaggi: enfatizza value proposition.');
    long.push('Ripensamento go-to-market: nuovi canali/partnership strategiche.');
    long.push('Roadmap prodotto: feature “must-have” secondo feedback clienti.');
  }

  if (cv >= 0.25) {
    short.push('Stabilizza la domanda: calendario promo meno “a picchi” e più continuo.');
    medium.push('Riduci variabilità: forecast rolling e riordini più frequenti.');
    long.push('Automazioni data-driven per inventory e pianificazione (MRP leggero).');
  } else if (cv < 0.1 && trendLabel === 'crescente') {
    short.push('Spingi sulla scalabilità: incrementa graduale del 10–15% il budget best performer.');
  }

  if (growthPct > 8 && trendLabel === 'crescente') {
    medium.push('Fissa un target di crescita trimestrale e KPI settimanali di progresso.');
  } else if (growthPct < -3) {
    short.push('Allerta: stabilisci una review weekly per diagnosticare cause (prezzi, concorrenza, prodotto).');
  }

  return { short, medium, long };
}

function buildSummary({ trendLabel, slope, cv, growthPct, health, risk }) {
  const pieces = [];
  pieces.push(`Trend ${trendLabel} (pendenza ~ ${round(slope, 4)}).`);
  pieces.push(`Volatilità ${cv < 0.1 ? 'bassa' : cv < 0.25 ? 'media' : 'alta'} (CV=${round(cv,3)}).`);
  pieces.push(`Scostamento ultimo vs media: ${round(growthPct,2)}%.`);
  pieces.push(`Stato complessivo: ${health.toUpperCase()} — rischio ${risk}/100.`);
  return pieces.join(' ');
}

function round(x, d=2){ const p = 10**d; return Math.round(x*p)/p; }
