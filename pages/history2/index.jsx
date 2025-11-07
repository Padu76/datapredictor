// pages/history2/index.jsx
import { useEffect, useState } from 'react';
import Link from 'next/link';
import HistoryCardPro from '../../components/HistoryCardPro';

// Client Supabase locale al file (no dipendenze esterne)
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function History2() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);
  const [normMsg, setNormMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
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

  const normalizeAll = async () => {
    try {
      setNormMsg('Normalizzazione in corso…');
      const r = await fetch('/api/history2/normalize', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Errore normalize');
      setNormMsg(`OK: normalizzati ${j.updated} record su ${j.total}.`);
    } catch (e) {
      setNormMsg('Errore: ' + (e.message || String(e)));
    } finally {
      // opzionale: refresh elenco
      const { data } = await supabase
        .from('analyses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      setItems(data || []);
    }
  };

  return (
    <div className="container" style={{ padding: 24 }}>
      <div className="hero card" style={{ padding: 16, marginBottom: 16 }}>
        <h1 className="grad" style={{ margin: 0 }}>Storico Analisi (nuovo)</h1>
        <p className="hero-sub">Elenco analisi con link al dettaglio /history2/[id].</p>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <Link className="ghost" href="/upload">← Torna a /upload</Link>
          <button className="primary" onClick={normalizeAll}>Normalizza record</button>
          {normMsg && <span className="hero-sub">{normMsg}</span>}
        </div>
      </div>

      {err && <div className="card" style={{ padding:12, marginBottom:12, color:'#f66' }}>{err}</div>}
      {busy && <div className="card" style={{ padding:12 }}>Caricamento…</div>}

      <div style={{ display:'grid', gap:12, gridTemplateColumns:'repeat(auto-fit, minmax(280px,1fr))' }}>
        {items.map(it => (
          <Link key={it.id} href={`/history2/${it.id}`} style={{ textDecoration:'none', color:'inherit' }}>
            <HistoryCardPro item={it} />
          </Link>
        ))}
        {(!items || items.length === 0) && !busy && (
          <div className="card" style={{ padding:16 }}>Nessuna analisi presente.</div>
        )}
      </div>
    </div>
  );
}
