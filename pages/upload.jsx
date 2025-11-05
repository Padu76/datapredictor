import { useMemo, useState } from 'react';
import CsvDropzone from '../components/CsvDropzone';
import DataPreview from '../components/DataPreview';
import ForecastChart from '../components/ForecastChart';
import { inferSchema } from '../lib/csv';
import { summarizeStats } from '../lib/stats';
import { computeForecast } from '../lib/forecast';
import { analyzeWithAdvisor } from '../lib/advisor';

export default function UploadPage() {
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [target, setTarget] = useState('');
  const [dateCol, setDateCol] = useState('');
  const [result, setResult] = useState(null);
  const [advisor, setAdvisor] = useState(null);

  const schema = useMemo(() => inferSchema(rows), [rows]);
  const stats = useMemo(() => (target ? summarizeStats(rows, target) : null), [rows, target]);

  const onData = (data) => {
    setRows(data);
    setColumns(Object.keys(data?.[0] || {}));
    setTarget(''); setDateCol(''); setResult(null); setAdvisor(null);
  };

  const runAnalysis = () => {
    if (!rows.length || !target) return;
    const out = computeForecast(rows, { target, dateCol, horizon: 12, window: 5 });
    setResult(out);
    const adv = analyzeWithAdvisor(rows, { target, dateCol });
    setAdvisor(adv);
  };

  const exportCsv = () => {
    if (!result?.forecast) return;
    const header = ['index','date','y_hat_ma','y_hat_trend'];
    const lines = [header.join(',')];
    result.forecast.forEach((r) => {
      lines.push([r.index, r.date ?? '', r.y_hat_ma, r.y_hat_trend].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'forecast.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container" style={{ paddingTop: 24, paddingBottom: 24 }}>
      <div className="hero card" style={{ padding: 16, marginBottom: 16 }}>
        <h1 className="grad" style={{ margin: 0 }}>Upload, Forecast & Advisor</h1>
        <p className="hero-sub">Carica un CSV, ottieni grafico/forecast e un report consulenziale con azioni per breve, medio e lungo periodo.</p>
      </div>

      <CsvDropzone onData={onData} />

      {rows.length > 0 && (
        <>
          <div className="section" style={{ paddingTop: 24, paddingBottom: 24 }}>
            <DataPreview rows={rows.slice(0, 50)} />
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
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
            <>
              <ForecastChart target={target} dateCol={dateCol} rows={rows} forecast={result.forecast} />
              <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap:'wrap' }}>
                <button className="ghost" onClick={exportCsv}>Scarica forecast CSV</button>
              </div>
            </>
          )}

          {advisor && (
            <>
              <div style={{ height: 8 }} />
              <div className="divider" />
            </>
          )}
        </>
      )}

      {advisor && (
        <>
          <div style={{ marginTop: 12 }}>
            {/** Advisor Report */}
            {require('../components/AdvisorReport').default({ advisor })}
          </div>
        </>
      )}
    </div>
  );
}
