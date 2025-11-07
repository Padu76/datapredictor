// pages\history3\index.jsx
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase';
import HistoryCard3 from '../../components/HistoryCard3';

export default function History3() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          setErr('Supabase non configurato');
          setBusy(false);
          return;
        }

        const { data, error } = await supabase
          .from('analyses')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        if (error) throw error;
        setItems(data || []);
      } catch (e) {
        setErr(String(e?.message || e));
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  return (
    <div className="container" style={{ padding: 24 }}>
      <div className="hero card" style={{ padding: 16, marginBottom: 16 }}>
        <h1 className="grad" style={{ margin: 0 }}>Storico Analisi</h1>
        <p className="hero-sub">Riapri le analisi salvate, consulta il forecast e il riepilogo dell'Advisor.</p>
        <div style={{ display:'flex', gap:8 }}>
          <Link className="ghost" href="/upload">← Torna a /upload</Link>
        </div>
      </div>

      {err && <div className="card" style={{ padding:12, marginBottom:12, color:'#f66' }}>{err}</div>}
      {busy && <div className="card" style={{ padding:12, marginBottom:12 }}>Caricamento…</div>}

      <div style={{ display:'grid', gap:12, gridTemplateColumns:'repeat(auto-fit, minmax(280px,1fr))' }}>
        {items.map(it => (
          <Link key={it.id} href={`/history3/${it.id}`} style={{ textDecoration:'none', color:'inherit' }}>
            <HistoryCard3 item={it} />
          </Link>
        ))}
        {(!items || items.length===0) && !busy && (
          <div className="card" style={{ padding: 16 }}>Nessuna analisi salvata.</div>
        )}
      </div>
    </div>
  );
}