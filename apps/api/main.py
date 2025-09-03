from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os, io, pandas as pd, numpy as np

ALLOWED = [o.strip() for o in os.getenv("ALLOWED_ORIGINS","http://localhost:3000").split(",")]

app = FastAPI(title="DataPredictor API – MVP")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health(): return {"status":"ok"}

DATE_CANDIDATES = ["date","data","giorno","timestamp","order_date","created_at"]
AMOUNT_CANDIDATES = ["amount","revenue","ricavo","price","prezzo","total","totale","valore"]
QTY_CANDIDATES = ["qty","quantita","quantity"]

def find_col(cols, candidates):
    low = [c.lower() for c in cols]
    for cand in candidates:
        if cand in low:
            return cols[low.index(cand)]
    return None

def coalesce_amount(df):
    ac = find_col(df.columns, AMOUNT_CANDIDATES)
    if ac: return df[ac].astype(float)
    price = find_col(df.columns, ["price","prezzo","unit_price","unitprice"])
    qty = find_col(df.columns, QTY_CANDIDATES)
    if price and qty:
        return df[price].astype(float) * df[qty].astype(float)
    return pd.Series(np.ones(len(df)), index=df.index, dtype=float)

@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Per l'MVP accettiamo solo CSV.")
    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV non leggibile: {e}")
    if df.empty: raise HTTPException(status_code=400, detail="CSV vuoto.")

    date_col = find_col(df.columns, DATE_CANDIDATES) or next((c for c in df.columns if 'date' in c.lower() or 'data' in c.lower() or 'time' in c.lower()), None)
    if not date_col: raise HTTPException(status_code=400, detail="Nessuna colonna data trovata. Crea una colonna 'date'.")

    df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
    df = df.dropna(subset=[date_col])

    amount = coalesce_amount(df)
    df["_amount"] = amount

    daily = df.groupby(df[date_col].dt.date)["_amount"].sum().rename("revenue").to_frame()
    daily.index = pd.to_datetime(daily.index)
    daily = daily.sort_index()

    if daily.empty: raise HTTPException(status_code=400, detail="Nessuna riga valida dopo il parsing.")

    idx = pd.date_range(daily.index.min(), daily.index.max(), freq="D")
    daily = daily.reindex(idx, fill_value=0.0)

    end = daily.index.max()
    start_30 = end - pd.Timedelta(days=29)
    last30 = daily.loc[start_30:end]
    revenue_30 = float(last30["revenue"].sum())
    orders_30 = int((last30["revenue"]>0).sum())
    avg_ticket = float(revenue_30 / max(orders_30,1))

    w2_recent = last30.tail(14)["revenue"].mean()
    w2_prev = last30.tail(28).head(14)["revenue"].mean() if len(last30)>=28 else last30.head(max(len(last30)-14,1))["revenue"].mean()
    trend_pct = float(((w2_recent - w2_prev) / w2_prev)*100) if w2_prev and not np.isnan(w2_prev) else 0.0

    window = 28 if len(daily)>=28 else max(7, len(daily))
    base = float(daily.tail(window)["revenue"].mean())
    forecast_30_sum = float(base * 30)
    forecast_change_pct = float(((forecast_30_sum - revenue_30)/revenue_30)*100) if revenue_30 else 0.0

    s = daily["revenue"]
    if s.std() > 0:
        z = (s - s.mean())/s.std()
        anomalies = [str(d.date()) for d,v in z.items() if abs(v) >= 2.5]
    else:
        anomalies = []

    actions = []
    if trend_pct < -5: actions.append({"title":"Promo mirata 7gg su top prodotti/servizi","expected_uplift_pct":5,"priority":"high"})
    if forecast_change_pct < 0: actions.append({"title":"Ribilancia stock e spingi best-seller","expected_uplift_pct":3,"priority":"high"})
    if anomalies: actions.append({"title":"Indaga giorni anomali (prezzi/resi/ads)","expected_uplift_pct":2,"priority":"medium"})
    if not actions: actions.append({"title":"Mantieni strategia, test A/B prezzo o bundle","expected_uplift_pct":1,"priority":"low"})

    return {
        "kpi": {
            "revenue_30d": round(revenue_30,2),
            "orders_days_positive_30d": orders_30,
            "avg_ticket": round(avg_ticket,2),
            "trend_last_2w_vs_prev_2w_pct": round(trend_pct,2)
        },
        "forecast": {
            "method":"moving-average",
            "window_days": window,
            "forecast_30d_sum": round(forecast_30_sum,2),
            "change_vs_last30_pct": round(forecast_change_pct,2)
        },
        "anomalies": anomalies[:10],
        "actions": actions
    }
