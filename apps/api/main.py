from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os, io, csv, json
from datetime import datetime, timedelta
from statistics import mean, pstdev
from math import sqrt

# --- CORS ---
allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS","http://localhost:3000").split(",") if o.strip()]
allow_origin_regex = os.getenv("ALLOW_ORIGIN_REGEX", r"^https://.*\.vercel\.app$")

app = FastAPI(title="DataPredictor API – Business & Finance")
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

# --- Helpers comuni ---
DATE_CANDS = ["date","data","giorno","timestamp","order_date","created_at"]
AMOUNT_CANDS = ["amount","revenue","ricavo","price","prezzo","total","totale","valore"]
QTY_CANDS = ["qty","quantita","quantity","qta"]
PRICE_CANDS = ["close","price","prezzo","unit_price","unitprice"]
SYMBOL_CANDS = ["symbol","ticker","asset"]

def to_float(x, decimal=","):
    if x is None: return 0.0
    s = str(x).strip().replace("€","").replace(" ", "")
    if decimal == ",":  # normalizza separatore decimale
        s = s.replace(".", "").replace(",", ".")
    try: return float(s)
    except: return 0.0

def parse_date(x, fmt=None):
    if x is None: return None
    s = str(x).strip()
    if fmt:
        try:
            if fmt.upper() == "DD/MM/YYYY": fmt = "%d/%m/%Y"
            if fmt.upper() == "YYYY-MM-DD": fmt = "%Y-%m-%d"
            if fmt.upper() == "MM/DD/YYYY": fmt = "%m/%d/%Y"
            return datetime.strptime(s, fmt)
        except: pass
    for f in ("%Y-%m-%d","%d/%m/%Y","%d-%m-%Y","%m/%d/%Y","%Y/%m/%d","%Y-%m-%d %H:%M:%S"):
        try: return datetime.strptime(s, f)
        except: pass
    try: return datetime.fromisoformat(s.replace("Z",""))
    except: return None

def read_csv(bytes_content: bytes):
    text = bytes_content.decode("utf-8", errors="ignore").splitlines()
    reader = csv.DictReader(text)
    rows = list(reader)
    return (reader.fieldnames or []), rows

def read_xlsx(bytes_content: bytes):
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

def pick_col(header, preferred, fallbacks):
    if preferred and preferred in header: return preferred
    low = [h.lower() for h in header]
    for c in fallbacks:
        if c in low:
            return header[low.index(c)]
    return None

