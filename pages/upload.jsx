import { useMemo, useRef, useState } from 'react';
import SmartUpload from '../components/SmartUpload';
import DataPreview from '../components/DataPreview';
import ForecastChart from '../components/ForecastChart';
import AdvisorReport from '../components/AdvisorReport';
import AdvisorProPanel from '../components/AdvisorProPanel';
import { summarizeStats } from '../lib/stats';
import { computeForecast } from '../lib/forecast';
import { exportAnalysisPDF } from '../lib/pdf';
import { hasSupabase, saveAnalysis } from '../lib/storage';
import { analyzeWithAdvisor } from '../lib/advisor';

export default function UploadPage() {
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [target, setTarget] = useState('');
  const [dateCol, setDateCol] = useState('');
  const [result, setResult] = useState(null);
  const [advisor, setAdvisor] = useState(null);
  const [msg, setMsg] = useState('');
  const pdfRef = useRef(null);

  const stats = useMemo(() => (target ? summarizeStats(rows, target) : null), [rows, target]);

  const onParsed = ({ rows, inferred }) => {
    setRows(rows);
    const cols = Object.keys(rows?.[0] || {});
    setColumns(cols);
    setTarget(inferred?.target || '');
    setDateCol(inferred?.dateCol || '');
    setResult(null); setAdvisor(null);
  };

  const runAnalysis = () => {
    if (!rows.length || !target) return;
    const out = computeForecast(rows, { target, dateCol, horizon: 12, window: 5 });
    setResult(out);
    const adv = analyzeWithAdvisor(rows, { target, dateCol });
    setAdvisor(adv);
  };

  const onExportPDF = async () => {
    const el = pdfRef.current;
    if (!el) return;
    await exportAnalysisPDF(el, 'DataPredictor-Report.pdf');
  };

  const onSave = async () => {
    try {
      if (!hasSupabase()) { setMsg('Supabase non configurato.'); return; }
      if (!result || !advisor) { setMsg('Esegui analisi prima di salvare.'); return; }
      const row = await saveAnalysis({
        title: `Analisi ${target}`,
        target, date_col: dateCol,
        stats, forecast: result, advisor,
        file_meta: { rows: rows.length }
      });
      setMsg('Analisi salvata: ' + row.id);
    } catch (e) {
      setMsg('Errore salvataggio: ' + (e.message || String(e)));
    }
  };

  return (
    <div className="container" style={{ paddingTop: 24, paddingBottom: 24 }}>
      <div className="hero card" style={{ padding: 16, marginBottom: 16 }}>
        <h1 className="grad" style={{ margin: 0 }}>Upload intelligente (CSV/XLS/XLSX)</h1>
        <p className="hero-sub">Carica un file senza pensieri: riconosciamo automaticamente Data e Target.</p>
      </div>

      <SmartUpload onParsed={onParsed} />

      {rows.length > 0 && (
        <>
          <div className="section" style={{ paddingTop: 24, paddingBottom: 24 }} ref={pdfRef}>
            <DataPreview rows={rows.slice(0, 50)} />

            <div className="card" style={{ padding: 16, marginTop: 12 }}>
              <div className="toolbar">
                <div style={{ minWidth: 220 }}>
                  <label>Colonna target</label>
                  <select value={target} onChange={e => setTarget(e.target.value)}>
                    <option value="">— seleziona —</option>
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ minWidth: 220 }}>
                  <label>Colonna data (opzionale)</label>
                  <select value={dateCol} onChange={e => setDateCol(e.target.value)}>
                    <option value="">— nessuna —</option>
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <button className="primary" onClick={runAnalysis}>Analizza & Consiglia</button>
                </div>
              </div>

              {stats && (
                <div className="kpis">
                  <div><div className="kpi-title">Min</div><div className="kpi-value">{stats.min}</div></div>
                  <div><div className="kpi-title">Max</div><div className="kpi-value">{stats.max}</div></div>
                  <div><div className="kpi-title">Media</div><div className="kpi-value">{stats.mean}</div></div>
                  <div><div className="kpi-title">Dev. std</div><div className="kpi-value">{stats.std}</div></div>
                </div>
              )}
            </div>

            {result && (
              <div className="card" style={{ padding: 16, marginTop: 12 }}>
                <ForecastChart target={target} dateCol={dateCol} rows={rows} forecast={result.forecast} />
              </div>
            )}

            {advisor && <AdvisorReport advisor={advisor} />}
          </div>

          <div style={{ display:'flex', gap: 12, marginTop: 12, flexWrap:'wrap' }}>
            <button className="ghost" onClick={onExportPDF}>Esporta PDF</button>
            <button className="ghost" onClick={onSave}>Salva su Storico</button>
            <a className="ghost" href="/history3">Vai allo storico</a>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontWeight:700, marginBottom:6 }}>Consulenza PRO (AI)</div>
              <p className="hero-sub" style={{ marginTop:0 }}>Se vuoi un piano d’azione potenziato, genera l’analisi AI.</p>
              <AdvisorProPanel rows={rows} target={target} dateCol={dateCol} />
            </div>
          </div>

          {msg && <div className="card" style={{ padding:12, marginTop:12 }}>{msg}</div>}
        </>
      )}
    </div>
  );
}
