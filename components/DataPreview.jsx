export default function DataPreview({ rows }) {
  if (!rows?.length) return null;
  const cols = Object.keys(rows[0]);

  return (
    <div className="card" style={{ overflow: 'auto' }}>
      <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
        <thead style={{ background: 'rgba(255,255,255,.05)' }}>
          <tr>
            {cols.map(c => (
              <th key={c} style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 700, borderBottom: `1px solid var(--border)` }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 ? 'rgba(255,255,255,.04)' : 'transparent' }}>
              {cols.map(c => (
                <td key={c} style={{ padding: '8px 12px', whiteSpace: 'nowrap', borderBottom: `1px solid var(--border)` }}>
                  {String(r[c] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
