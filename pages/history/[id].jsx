import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getAnalysis, hasSupabase } from '../../lib/storage';
import ForecastChart from '../../components/ForecastChart';
import AdvisorReport from '../../components/AdvisorReport';

export default function AnalysisDetail() {
  const router = useRouter();
  const { id } = router.query || {};
  const [item, setItem] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        if (!hasSupabase()) { setErr('Supabase non configurato.'); setLoading(false); return; }
        const row = await getAnalysis(id);
        setItem(row);
      } catch (e) {
        setErr(String(e.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const back = () => router.push('/history');

  const target = item?.target || '—';
  const dateCol = item?.date_col || '—';
  const rowsCount = item?.file_meta?.rows ?? item?.file_meta?.count ?? '—';

  return (
    <div className="container" style={{ padding: 24 }}>
      <div className="hero card" style={{ padding: 16, marginBottom: 16 }}>
        <h1 className="grad" style={{ margin: 0 }}>{item?.title || 'Analisi'}</h1>
        <p className="hero-sub">{item?.created_at ? new Date(item.created_at).toLocaleString() : ''}</p>
        <button className="ghost" onClick={back}>← Torna allo storico</button>
      </div>

      {err && <div className="card" style={{ padding:12, marginBottom:12, color:'#f66' }}>{err}</div>}
      {loading && <div className="card" style={{ padding:12 }}>Caricamento…</div>}

      {item && (
        <>
          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px,1fr))', gap: 8 }}>
              <div><div className="kpi-title">Target</div><div className="kpi-value">{target}</div></div>
              <div><div className="kpi-title">Colonna data</div><div className="kpi-value">{dateCol}</div></div>
              <div><div className="kpi-title">Righe</div><div className="kpi-value">{rowsCount}</div></div>
            </div>
          </div>

          {item.forecast?.forecast && (
            <div className="card" style={{ padding: 16, marginBottom: 12 }}>
              <ForecastChart rows={[]} target={item.target} dateCol={item.date_col} forecast={item.forecast.forecast} />
            </div>
          )}

          {item.advisor && <AdvisorReport advisor={item.advisor} />}

          <div className="card" style={{ padding: 12, marginTop: 12 }}>
            <details>
              <summary className="ghost">Vedi JSON completo</summary>
              <pre style={{ fontSize: 12, overflow:'auto' }}>{JSON.stringify(item, null, 2)}</pre>
            </details>
          </div>
        </>
      )}
    </div>
  );
}
