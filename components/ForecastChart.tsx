'use client';

import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, LineElement, CategoryScale, LinearScale, PointElement, Legend, Tooltip
} from 'chart.js';

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Legend, Tooltip);

export default function ForecastChart({ rows, target, dateCol, forecast }) {
  const x = rows.map((_, i) => i + 1);
  const y = rows.map(r => Number(r[target]));
  const labels = dateCol ? rows.map(r => String(r[dateCol])) : x.map(String);

  const data = {
    labels: [...labels, ...forecast.map(f => f.date ?? String(f.index))],
    datasets: [
      { label: 'Storico', data: y, borderWidth: 2, tension: 0.2 },
      { label: 'Forecast (MA)', data: [...Array(y.length).fill(null), ...forecast.map(f => f.y_hat_ma)], borderWidth: 2, borderDash: [6, 4], tension: 0.2 },
      { label: 'Forecast (Trend)', data: [...Array(y.length).fill(null), ...forecast.map(f => f.y_hat_trend)], borderWidth: 2, borderDash: [2, 4], tension: 0.2 }
    ]
  };

  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Grafico & Forecast</h3>
      <Line data={data} options={{ responsive: true, plugins: { legend: { display: true } } }} />
    </div>
  );
}
