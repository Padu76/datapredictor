# DataPredictor – MVP (no mock)

Monorepo pronto per GitHub:
- **apps/web** (Next.js) – upload CSV e chiamata API reale
- **apps/api** (FastAPI) – analisi CSV reale (KPI 30gg, trend, anomalie, forecast MA)
- **supabase/** (placeholder per migrazioni quando abilitiamo Auth/Storage)

## Deploy rapido
1) **Backend (Render/Fly)**: directory `apps/api`
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Env: `ALLOWED_ORIGINS=http://localhost:3000,https://<preview>.vercel.app,https://app.tuodominio.com`
2) **Frontend (Vercel)**: Root `apps/web`
   - Env: `NEXT_PUBLIC_API_BASE_URL=https://<nome-servizio>.onrender.com`
3) Testa: apri la webapp, carica CSV con colonna data + importo (o price+qty).

## CSV minimo
Colonne riconosciute (case-insensitive):
- **Data**: `date`, `data`, `giorno`, `timestamp`, `order_date`, `created_at`
- **Importo**: `amount`, `revenue`, `ricavo`, `price`, `prezzo`, `total`, `totale`
- In alternativa calcola da `price * qty`.

## Note
- Niente dati finti: tutto ciò che vedi è calcolato sui tuoi CSV.
- Excel/XLSX verrà aggiunto dopo (ora solo CSV).
