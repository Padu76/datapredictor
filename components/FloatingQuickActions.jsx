'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function FloatingQuickActions() {
  const [open, setOpen] = useState(false);

  const btnStyle = {
    border: '1px solid var(--border)',
    background: 'linear-gradient(135deg, rgba(99,102,241,.25), rgba(56,189,248,.25))',
    color: 'white',
    fontWeight: 700,
    borderRadius: 999,
    padding: '10px 14px',
    cursor: 'pointer'
  };

  return (
    <div style={{ position:'fixed', right:16, bottom:16, zIndex:9999 }}>
      {open && (
        <div className="card" style={{ padding: 12, marginBottom: 8, minWidth: 220 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <Link href="/upload" className="primary" style={{ textAlign:'center' }}>🚀 Upload & Advisor</Link>
            <Link href="/history" className="ghost" style={{ textAlign:'center' }}>📚 Storico Analisi</Link>
          </div>
        </div>
      )}
      <button onClick={() => setOpen(v => !v)} style={btnStyle}>
        {open ? 'Chiudi' : 'Azioni rapide'}
      </button>
    </div>
  );
}