# =========================
# ===== BUSINESS MODE =====
# =========================
def analyze_business(header, rows, date_fmt, decimal):
    date_col = pick_col(header, None, DATE_CANDS)
    amount_col = pick_col(header, None, AMOUNT_CANDS)
    price_col  = pick_col(header, None, ["price","prezzo","unit_price","unitprice"])
    qty_col    = pick_col(header, None, QTY_CANDS)

    if not date_col:
        raise HTTPException(status_code=400, detail="Colonna data non trovata.")
    # aggrega per giorno
    daily = {}
    for r in rows:
        d = parse_date(r.get(date_col), fmt=date_fmt)
        if not d: continue
        if amount_col:
            amt = to_float(r.get(amount_col), decimal=decimal)
        elif price_col and qty_col:
            amt = to_float(r.get(price_col), decimal=decimal) * to_float(r.get(qty_col), decimal=decimal)
        else:
            amt = 1.0
        day = datetime(d.year, d.month, d.day)
        daily[day] = daily.get(day, 0.0) + amt

    if not daily:
        raise HTTPException(status_code=400, detail="Nessuna riga valida (Business).")

    start, end = min(daily.keys()), max(daily.keys())
    series = []
    curr = start
    while curr <= end:
        series.append((curr, float(daily.get(curr, 0.0))))
        curr += timedelta(days=1)

    last30 = [(d,v) for d,v in series if d >= (end - timedelta(days=29))]
    revenue_30 = sum(v for _,v in last30)
    orders_days = sum(1 for _,v in last30 if v > 0)
    avg_ticket = (revenue_30 / orders_days) if orders_days else 0.0

    vals = [v for _,v in last30]
    recent = vals[-14:] if len(vals)>=14 else vals
    prev   = vals[-28:-14] if len(vals)>=28 else vals[:max(len(vals)-14,1)]
    w2_recent = mean(recent) if recent else 0.0
    w2_prev   = mean(prev) if prev else 0.0
    trend_pct = ((w2_recent - w2_prev)/w2_prev*100.0) if w2_prev else 0.0

    window = 28 if len(series)>=28 else max(7, len(series))
    base = mean([v for _,v in series][-window:]) if series else 0.0
    forecast_30_sum = base * 30.0
    forecast_change_pct = ((forecast_30_sum - revenue_30)/revenue_30*100.0) if revenue_30 else 0.0

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
    if trend_pct < -5: actions.append({"title":"Promo tattica 7gg su top SKU/servizi","expected_uplift_pct":5,"priority":"high"})
    if forecast_change_pct < 0: actions.append({"title":"Ribilancia stock e spingi best-seller","expected_uplift_pct":3,"priority":"high"})
    if anomalies: actions.append({"title":"Indaga giorni anomali (prezzi/resi/ads)","expected_uplift_pct":2,"priority":"medium"})
    if not actions: actions.append({"title":"Mantieni strategia e testa prezzo/bundle","expected_uplift_pct":1,"priority":"low"})

    timeseries = [{"date": d.strftime("%Y-%m-%d"), "value": float(v)} for d, v in series]

    return {
        "mode":"business",
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

# =========================
# ===== FINANCE MODE ======
# =========================
def max_drawdown(equity):
    peak = equity[0]
    mdd = 0.0
    for x in equity:
        if x > peak: peak = x
        dd = (x/peak) - 1.0
        if dd < mdd: mdd = dd
    return mdd  # negativo

def analyze_finance(header, rows, date_fmt, decimal, rf_pct_annual):
    # supporto: serie prezzi (date, close[, symbol]) OPPURE transazioni (date,symbol,qty,price)
    date_col = pick_col(header, None, DATE_CANDS)
    close_col = pick_col(header, None, ["close","adj close","close price"] + PRICE_CANDS)
    symbol_col = pick_col(header, None, SYMBOL_CANDS)
    qty_col = pick_col(header, None, QTY_CANDS)
    price_col = pick_col(header, None, PRICE_CANDS)

    if not date_col:
        raise HTTPException(status_code=400, detail="Colonna data non trovata (Finanza).")

    records = []
    for r in rows:
        d = parse_date(r.get(date_col), fmt=date_fmt)
        if not d: continue
        rec = {"date": d}
        if close_col: rec["close"] = to_float(r.get(close_col), decimal=decimal)
        if symbol_col: rec["symbol"] = str(r.get(symbol_col) or "").strip()
        if qty_col: rec["qty"] = to_float(r.get(qty_col), decimal=decimal)
        if price_col: rec["price"] = to_float(r.get(price_col), decimal=decimal)
        records.append(rec)
    if not records:
        raise HTTPException(status_code=400, detail="Nessuna riga valida (Finanza).")

    # Caso A: serie prezzi singolo asset (o già aggregata)
    if close_col and (not qty_col or all((rec.get("qty") in (None,0.0) for rec in records))):
        # aggrega per giorno ultimo close
        by_day = {}
        for rec in records:
            day = datetime(rec["date"].year, rec["date"].month, rec["date"].day)
            c = rec.get("close", None)
            if c is None: continue
            by_day[day] = c  # ultimo del giorno
        series = sorted(by_day.items(), key=lambda x: x[0])
        if len(series) < 2: raise HTTPException(status_code=400, detail="Serie prezzi troppo corta.")
        prices = [v for _,v in series]
        dates  = [d for d,_ in series]
        # returns
        rets = []
        for i in range(1,len(prices)):
            r = (prices[i]/prices[i-1]) - 1.0
            rets.append(r)
        # KPI
        n_days = (dates[-1] - dates[0]).days or 1
        cagr = (prices[-1]/prices[0])**(365.0/n_days) - 1.0 if prices[0] > 0 else 0.0
        mu = mean(rets)
        sigma = pstdev(rets) if len(rets)>1 else 0.0
        vol_annual = sigma*sqrt(252)
        rf_daily = (rf_pct_annual/100.0)/252.0
        sharpe = ((mu - rf_daily)/sigma*sqrt(252)) if sigma>0 else 0.0
        # equity curve per MDD (normalizzata a 1)
        equity = [1.0]
        for r in rets: equity.append(equity[-1]*(1.0+r))
        mdd = max_drawdown(equity)  # negativo
        hit_ratio = sum(1 for r in rets if r>0)/len(rets) if rets else 0.0
        # 30 gg metrics su returns
        last30_idx = max(0, len(rets)-30)
        r30 = rets[last30_idx:]
        ret30 = (prod := (lambda xs: __import__("functools").reduce(lambda a,b: a*(1+b), xs, 1.0))(r30)) - 1.0 if r30 else 0.0

        # forecast: EWMA dei ritorni → proiezione 30gg
        alpha = 0.2
        ewma = 0.0
        for r in rets:
            ewma = alpha*r + (1-alpha)*ewma
        forecast_30_return = (1+ewma)**30 - 1.0

        timeseries = [{"date": d.strftime("%Y-%m-%d"), "value": float(p)} for d,p in series]

        actions = []
        if sharpe < 0.3: actions.append({"title":"Rivedi rischio: volatilità alta vs rendimento","expected_uplift_pct":0,"priority":"high"})
        if mdd < -0.15: actions.append({"title":"Definisci stop-loss / riduci esposizione","expected_uplift_pct":0,"priority":"high"})
        if hit_ratio < 0.45: actions.append({"title":"Evita overtrading: privilegia segnali di qualità","expected_uplift_pct":0,"priority":"medium"})
        if not actions: actions.append({"title":"Mantieni sizing prudente e ribilanci periodico","expected_uplift_pct":0,"priority":"low"})

        # anomalie su z-score returns
        anomalies = []
        if sigma>0:
            for i,r in enumerate(rets, start=1):
                z = (r - mu)/sigma
                if abs(z) >= 2.5:
                    anomalies.append(dates[i].strftime("%Y-%m-%d"))

        return {
            "mode":"finance",
            "kpi":{
                "last_price": round(prices[-1], 4),
                "return_30d_pct": round(ret30*100, 2),
                "cagr_pct": round(cagr*100, 2),
                "vol_annual_pct": round(vol_annual*100, 2),
                "sharpe": round(sharpe, 2),
                "max_drawdown_pct": round(mdd*100, 2),
                "hit_ratio_pct": round(hit_ratio*100, 2)
            },
            "forecast":{
                "method":"ewma-return",
                "window_days": 30,
                "forecast_30d_sum": round(forecast_30_return*100, 2),  # percentuale
                "change_vs_last30_pct": round((forecast_30_return - ret30)*100, 2)
            },
            "anomalies": anomalies[:10],
            "actions": actions,
            "timeseries": timeseries
        }

    # Caso B: transazioni → ricostruisci equity (MVP semplice: somma posizione per simbolo a costo medio)
    # Nota: implementazione semplificata senza cashflow avanzati.
    # Raggruppa per giorno valore portafoglio come somma(qty*price close). Se manca close, usa 'price' della transazione (approssimazione).
    by_day_value = {}
    for rec in records:
        day = datetime(rec["date"].year, rec["date"].month, rec["date"].day)
        qty = rec.get("qty", None)
        price = rec.get("price", None)
        if qty is None or price is None:
            continue
        by_day_value[day] = by_day_value.get(day, 0.0) + qty*price

    if len(by_day_value) < 2:
        raise HTTPException(status_code=400, detail="Transazioni insufficienti per ricostruire equity (Finanza).")

    series = sorted(by_day_value.items(), key=lambda x: x[0])
    values = [v for _,v in series]
    dates  = [d for d,_ in series]
    # returns dal valore totale (approssimazione)
    rets = []
    for i in range(1,len(values)):
        prev = values[i-1] or 1e-9
        r = (values[i]/prev) - 1.0
        rets.append(r)
    n_days = (dates[-1] - dates[0]).days or 1
    cagr = (values[-1]/values[0])**(365.0/n_days) - 1.0 if values[0] > 0 else 0.0
    mu = mean(rets); sigma = pstdev(rets) if len(rets)>1 else 0.0
    vol_annual = sigma*sqrt(252)
    rf_daily = (rf_pct_annual/100.0)/252.0
    sharpe = ((mu - rf_daily)/sigma*sqrt(252)) if sigma>0 else 0.0
    equity = [1.0]
    for r in rets: equity.append(equity[-1]*(1.0+r))
    mdd = max_drawdown(equity)
    hit_ratio = sum(1 for r in rets if r>0)/len(rets) if rets else 0.0
    last30_idx = max(0, len(rets)-30)
    r30 = rets[last30_idx:]
    ret30 = (lambda xs: __import__("functools").reduce(lambda a,b: a*(1+b), xs, 1.0))(r30) - 1.0 if r30 else 0.0
    alpha = 0.2
    ewma = 0.0
    for r in rets: ewma = alpha*r + (1-alpha)*ewma
    forecast_30_return = (1+ewma)**30 - 1.0

    timeseries = [{"date": d.strftime("%Y-%m-%d"), "value": float(v)} for d, v in series]
    anomalies=[]
    if sigma>0:
        for i,r in enumerate(rets, start=1):
            z=(r-mu)/sigma
            if abs(z)>=2.5: anomalies.append(dates[i].strftime("%Y-%m-%d"))
    actions=[]
    if sharpe<0.3: actions.append({"title":"Rivedi composizione portafoglio (rischio eccessivo vs rendimento)","expected_uplift_pct":0,"priority":"high"})
    if mdd<-0.15: actions.append({"title":"Imposta regole di stop/ribilanciamento","expected_uplift_pct":0,"priority":"high"})
    if not actions: actions.append({"title":"Mantieni ribilanci periodico e tracking rischio","expected_uplift_pct":0,"priority":"low"})

    return {
        "mode":"finance",
        "kpi":{
            "portfolio_last_value": round(values[-1],2),
            "return_30d_pct": round(ret30*100, 2),
            "cagr_pct": round(cagr*100, 2),
            "vol_annual_pct": round(vol_annual*100, 2),
            "sharpe": round(sharpe, 2),
            "max_drawdown_pct": round(mdd*100, 2),
            "hit_ratio_pct": round(hit_ratio*100, 2)
        },
        "forecast":{
            "method":"ewma-return",
            "window_days": 30,
            "forecast_30d_sum": round(forecast_30_return*100, 2),
            "change_vs_last30_pct": round((forecast_30_return - ret30)*100, 2)
        },
        "anomalies": anomalies[:10],
        "actions": actions,
        "timeseries": timeseries
    }

# -------- Analyze endpoint (ora con mode) --------
@app.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    mapping: str | None = Form(None),
    mode: str | None = Form(None),         # "business" | "finance" | None (auto)
    rf_pct_annual: float = Form(0.0)       # per finanza (Sharpe)
):
    fname = file.filename.lower()
    if not (fname.endswith(".csv") or fname.endswith(".xlsx")):
        raise HTTPException(status_code=400, detail="Accettiamo CSV o XLSX.")
    content = await file.read()
    header, rows = (read_csv(content) if fname.endswith(".csv") else read_xlsx(content))
    if not rows:
        raise HTTPException(status_code=400, detail="File vuoto o senza header.")

    mapping_obj = None
    if mapping:
        try: mapping_obj = json.loads(mapping)
        except: raise HTTPException(status_code=400, detail="Mapping JSON non valido.")

    decimal = (mapping_obj.get("options", {}).get("decimal") if mapping_obj else None) or ","
    date_fmt = (mapping_obj.get("options", {}).get("date_format") if mapping_obj else None)

    # auto-mode se non passato: se vedo "close" o "symbol+qty+price" vado finance
    inferred_fin = False
    low = [h.lower() for h in header]
    if any(c in low for c in ["close","adj close","ticker","symbol"]) or \
       (any(c in low for c in PRICE_CANDS) and any(c in low for c in QTY_CANDS)):
        inferred_fin = True

    use_mode = (mode or "").lower().strip() or ("finance" if inferred_fin else "business")

    if use_mode == "finance":
        return analyze_finance(header, rows, date_fmt, decimal, rf_pct_annual)
    else:
        return analyze_business(header, rows, date_fmt, decimal)

