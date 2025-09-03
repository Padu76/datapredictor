# README – Deploy Backend (FastAPI) su Render

1) **New → Web Service** su Render → collega repo → Root Directory: `apps/api` → Env: Python  
2) **Build:** `pip install -r requirements.txt`  
3) **Start:** `uvicorn main:app --host 0.0.0.0 --port $PORT`  
4) **Env:** `ALLOWED_ORIGINS=http://localhost:3000,https://<preview>.vercel.app,https://app.tuodominio.com`  
5) Test: `GET /health` → `{"status":"ok"}` • `POST /analyze` con CSV → JSON

Poi su **Vercel** (Root `apps/web`): set `NEXT_PUBLIC_API_BASE_URL` all'URL Render.
