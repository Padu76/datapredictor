import { useEffect, useState } from 'react';
import { hasSupabase, listAnalyses } from '../lib/storage';

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!hasSupabase()) {
      setErr('Supabase non configurato. Aggiungi NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.');
      return;
    }
    listAnalyses().then(setItems).catch(e => setErr(String(e.message||e)));
  }, []);

  return (
    <div className="container" style={{ padding: 24 }}>
      <h1 className="grad">Storico Analisi</h1>
      {err && <div className="card" style={{ padding:12, marginTop:12, color:'#f66' }}>{err}</div>}
      <div style={{ display:'grid', gap:12, gridTemplateColumns:'repeat(auto-fit, minmax(280px,1fr))', marginTop: 12 }}>
        {items.map(it => (
          <div key={it.id} className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight:700 }}>{it.title || it.target}</div>
            <div style={{ color:'var(--muted)', fontSize: 12, marginTop:6 }}>{new Date(it.created_at).toLocaleString()}</div>
            <pre style={{ fontSize: 12, whiteSpace:'pre-wrap', marginTop:8, maxHeight:150, overflow:'auto' }}>{JSON.stringify(it.stats, null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
