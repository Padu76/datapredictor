from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os, io, csv, re
from datetime import datetime, timedelta
from statistics import mean
from typing import List, Tuple

# Env:
# ALLOWED_ORIGINS       -> lista separata da virgole (es. http://localhost:3000,https://datapredictor.vercel.app)
# ALLOW_ORIGIN_REGEX    -> regex opzionale (es. ^https://.*\.vercel\.app$)
allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS","http://localhost:3000").split(",") if o.strip()]
allow_origin_regex = os.getenv("ALLOW_ORIGIN_REGEX", r"^https://.*\.vercel\.app$")

app = FastAPI(title="DataPredictor API – MVP (CSV/XLSX, no pandas)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status":"ok"}

DATE_CANDS = ["date","data","giorno","timestamp","order_date","created_at"]
AMOUNT_CANDS = ["amount","revenue","ricavo","price","prezzo","total","totale","valore"]
QTY_CANDS = ["qty","quantita","quantity","qta"]

def find_col(header: List[str], candidates: List[str]):
    low = [h.lower() for h in header]
    for c in candidates:
        if c in low:
            return header[low.index(c)]
    return None

def to_float(x):
    if x is None: return 0.0
    s = str(x).strip().replace("€","").replace(" ", "").replace(",", ".")
    try: return float(s)
    except: return 0.0

def parse_date(x):
    s = str(x).strip()
    for fmt in ("%Y-%m-%d","%d/%m/%Y","%d-%m-%Y","%m/%d/%Y","%Y/%m/%d","%Y-%m-%d %H:%M:%S"):
        try: return datetime.strptime(s, fmt)
        except: pass
    try: return datetime.fromisoformat(s.replace("Z",""))
    except: return None

def read_csv(bytes_content: bytes) -> Tuple[List[str], List[dict]]:
    text = bytes_content.decode("utf-8", errors="ignore").splitlines()
    reader = csv.DictReader(text)
    rows = list(reader)
    return (reader.fieldnames or []), rows

def read_xlsx(bytes_content: bytes) -> Tuple[List[str], List[dict]]:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(bytes_content), read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows: return [], []
    header = [str(c) if c is not None else "" for c in rows[0]]
    out = []
    for r in rows[1:]:
        out.append({header[i]: r[i] for i in range(len(header))})
    return header, out

@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    fname = file.filename.lower()
    if not (fname.endswith(".csv") or fname.endswith(".xlsx")):
        raise HTTPException(status_code=400, detail="Accettiamo CSV o XLSX.")

    content = await file.read()
    if fname.endswith(".csv"):
        header, rows = read_csv(content)
    else:
        header, rows = read_xlsx(content)

    if not rows:
        raise HTTPException(status_code=400, detail="File vuoto o senza header.")

    # colonne
    date_col = find_col(header, DATE_CANDS) or next((c for c in header if c and ("date" in c.lower() or "data" in c.lower() or "time" in c.lower())), None)
    if not date_col:
        raise HTTPException(status_code=400, detail="Nessuna colonna data trovata (es. 'date').")
    amount_col = find_col(header, AMOUNT_CANDS)
    price_col = find_col(header, ["price","prezzo","unit_price","unitprice"])
    qty_col = find_col(header, QTY_CANDS)

    # aggrega per giorno
    daily = {}
    for r in rows:
        d = parse_date(r.get(date_col))
        if not d: continue
        if amount_col:
            amt = to_float(r.get(amount_col))
        elif price_col and qty_col:
            amt = to_float(r.get(price_col)) * to_float(r.get(qty_col))
        else:
            amt = 1.0  # fallback: conta come ordine
        day = datetime(d.year, d.month, d.day)
        daily[day] = daily.get(day, 0.0) + amt

    if not daily:
        raise HTTPException(status_code=400, detail="Nessuna riga valida dopo il parsing.")

    # completa giorni mancanti
    start, end = min(daily.keys()), max(daily.keys())
    series = []
    curr = start
    while curr <= end:
        series.append((curr, float(daily.get(curr, 0.0))))
        curr += datetime.timedelta(days=1) if False else timedelta(days=1)  # per linting

    # KPI 30gg
    last30 = [(d,v) for d,v in series if d >= (end - timedelta(days=29))]
    revenue_30 = sum(v for _,v in last30)
    orders_days = sum(1 for _,v in last30 if v > 0)
    avg_ticket = (revenue_30 / orders_days) if orders_days else 0.0

    # Trend 2w vs 2w
    vals = [v for _,v in last30]
    recent = vals[-14:] if len(vals)>=14 else vals
    prev   = vals[-28:-14] if len(vals)>=28 else vals[:max(len(vals)-14,1)]
    w2_recent = mean(recent) if recent else 0.0
    w2_prev   = mean(prev) if prev else 0.0
    trend_pct = ((w2_recent - w2_prev)/w2_prev*100.0) if w2_prev else 0.0

    # Forecast semplice (media ultimi N)
    window = 28 if len(series)>=28 else max(7, len(series))
    base = mean([v for _,v in series][-window:]) if series else 0.0
    forecast_30_sum = base * 30.0
    forecast_change_pct = ((forecast_30_sum - revenue_30)/revenue_30*100.0) if revenue_30 else 0.0

    # Anomalie (z-score)
    def mean_std(xs):
        if not xs: return 0.0, 0.0
        m = sum(xs)/len(xs)
        var = sum((x-m)**2 for x in xs)/len(xs) if len(xs)>1 else 0.0
        return m, var**0.5
    values = [v for _,v in series]
    m, s = mean_std(values)
    anomalies = []
    if s > 0:
        for d,v in series:
            z = (v - m)/s
            if abs(z) >= 2.5:
                anomalies.append(d.strftime("%Y-%m-%d"))

    actions = []
    if trend_pct < -5:
        actions.append({"title":"Promo mirata 7gg su top prodotti/servizi","expected_uplift_pct":5,"priority":"high"})
    if forecast_change_pct < 0:
        actions.append({"title":"Ribilancia stock e spingi best-seller","expected_uplift_pct":3,"priority":"high"})
    if anomalies:
        actions.append({"title":"Indaga giorni anomali (prezzi/resi/ads)","expected_uplift_pct":2,"priority":"medium"})
    if not actions:
        actions.append({"title":"Mantieni strategia, test A/B prezzo o bundle","expected_uplift_pct":1,"priority":"low"})

    timeseries = [{"date": d.strftime("%Y-%m-%d"), "value": float(v)} for d, v in series]

    return {
        "kpi": {
            "revenue_30d": round(revenue_30,2),
            "orders_days_positive_30d": int(orders_days),
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
        "actions": actions,
        "timeseries": timeseries
    }
