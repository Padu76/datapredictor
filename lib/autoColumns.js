const DATE_HINTS = ['date','data','giorno','day','week','mese','month','period','time'];
/** Return { dateCol, target } inferred from rows */
export function inferColumns(rows) {
  if (!rows?.length) return { dateCol: '', target: '' };
  const cols = Object.keys(rows[0] || {});

  // detect date column by name first
  let dateCol = cols.find(c => DATE_HINTS.some(h => c.toLowerCase().includes(h)));
  // fallback: detect values parseable as dates for majority
  if (!dateCol) {
    for (const c of cols) {
      const sample = take(rows, 30).map(r => r[c]).filter(v => v !== null && v !== undefined && v !== '');
      const asDate = sample.filter(v => canBeDate(v));
      if (sample.length && asDate.length / sample.length >= 0.7) { dateCol = c; break; }
    }
  }

  // detect target: most "useful" numeric column (not the date)
  let numericScores = [];
  for (const c of cols) {
    if (c === dateCol) continue;
    const vals = rows.map(r => num(r[c])).filter(isFinite);
    if (vals.length < Math.min(10, rows.length * 0.3)) continue;
    const mean = vals.reduce((a,b)=>a+b,0) / (vals.length || 1);
    const std = Math.sqrt(vals.reduce((s,v)=>s + Math.pow(v-mean,2), 0) / (vals.length || 1));
    const cv = std / (mean || 1);
    // score: prefer higher variance but not crazy sparse
    const score = (std || 0) * (vals.length / rows.length);
    numericScores.push({ c, score, cv });
  }
  numericScores.sort((a,b)=>b.score - a.score);
  const target = numericScores[0]?.c || '';

  return { dateCol: dateCol || '', target: target || '' };
}

function take(arr, n){ return arr.slice(0, Math.min(n, arr.length)); }
function canBeDate(v) {
  if (v instanceof Date) return !isNaN(v.getTime());
  if (typeof v === 'number') return false;
  const s = String(v).trim();
  if (!s) return false;
  // Accept ISO-like and dd/mm/yyyy-like
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return !isNaN(Date.parse(s));
  if (/^\d{2}[\/-]\d{2}[\/-]\d{4}$/.test(s)) {
    const [d, m, y] = s.split(/[\/\-]/).map(Number);
    const dt = new Date(y, m-1, d);
    return dt && (dt.getMonth()+1) === m && dt.getDate() === d;
  }
  return !isNaN(Date.parse(s));
}
function num(v){ const n = Number(v); return Number.isFinite(n) ? n : NaN; }
