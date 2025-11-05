import { useState } from 'react';
import { getAdvisorPro } from '../lib/advisorPro';
import AdvisorReport from './AdvisorReport';

export default function AdvisorProPanel({ rows, target, dateCol }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const run = async () => {
    setLoading(true); setError('');
    try {
      const res = await getAdvisorPro({ rows, target, dateCol, domain: 'marketing' });
      setData(res);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ padding: 16, marginTop: 12 }}>
      <div style={{ display:'flex', gap:12, alignItems:'center' }}>
        <button className="primary" onClick={run} disabled={loading}>
          {loading ? 'Generazione consulenza…' : 'Genera Consulenza PRO (AI)'}
        </button>
        {error && <span style={{ color:'#f66' }}>{error}</span>}
      </div>

      {data && (
        <div style={{ marginTop: 12 }}>
          <AdvisorReport advisor={{
            summary: data.summary || '—',
            trend: { label: '—', slope: 0, growthPct: 0 },
            volatility: { cv: 0, label: '—' },
            health: data.tone === 'cautious' ? 'attenzione' : 'buona',
            risk: 50,
            horizonActions: data.actions || { short:[], medium:[], long:[] },
            forecastSample: []
          }} />
        </div>
      )}
    </div>
  );
}
