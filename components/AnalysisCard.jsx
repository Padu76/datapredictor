'use client';

import dynamic from 'next/dynamic';
import { Chart as ChartJS, LineElement, CategoryScale, LinearScale, PointElement, Legend, Tooltip } from 'chart.js';
import Link from 'next/link';

const DynamicLine = dynamic(() => import('react-chartjs-2').then(m => m.Line), { ssr: false });

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Legend, Tooltip);

export default function AnalysisCard({ item }) {
  const f = item?.forecast?.forecast || [];
  const labels = f.map(r => r.date || String(r.index));
  const series = f.map(r => Number(r.y_hat_trend ?? r.y_hat_ma ?? 0));

  const data = {
    labels,
    datasets: [{ label: 'Forecast', data: series, borderWidth: 2, pointRadius: 0, tension: 0.2 }]
  };

  return (
    <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700 }}>{item.title || item.target || 'Analisi'}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{new Date(item.created_at).toLocaleString()}</div>
        </div>
        <Link href={`/history/${item.id}`} className="ghost">Apri</Link>
      </div>
      {f.length > 0 && (
        <div style={{ width: '100%', height: 140 }}>
          <DynamicLine data={data} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
        </div>
      )}
      {item?.advisor?.summary && (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>
          {item.advisor.summary.length > 160 ? item.advisor.summary.slice(0, 160) + '…' : item.advisor.summary}
        </div>
      )}
    </div>
  );
}