# -------- Advisor --------
class AdvisorPayload(BaseModel):
    analysis: dict
    context: dict | None = None  # es: {"period":"30", "mom_pct":..., "yoy_pct":..., "mode":"finance", "rf_pct": 2.0}

def rule_based_advisor(a: dict, ctx: dict | None):
    mode = (a.get("mode") or (ctx or {}).get("mode") or "business").lower()
    lines = []
    actions = a.get("actions", [])
    anomalies = a.get("anomalies", [])

    if mode == "finance":
        k = a.get("kpi", {})
        f = a.get("forecast", {})
        lines.append("Lettura finanziaria dell'andamento con focus rischio/rendimento.")
        lines.append(f"• Ultimo valore/prezzo: {k.get('last_price', k.get('portfolio_last_value','n/d'))}.")
        lines.append(f"• Rendimento 30gg: {k.get('return_30d_pct','n/d')}%.")
        lines.append(f"• CAGR stimato sul periodo: {k.get('cagr_pct','n/d')}%.")
        lines.append(f"• Volatilità annua: {k.get('vol_annual_pct','n/d')}%.")
        lines.append(f"• Sharpe: {k.get('sharpe','n/d')}.")
        lines.append(f"• Max drawdown: {k.get('max_drawdown_pct','n/d')}%.")
        lines.append(f"• Hit ratio (giorni up): {k.get('hit_ratio_pct','n/d')}%.")
        lines.append(f"• Forecast 30gg (EWMA ritorni): {f.get('forecast_30d_sum','n/d')}% (vs ultimi 30: {f.get('change_vs_last30_pct','n/d')}%).")
        if anomalies:
            lines.append(f"Sono stati rilevati {len(anomalies)} giorni anomali su base z-score dei ritorni.")
        else:
            lines.append("Nessuna anomalia rilevante sui ritorni.")
        lines.append("Interpretazione sintetica: bilanciare rendimento e volatilità, proteggere il downside, evitare overtrading.")
        if actions:
            lines.append("Azioni tattiche proposte:")
            for a_ in actions[:4]:
                lines.append(f"– [{a_.get('priority','')}] {a_.get('title','')}.")
        lines.append("Pilastri: sizing prudente, ribilanci periodico, regole di stop, diversificazione non ridondante.")
        while len(lines) < 25: lines.append("Nota operativa: monitora Sharpe e DD; adatta l'esposizione ai regimi di volatilità.")
        playbook = {
            "7d": ["Verifica regime volatilità e drawdown.", "Imposta o aggiorna stop e alert.", "Riduci esposizione su asset con Sharpe basso.", "Controlla correlazioni e sovrapposizioni.", "Redigi diario trade/interventi."],
            "30d": ["Ribilancia portafoglio su pesi target.", "Valuta coperture parziali (es. put/ETF inversi) se rischio elevato.", "Aggiorna ipotesi di rendimento/volatilità.", "Misura performance vs benchmark.", "Ottimizza costi/commissioni."],
            "90d": ["Revisione strategia complessiva.", "Analisi coorti di trade e pattern ricorrenti.", "Test nuove regole di sizing.", "Stress test scenari avversi.", "Documenta apprendimenti e aggiorna il playbook."]
        }
        return "\n".join(lines), playbook

    # default: business (come prima, condensato)
    kpi = a.get("kpi", {}); f = a.get("forecast", {})
    lines.append("Panoramica business con azioni pratiche.")
    lines.append(f"• Ricavi 30gg: € {kpi.get('revenue_30d', 0)}; Ticket medio: € {kpi.get('avg_ticket',0)}.")
    lines.append(f"• Trend 2w vs 2w: {kpi.get('trend_last_2w_vs_prev_2w_pct', 0)}%. Forecast30: {f.get('forecast_30d_sum',0)} ({f.get('change_vs_last30_pct',0)}%).")
    if anomalies: lines.append(f"{len(anomalies)} anomalie da indagare (prezzi, resi, ADS).")
    if actions:
        lines.append("Azioni tattiche:")
        for a_ in actions[:4]:
            lines.append(f"– [{a_.get('priority','')}] {a_.get('title','')} (uplift {a_.get('expected_uplift_pct','?')}%).")
    while len(lines) < 25: lines.append("Nota operativa: misura impatti e itera rapidamente.")
    playbook = {
        "7d": ["Diagnosi driver ricavi.", "Promo tattica 7gg su top SKU.", "Test A/B prezzo/bundle.", "Snellisci checkout.", "Setup alert anomalie."],
        "30d": ["Scala canali ROI+.", "Bundle/upsell su offerte core.", "Previeni stock-out.", "Retention su dormienti.", "Revisione prezzo su evidenze."],
        "90d": ["Roadmap creatività e audience.", "Calendar promo stagionale.", "Cohort/LTV & loyalty.", "Automazioni CRM.", "Allinea crescita/margine."]
    }
    return "\n".join(lines), playbook

