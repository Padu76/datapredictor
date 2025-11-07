
export default function HistoryCard3({ item }) {
  const title = item?.title || `Analisi ${item?.target || ''}`;
  const date = item?.created_at ? new Date(item.created_at).toLocaleString() : '';
  const summary = item?.summary || item?.advisor?.summary || '';
  return (
    <div className="card" style={{ padding: 16, cursor:'pointer' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div style={{ fontWeight:700 }}>{title}</div>
        <div className="hero-sub" style={{ fontSize:12 }}>{date}</div>
      </div>
      <div className="hero-sub">{summary || '—'}</div>
    </div>
  );
}
