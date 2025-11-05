'use client';

import Papa from 'papaparse';
import { useCallback, useRef, useState } from 'react';

export default function CsvDropzone({ onData }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const parseFile = useCallback((file) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (res) => onData((res.data || []).filter(Boolean)),
      error: (err) => alert('Errore parsing CSV: ' + err.message),
    });
  }, [onData]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) parseFile(file);
  };

  const onChange = (e) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className="card"
      style={{
        border: `2px dashed var(--border)`,
        padding: 24,
        textAlign: 'center',
        cursor: 'pointer',
        background: dragOver ? 'rgba(56,189,248,.06)' : 'var(--card-bg)',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={onChange}
      />
      <div style={{ fontWeight: 700, marginBottom: 8 }}>
        Trascina qui il CSV o clicca per selezionarlo
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 14 }}>
        Serve l’intestazione sulla prima riga
      </div>
    </div>
  );
}
