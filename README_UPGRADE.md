# DataPredictor — Upgrade SUPER

Questo pacchetto aggiunge:
- **Advisor PRO (AI)** via API Route `/api/advice` (usa `OPENAI_API_KEY` lato server).
- **Salvataggio analisi** su Supabase (`lib/storage.js`) + pagina `/history`.
- **Export PDF** del report con `html2canvas` + `jspdf`.
- **UI aggiornata** su `/upload` con pulsanti Esporta/Salva e pannello Advisor PRO.

## Installazione

1. Copia le cartelle `pages/`, `components/`, `lib/` nella root del progetto (sostituisci file se richiesto).
2. Installa le dipendenze:
   ```bash
   npm i html2canvas jspdf @supabase/supabase-js
   ```
3. Imposta le variabili ambiente su Vercel:
   - `OPENAI_API_KEY` (Server)
   - `NEXT_PUBLIC_SUPABASE_URL` (Client)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Client)

4. (Opzionale) Crea la tabella Supabase:
```sql
create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text,
  target text,
  date_col text,
  stats jsonb,
  forecast jsonb,
  advisor jsonb,
  file_meta jsonb,
  created_at timestamp default now()
);
```

## Uso
- `/upload`: carica CSV, scegli target (numerico), esegui **Analizza & Consiglia**.
- **Esporta PDF**: salva un PDF brandizzato della sezione.
- **Salva su Storico**: persiste analisi su Supabase.
- `/history`: consulta le analisi salvate.

## Sicurezza
- `OPENAI_API_KEY` **mai** in `NEXT_PUBLIC_*` — resta lato server.
- Le chiavi Supabase **anon** possono stare lato client; la `service_role` mai nel client.