def call_llm(advisor_prompt: str):
    api_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    if not api_key:
        return None
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role":"system","content":"Sei un consulente (business/finanza). Scrivi un report pratico, 25-30 righe, tono diretto, con azioni e rischi."},
                {"role":"user","content":advisor_prompt}
            ],
            temperature=0.2,
            max_tokens=900,
        )
        return resp.choices[0].message.content.strip()
    except:
        return None

class AdvisorPayload(BaseModel):
    analysis: dict
    context: dict | None = None

@app.post("/advisor")
async def advisor(payload: AdvisorPayload):
    a = payload.analysis or {}
    ctx = payload.context or {}
    mode = (a.get("mode") or ctx.get("mode") or "business").lower()
    k = a.get("kpi", {}); f = a.get("forecast", {})
    prompt = (
        f"Modalità: {mode}\n"
        f"Dati chiave: {json.dumps({'kpi':k,'forecast':f}, ensure_ascii=False)}\n"
        "Scrivi un'analisi discorsiva di 25-30 righe con lettura dati, cause, rischi e piano pratico (7/30/90gg)."
    )
    llm_text = call_llm(prompt)
    if llm_text:
        _, playbook = rule_based_advisor(a, ctx)
        return {"mode":"llm", "advisor_text": llm_text, "playbook": playbook}
    rb_text, playbook = rule_based_advisor(a, ctx)
    return {"mode":"rule-based", "advisor_text": rb_text, "playbook": playbook}
