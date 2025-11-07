// pages/history2/[id].jsx
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function History2Detail() {
  const router = useRouter();
  const { id } = router.query || {};
  const [item, setItem] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('analyses')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw error;
        setItem(data || null);
      } catch (e) {
        setErr(String(e?.message || e));
      } finally {
        setBusy(false);
      }
    })();
  }, [id]);

  const back = () => router.push('/history2');

  return (
    <div className="container" style={{ padding: 24 }}>
      <div className="hero card" style={{ padding: 16, marginBottom: 16 }}>
        <h1 className="grad" style={{ margin: 0 }}>{item?.title || 'Analisi'}</h1>
        <p className="hero-sub">{item?.created_at ? new Date(item.created_at).toLocaleString() : ''}</p>
        <button className="ghost" onClick={back}>← Torna allo storico</button>
      </div>

      {err && <div className="card" style={{ padding:12, marginBottom:12, color:'#f66' }}>{err}</div>}
      {busy && <div className="card" style={{ padding:12 }}>Caricamento…</div>}

      {item && (
        <>
          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px,1fr))', gap: 8 }}>
              <div><div className="kpi-title">Target</div><div className="kpi-value">{item?.target || '—'}</div></div>
              <div><div className="kpi-title">Colonna data</div><div className="kpi-value">{item?.date_col || '—'}</div></div>
              <div><div className="kpi-title">Righe</div><div className="kpi-value">{item?.file_meta?.rows ?? item?.file_meta?.count ?? '—'}</div></div>
            </div>
          </div>

          {item?.advisor && (
            <div className="card" style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ fontWeight:700, marginBottom:6 }}>Advisor (AI)</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px,1fr))', gap:12 }}>
                <Block title="Breve (1–3 mesi)" arr={item.advisor?.horizonActions?.short} />
                <Block title="Medio (3–6 mesi)" arr={item.advisor?.horizonActions?.medium} />
                <Block title="Lungo (6+ mesi)" arr={item.advisor?.horizonActions?.long} />
              </div>

              {item.advisor?.narrative && (
                <div style={{ marginTop:12, whiteSpace:'pre-wrap', lineHeight:1.5 }}>
                  <div className="kpi-title" style={{ fontWeight:700, marginBottom:6 }}>Report discorsivo (AI)</div>
                  {item.advisor.narrative}
                </div>
              )}
            </div>
          )}

          {item?.advisor?.logs?.length > 0 && (
            <div className="card" style={{ padding: 12, marginTop: 12 }}>
              <div style={{ fontWeight:700, marginBottom:6 }}>Pipeline</div>
              <table style={{ width:'100%', fontSize:12 }}>
                <thead><tr><th align="left">Step</th><th>OK</th><th>ms</th><th align="left">Errore</th></tr></thead>
                <tbody>
                  {item.advisor.logs.map((l,i)=>(
                    <tr key={i}>
                      <td>{l.step}</td><td align="center">{l.ok ? '✓' : '✗'}</td>
                      <td align="right">{l.ms}</td><td>{l.error||''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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

function Block({ title, arr }) {
  const list = Array.isArray(arr) ? arr : [];
  return (
    <div style={{ padding: 12, borderRadius: 12, background: 'var(--card-bg)' }}>
      <div style={{ fontWeight:700, marginBottom:6 }}>{title}</div>
      {list.length === 0 ? <div className="hero-sub">—</div> : (
        <ul style={{ margin:0, paddingLeft:18 }}>
          {list.map((x,i) => <li key={i} style={{ marginBottom:6 }}>{String(x)}</li>)}
        </ul>
      )}
    </div>
  );
}
