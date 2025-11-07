// components/HistoryCardPro.jsx
export default function HistoryCardPro({ item }) {
  const date = item?.created_at ? new Date(item.created_at).toLocaleString() : '';
  const synth =
    item?.summary ||
    item?.advisor?.summary ||
    (item?.kpi ? `Trend ~ ${Number(item.kpi?.trend || 0).toFixed(3)}  •  CV ~ ${Number(item.kpi?.cv || 0).toFixed(3)}` : '');

  return (
    <div className="card" style={{ padding: 16, cursor:'pointer', height:'100%' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div style={{ fontWeight:700 }}>{item?.title || `Analisi ${item?.target || ''}`}</div>
        <div className="hero-sub" style={{ fontSize:12 }}>{date}</div>
      </div>
      <div className="hero-sub" style={{ marginTop:4 }}>
        {synth || '—'}
      </div>
    </div>
  );
}
