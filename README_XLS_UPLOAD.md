# Smart Upload (CSV/XLS/XLSX) + Auto Column Inference

Questo pacchetto aggiunge:
- parsing **CSV/XLS/XLSX** (SheetJS)
- riconoscimento automatico **colonna Data** e **Target**

## Installazione
1. Copia le cartelle `lib/`, `components/`, `pages/` nella root del progetto (sostituisci `pages/upload.jsx`).
2. Installa la dipendenza:
   ```bash
   npm i xlsx
   ```
3. Avvia:
   ```bash
   npm run dev
   ```

## Uso
- Carica un file CSV/XLS/XLSX: la app precompila **Data** e **Target**.
- Puoi sempre cambiare manualmente dai menu a tendina.
