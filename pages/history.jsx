import { useEffect, useState } from 'react';
import { hasSupabase, listAnalyses } from '../lib/storage';
import AnalysisCard from '../components/AnalysisCard';

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (!hasSupabase()) { setErr('Supabase non configurato.'); setLoading(false); return; }
        const data = await listAnalyses(50);
        setItems(data || []);
      } catch (e) {
        setErr(String(e.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="container" style={{ padding: 24 }}>
      <div className="hero card" style={{ padding: 16, marginBottom: 16 }}>
        <h1 className="grad" style={{ margin: 0 }}>Storico Analisi</h1>
        <p className="hero-sub">Riapri le analisi salvate, consulta il forecast e il riepilogo dell’Advisor.</p>
      </div>

      {err && <div className="card" style={{ padding:12, marginBottom:12, color:'#f66' }}>{err}</div>}
      {loading && <div className="card" style={{ padding:12 }}>Caricamento…</div>}

      <div style={{ display:'grid', gap:12, gridTemplateColumns:'repeat(auto-fit, minmax(280px,1fr))' }}>
        {items.map(it => <AnalysisCard key={it.id} item={it} />)}
      </div>

      {!loading && items.length === 0 && !err && (
        <div className="card" style={{ padding: 12, marginTop: 12 }}>
          Nessuna analisi salvata. Vai su <a className="ghost" href="/upload">/upload</a> per crearne una.
        </div>
      )}
    </div>
  );
}
