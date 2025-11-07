export default function Home() {
  return (
    <div className="container" style={{ padding: 24 }}>
      <div className="hero card" style={{ padding: 24, marginBottom: 16 }}>
        <h1 className="grad" style={{ margin: 0 }}>DataPredictor</h1>
        <p className="hero-sub">Carica CSV/XLSX, analizza i dati e ottieni un report consulenziale.</p>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginTop: 12 }}>
          <a className="primary" href="/upload">🚀 Upload & Advisor</a>
          <a className="ghost" href="/history3">📚 Storico Analisi</a>
        </div>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Come iniziare</h3>
        <ol>
          <li>Vai su <a className="ghost" href="/upload">/upload</a> e carica un file.</li>
          <li>Seleziona target e (opzionale) data.</li>
          <li>Genera forecast e <b>Advisor</b>; esporta PDF o salva nello storico.</li>
        </ol>
      </div>
    </div>
  );
}
