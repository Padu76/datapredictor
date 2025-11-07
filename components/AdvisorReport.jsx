// components\AdvisorReport.jsx
export default function AdvisorReport({ advisor }) {
  const a = advisor || {};

  // Helper per convertire qualsiasi valore in stringa renderizzabile
  const toRenderable = (v) => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'object') {
      try {
        return JSON.stringify(v);
      } catch {
        return '—';
      }
    }
    return '—';
  };

  const arrayify = (v) => {
    if (Array.isArray(v)) return v;
    if (!v) return [];
    if (typeof v === 'string') return [v];
    if (typeof v === 'number' || typeof v === 'boolean') return [String(v)];
    if (typeof v === 'object') {
      try {
        // Se è un oggetto tipo {0:'a',1:'b'} o {x:['a','b']}
        const vals = Object.values(v).flat();
        return vals.map(x => (typeof x === 'string' ? x : JSON.stringify(x)));
      } catch {
        return [];
      }
    }
    return [];
  };

  const shortActions = arrayify(a?.horizonActions?.short || a?.actions?.short);
  const mediumActions = arrayify(a?.horizonActions?.medium || a?.actions?.medium);
  const longActions = arrayify(a?.horizonActions?.long || a?.actions?.long);

  const Summary = () => (
    <div className="card" style={{ padding: 16, marginTop: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Sintesi</div>
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{toRenderable(a.summary)}</div>
    </div>
  );

  const List = ({ title, items }) => (
    <div className="card" style={{ padding: 16, marginTop: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ color: 'var(--muted)' }}>Nessun elemento</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {items.map((it, idx) => <li key={idx} style={{ marginBottom: 6 }}>{toRenderable(it)}</li>)}
        </ul>
      )}
    </div>
  );

  return (
    <div className="section" style={{ paddingTop: 12, paddingBottom: 12 }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px,1fr))', gap: 12 }}>
          <div>
            <div className="kpi-title">Stato</div>
            <div className="kpi-value">{toRenderable(a.tone || a.health)}</div>
          </div>
          <div>
            <div className="kpi-title">Rischio</div>
            <div className="kpi-value">{toRenderable(a.risk)}</div>
          </div>
        </div>
      </div>

      <Summary />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px,1fr))', gap: 12 }}>
        <List title="Azioni Breve" items={shortActions} />
        <List title="Azioni Medio" items={mediumActions} />
        <List title="Azioni Lungo" items={longActions} />
      </div>

      {Array.isArray(a?.risks) && a.risks.length > 0 && (
        <div className="card" style={{ padding: 16, marginTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Rischi & Attenzioni</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {a.risks.map((it, idx) => <li key={idx} style={{ marginBottom: 6 }}>{toRenderable(it)}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}