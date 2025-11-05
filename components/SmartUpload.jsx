'use client';

import { useCallback, useRef, useState } from 'react';
import { parseAnyFile } from '../lib/parsers';
import { inferColumns } from '../lib/autoColumns';

export default function SmartUpload({ onParsed }) {
  const [dragOver, setDragOver] = useState(false);
  const [hint, setHint] = useState('Trascina CSV/XLS/XLSX o clicca');
  const inputRef = useRef(null);

  const parseFile = useCallback(async (file) => {
    try {
      setHint('Parsing in corso…');
      const rows = await parseAnyFile(file);
      const inferred = inferColumns(rows);
      onParsed({ rows, inferred });
      setHint('Fatto! Puoi caricare un altro file.');
    } catch (e) {
      alert('Errore parsing: ' + (e.message || String(e)));
      setHint('Trascina CSV/XLS/XLSX o clicca');
    }
  }, [onParsed]);

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
        border: '2px dashed var(--border)',
        padding: 24,
        textAlign: 'center',
        cursor: 'pointer',
        background: dragOver ? 'rgba(56,189,248,.06)' : 'var(--card-bg)',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,.xlsx,text/csv"
        style={{ display: 'none' }}
        onChange={onChange}
      />
      <div style={{ fontWeight: 700, marginBottom: 8 }}>
        {hint}
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 14 }}>
        L’app riconosce automaticamente la colonna Data e la colonna Target.
      </div>
    </div>
  );
}
