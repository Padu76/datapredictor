export default function AdvisorReport({ advisor }) {
  if (!advisor) return null;

  const Pill = ({ label, tone='default' }) => (
    <span style={{
      display:'inline-block', padding:'4px 10px', borderRadius: 999,
      background: tone==='good' ? 'rgba(34,197,94,.15)' : tone==='warn' ? 'rgba(234,179,8,.15)' : tone==='bad' ? 'rgba(239,68,68,.15)' : 'rgba(255,255,255,.06)',
      border: '1px solid var(--border)', fontSize:12
    }}>{label}</span>
  );

  const tone = advisor.health === 'eccellente' ? 'good' : advisor.health === 'critica' ? 'bad' : advisor.health === 'attenzione' ? 'warn' : 'default';

  return (
    <div className="card" style={{ padding: 16, marginTop: 12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom: 8 }}>
        <h3 style={{ margin:0, fontWeight:700 }}>Advisor Report</h3>
        <Pill label={`Trend: ${advisor.trend.label}`} />
        <Pill label={`Volatilità: ${advisor.volatility.label}`} />
        <Pill label={`Salute: ${advisor.health}`} tone={tone} />
        <Pill label={`Rischio: ${advisor.risk}/100`} tone={tone} />
      </div>
      <p style={{ color:'var(--muted)', marginTop: 4 }}>{advisor.summary}</p>

      <div style={{ display:'grid', gap:12, gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', marginTop: 12 }}>
        <div className="card" style={{ padding:12 }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>Breve (1–3 mesi)</div>
          <ul style={{ margin:0, paddingLeft: '1.2em' }}>
            {advisor.horizonActions.short.map((a,i)=>(<li key={i} style={{ marginBottom:6 }}>{a}</li>))}
          </ul>
        </div>
        <div className="card" style={{ padding:12 }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>Medio (3–6 mesi)</div>
          <ul style={{ margin:0, paddingLeft: '1.2em' }}>
            {advisor.horizonActions.medium.map((a,i)=>(<li key={i} style={{ marginBottom:6 }}>{a}</li>))}
          </ul>
        </div>
        <div className="card" style={{ padding:12 }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>Lungo (6+ mesi)</div>
          <ul style={{ margin:0, paddingLeft: '1.2em' }}>
            {advisor.horizonActions.long.map((a,i)=>(<li key={i} style={{ marginBottom:6 }}>{a}</li>))}
          </ul>
        </div>
      </div>

      <details style={{ marginTop:12 }}>
        <summary className="ghost" style={{ cursor:'pointer', padding:'6px 10px', display:'inline-block' }}>Dettagli forecast (anteprima)</summary>
        <pre style={{ marginTop:8, fontSize:12, background:'rgba(0,0,0,.4)', padding:12, borderRadius:8, overflowX:'auto' }}>
{JSON.stringify(advisor.forecastSample, null, 2)}
        </pre>
      </details>
    </div>
  );
}
