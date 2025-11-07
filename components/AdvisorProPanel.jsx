// components/AdvisorProPanel.jsx
'use client';
import { useState } from 'react';

// questi moduli li hai già nel progetto
import { summarizeStats } from '../lib/stats';          // TS ok, Next risolve
import { analyzeWithAdvisor } from '../lib/advisor';    // baseline locale
import { exportAdvisorPlusPDF } from '../lib/pdf';      // PDF unificato

export default function AdvisorProPanel({ rows = [], target = '', dateCol = '' }) {
  const [ai, setAI] = useState(null);
  const [base, setBase] = useState(null);
  const [unified, setUnified] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [domain, setDomain] = useState('marketing');
  const [showPipeline, setShowPipeline] = useState(false);

  const run = async () => {
    try {
      setBusy(true); setMsg('Analisi PRO in corso…');
      const stats = target ? summarizeStats(rows, target) : null;
      const baseline = analyzeWithAdvisor(rows, { target, dateCol });
      setBase(baseline);

      const r = await fetch('/api/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, target, dateCol, stats, domain })
      });
      if (!r.ok) throw new Error(await r.text());
      const aiOut = await r.json();
      setAI(aiOut);

      const uni = mergeAdvisors(baseline, aiOut);
      setUnified(uni);
      setMsg(aiOut.retryApplied ? 'Retry guidato applicato automaticamente.' : '');
    } catch (e) {
      setMsg('Advisor API error: ' + (e.message || String(e)));
    } finally {
      setBusy(false);
    }
  };

  const onExportPDF = async () => {
    try {
      await exportAdvisorPlusPDF({
        target, dateCol, domain,
        baseline: base, ai, unified,
        narrative: ai?.narrative || ''
      });
    } catch (e) {
      alert('Errore export PDF: ' + (e.message || String(e)));
    }
  };

  return (
    <div>
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:8 }}>
        <div>
          <label style={{ fontSize:12, color:'var(--muted)' }}>Dominio</label><br/>
          <select value={domain} onChange={e=>setDomain(e.target.value)}>
            <option value="marketing">Marketing</option>
            <option value="sales">Sales</option>
            <option value="finance">Finance</option>
            <option value="business">Business</option>
          </select>
        </div>

        <button className="primary" onClick={run} disabled={busy || !target || !rows.length}>
          {busy ? 'Generazione…' : 'Genera Consulenza PRO (AI)'}
        </button>

        {(ai || unified) && (
          <button className="ghost" onClick={onExportPDF}>Esporta PDF (Unificato)</button>
        )}

        {(ai?.logs?.length > 0) && (
          <label style={{ marginLeft: 8 }}>
            <input type="checkbox" checked={showPipeline} onChange={e=>setShowPipeline(e.target.checked)} />
            {' '}Mostra pipeline (dev)
          </label>
        )}
      </div>

      {msg && <div style={{ marginTop:8, color: ai?.acceptable ? '#888' : '#f66' }}>{msg}</div>}

      {ai?.warnings?.length > 0 && (
        <div className="card" style={{ padding:12, marginTop:12 }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>Qualità output</div>
          <ul style={{ margin:0, paddingLeft: 18 }}>
            {ai.warnings.map((w,i)=>(<li key={i}>{w.code || w}</li>))}
          </ul>
          {ai.retryApplied && ai.retryReasons?.length > 0 && (
            <div className="hero-sub" style={{ marginTop:6 }}>
              Retry guidato applicato per: {ai.retryReasons.join(', ')}
            </div>
          )}
        </div>
      )}

      {(ai || base) && (
        <div className="card" style={{ padding: 16, marginTop: 12 }}>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
            <strong>Advisor Report</strong>
            <span className="tag">Trend: {base?.trendLabel || '—'}</span>
            <span className="tag">Volatilità: {base?.volatility || '—'}</span>
            <span className="tag">Salute: {base?.health || '—'}</span>
            <span className="tag">Rischio: {base?.risk ?? '—'}</span>
            <span className="tag">Dominio: {domain}</span>
          </div>

          {unified && (
            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              <div style={{ fontWeight:700, marginBottom:6 }}>Advisor Unificato</div>
              <GridActions data={unified} />
            </div>
          )}

          {ai && (
            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              <div style={{ fontWeight:700, marginBottom:6 }}>Consulenza PRO (AI)</div>
              <GridActions data={ai} />
              {ai?.narrative && (
                <div style={{ marginTop:12, whiteSpace:'pre-wrap', lineHeight:1.5 }}>
                  <div style={{ fontWeight:700, marginBottom:4 }}>Report discorsivo</div>
                  {ai.narrative}
                </div>
              )}
            </div>
          )}

          {showPipeline && ai?.logs?.length > 0 && (
            <div className="card" style={{ padding: 12, marginTop: 12 }}>
              <div style={{ fontWeight:700, marginBottom:6 }}>Pipeline</div>
              <table style={{ width:'100%', fontSize:12 }}>
                <thead><tr><th align="left">Step</th><th>OK</th><th>ms</th><th align="left">Errore</th></tr></thead>
                <tbody>
                  {ai.logs.map((l,i)=>(<tr key={i}>
                    <td>{l.step}</td><td align="center">{l.ok ? '✓' : '✗'}</td>
                    <td align="right">{l.ms}</td><td>{l.error||''}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GridActions(a) {
  const short = (a?.horizonActions?.short) || [];
  const medium = (a?.horizonActions?.medium) || [];
  const long = (a?.horizonActions?.long) || [];
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px,1fr))', gap: 12 }}>
      <CardList title="Breve (1–3 mesi)" items={short} />
      <CardList title="Medio (3–6 mesi)" items={medium} />
      <CardList title="Lungo (6+ mesi)" items={long} />
    </div>
  );
}

function CardList({ title, items }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: 'var(--card-bg)' }}>
      <div style={{ fontWeight:700, marginBottom:6 }}>{title}</div>
      {(!items || items.length === 0) ? <div className="hero-sub">—</div> : (
        <ul style={{ margin:0, paddingLeft: 18 }}>
          {items.map((it, idx) => <li key={idx} style={{ marginBottom: 6 }}>{String(it)}</li>)}
        </ul>
      )}
    </div>
  );
}

function mergeAdvisors(base, ai) {
  const out = {
    summary: ai?.summary || base?.summary || '',
    tone: ai?.tone || null,
    risk: ai?.risk ?? base?.risk ?? null,
    horizonActions: { short: [], medium: [], long: [] }
  };
  function uniq(arr) {
    const s = new Set(); const out = [];
    (arr||[]).forEach(x => { const k = String(x).trim(); if (k && !s.has(k)) { s.add(k); out.push(k); } });
    return out;
  }
  const b = normalizeBase(base);
  out.horizonActions.short = uniq([...(b.short||[]), ...(ai?.horizonActions?.short||[])]);
  out.horizonActions.medium = uniq([...(b.medium||[]), ...(ai?.horizonActions?.medium||[])]);
  out.horizonActions.long = uniq([...(b.long||[]), ...(ai?.horizonActions?.long||[])]);
  return out;
}
function normalizeBase(base) {
  if (!base) return {};
  const short = toArray(base?.shortActions || base?.actions?.short || base?.horizonActions?.short);
  const medium = toArray(base?.mediumActions || base?.actions?.medium || base?.horizonActions?.medium);
  const long = toArray(base?.longActions || base?.actions?.long || base?.horizonActions?.long);
  return { short, medium, long };
}
function toArray(v){
  if (Array.isArray(v)) return v;
  if (!v) return [];
  if (typeof v === 'string') return v.split(/\r?\n+/).map(s=>s.replace(/^\s*[-•\d\.\)]\s*/,'').trim()).filter(Boolean);
  if (typeof v === 'object') { try { return Object.values(v).flat(); } catch { return []; } }
  return [String(v)];
}
