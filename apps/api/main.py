from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os, io, csv, json
from datetime import datetime, timedelta
from statistics import mean

# --- CORS ---
allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS","http://localhost:3000").split(",") if o.strip()]
allow_origin_regex = os.getenv("ALLOW_ORIGIN_REGEX", r"^https://.*\.vercel\.app$")

app = FastAPI(title="DataPredictor API – CSV/XLSX + Advisor + Mapping")
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

# --- Helpers parsing ---
DATE_CANDS = ["date","data","giorno","timestamp","order_date","created_at"]
AMOUNT_CANDS = ["amount","revenue","ricavo","price","prezzo","total","totale","valore"]
QTY_CANDS = ["qty","quantita","quantity","qta"]

def to_float(x, decimal=","):
    if x is None: return 0.0
    s = str(x).strip().replace("€","").replace(" ", "")
    # normalizza separatore decimale
    if decimal == ",":
        s = s.replace(".", "").replace(",", ".")
    try: return float(s)
    except: return 0.0

def parse_date(x, fmt=None):
    if x is None: return None
    s = str(x).strip()
    if fmt:
        # Supporto basi comuni
        fmt = fmt.strip()
        try:
            # Mappine friendly
            if fmt.upper() == "DD/MM/YYYY": fmt = "%d/%m/%Y"
            if fmt.upper() == "YYYY-MM-DD": fmt = "%Y-%m-%d"
            if fmt.upper() == "MM/DD/YYYY": fmt = "%m/%d/%Y"
            return datetime.strptime(s, fmt)
        except:
            pass
    # fallback: autodetect
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

def pick_col(header, colname, fallbacks):
    if colname and colname in header:
        return colname
    # auto
    low = [h.lower() for h in header]
    for c in fallbacks:
        if c in low:
            return header[low.index(c)]
    return None

# -------- Analyze endpoint (con mapping opzionale) --------
@app.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    mapping: str | None = Form(None)   # JSON string opzionale
):
    fname = file.filename.lower()
    if not (fname.endswith(".csv") or fname.endswith(".xlsx")):
        raise HTTPException(status_code=400, detail="Accettiamo CSV o XLSX.")
    content = await file.read()
    header, rows = (read_csv(content) if fname.endswith(".csv") else read_xlsx(content))
    if not rows:
        raise HTTPException(status_code=400, detail="File vuoto o senza header.")

    # --- mapping opzionale ---
    mapping_obj = None
    if mapping:
        try:
            mapping_obj = json.loads(mapping)
        except:
            raise HTTPException(status_code=400, detail="Mapping JSON non valido.")

    # opzioni parse
    decimal = (mapping_obj.get("options", {}).get("decimal") if mapping_obj else None) or ","
    date_fmt = (mapping_obj.get("options", {}).get("date_format") if mapping_obj else None)

    # colonne da usare
    date_col = pick_col(header, (mapping_obj or {}).get("date"), DATE_CANDS)
    if not date_col:
        raise HTTPException(status_code=400, detail="Colonna 'date' non trovata o non mappata.")
    amount_col = pick_col(header, (mapping_obj or {}).get("amount"), AMOUNT_CANDS)
    price_col  = pick_col(header, (mapping_obj or {}).get("price"),  ["price","prezzo","unit_price","unitprice"])
    qty_col    = pick_col(header, (mapping_obj or {}).get("qty"),    QTY_CANDS)

    if not amount_col and not (price_col and qty_col):
        # se non c'è amount e neanche price+qty: fallback al conteggio ordini (=1)
        pass

    # aggrega per giorno
    daily = {}
    for r in rows:
        d = parse_date(r.get(date_col), fmt=date_fmt)
        if not d: 
            continue
        if amount_col:
            amt = to_float(r.get(amount_col), decimal=decimal)
        elif price_col and qty_col:
            amt = to_float(r.get(price_col), decimal=decimal) * to_float(r.get(qty_col), decimal=decimal)
        else:
            amt = 1.0
        day = datetime(d.year, d.month, d.day)
        daily[day] = daily.get(day, 0.0) + amt

    if not daily:
        raise HTTPException(status_code=400, detail="Nessuna riga valida dopo il parsing (controlla mapping e formati).")

    # completa giorni mancanti
    start, end = min(daily.keys()), max(daily.keys())
    series = []
    curr = start
    while curr <= end:
        series.append((curr, float(daily.get(curr, 0.0))))
        curr += timedelta(days=1)

    # KPI ultimi 30gg
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

    # Forecast semplice
    window = 28 if len(series)>=28 else max(7, len(series))
    base = mean([v for _,v in series][-window:]) if series else 0.0
    forecast_30_sum = base * 30.0
    forecast_change_pct = ((forecast_30_sum - revenue_30)/revenue_30*100.0) if revenue_30 else 0.0

    # Anomalie z-score
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

# -------- Advisor LLM Pro (come prima) --------
class AdvisorPayload(BaseModel):
    analysis: dict
    context: dict | None = None

def rule_based_advisor(a: dict, ctx: dict | None):
    kpi = a.get("kpi", {})
    forecast = a.get("forecast", {})
    anomalies = a.get("anomalies", [])
    actions = a.get("actions", [])
    mom = (ctx or {}).get("mom_pct", None)
    yoy = (ctx or {}).get("yoy_pct", None)

    lines = []
    lines.append("Panoramica generale dell'andamento, letta come un consulente operativo.")
    lines.append(f"• Ricavi ultimi 30 giorni: € {kpi.get('revenue_30d', 0)}.")
    lines.append(f"• Giorni con vendite: {kpi.get('orders_days_positive_30d', 0)}.")
    lines.append(f"• Ticket medio: € {kpi.get('avg_ticket', 0)}.")
    lines.append(f"• Trend 2 settimane vs 2 precedenti: {kpi.get('trend_last_2w_vs_prev_2w_pct', 0)}%.")
    lines.append(f"• Forecast 30 giorni: € {forecast.get('forecast_30d_sum', 0)} ({forecast.get('change_vs_last30_pct', 0)}% vs ultimi 30).")
    if mom is not None: lines.append(f"• Variazione MoM stimata sul periodo selezionato: {round(mom,1)}%.")
    if yoy is not None: lines.append(f"• Variazione YoY stimata sul periodo selezionato: {round(yoy,1)}%.")

    trend = kpi.get("trend_last_2w_vs_prev_2w_pct", 0)
    fchg = forecast.get("change_vs_last30_pct", 0)
    if trend > 10: lines.append("La dinamica recente è robusta: spingere ciò che già funziona massimizza il ROI.")
    elif trend < -5: lines.append("Segnali di raffreddamento: serve un'azione tattica immediata per invertire il trend.")
    else: lines.append("Stabilità moderata: puntare su efficienza e micro-ottimizzazioni continua.")
    if fchg < 0: lines.append("Il forecast suggerisce un potenziale rallentamento: ribilanciare stock e domanda.")
    else: lines.append("Il forecast è positivo: preparare capacità operativa (stock, customer care, consegne).")

    if anomalies: lines.append(f"{len(anomalies)} anomalie da indagare (prezzi, resi, ADS).")
    else: lines.append("Nessuna anomalia rilevante nel periodo.")

    if actions:
        lines.append("Azioni tattiche (breve):")
        for a_ in actions[:4]:
            lines.append(f"– [{a_.get('priority','')}] {a_.get('title','')} (uplift atteso {a_.get('expected_uplift_pct','?')}%).")

    lines.append("Pilastri: 1) Focus top performer; 2) Test A/B prezzo/pacchetti; 3) Promozioni sostenibili; 4) Checkout fluido.")
    lines.append("Backlog: pricing ±5–10%; bundle/upsell; refresh creatività; headline orientata al valore; retention a clienti dormienti.")
    lines.append("Rischi: erosione margine; stock-out; saturazione audience. Mitigazioni: soglie margine, early warning stock, refresh audience.")
    lines.append("Target: +8–12% ricavi 30gg, AOV +3–5%, CAC stabile o in calo.")
    while len(lines) < 27:
        lines.append("Nota operativa: misura gli impatti e iterare rapidamente.")
    advisor_text = "\n".join(lines)

    playbook = {
        "7d": [
            "Diagnosi driver ricavi (canali/SKU).",
            "Promo tattica 7gg su top SKU (margine protetto).",
            "Test A/B prezzo/bundle su 1 prodotto core.",
            "Snellisci checkout (campi, step).",
            "Setup alert anomalie."
        ],
        "30d": [
            "Scala canali ROI+, spegni i sotto-performanti.",
            "Bundle/upsell su 2–3 offerte.",
            "Ottimizza supply per evitare stock-out.",
            "Sequenza retention su dormienti.",
            "Revisione prezzo in base ai test."
        ],
        "90d": [
            "Roadmap creatività e audience.",
            "Listino e promo calendar per stagionalità.",
            "Cohort/LTV, loyalty e CRM automation.",
            "Allineamento crescita/margine e aggiornamento playbook.",
            "Documenta apprendimenti."
        ]
    }
    return advisor_text, playbook

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
                {"role":"system","content":"Sei un consulente business. Report pratico, 25-30 righe, azioni chiare, tono diretto."},
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
    kpi = a.get("kpi", {})
    fc  = a.get("forecast", {})
    an  = a.get("anomalies", [])
    acts= a.get("actions", [])
    mom = ctx.get("mom_pct", "n/d")
    yoy = ctx.get("yoy_pct", "n/d")
    prompt = (
        "Dati analisi:\n"
        f"- Ricavi30: €{kpi.get('revenue_30d',0)}\n"
        f"- Giorni con vendite: {kpi.get('orders_days_positive_30d',0)}\n"
        f"- Ticket medio: €{kpi.get('avg_ticket',0)}\n"
        f"- Trend 2w vs 2w: {kpi.get('trend_last_2w_vs_prev_2w_pct',0)}%\n"
        f"- Forecast30: €{fc.get('forecast_30d_sum',0)} ({fc.get('change_vs_last30_pct',0)}% vs ultimi30)\n"
        f"- MoM stimato: {mom}% | YoY stimato: {yoy}%\n"
        f"- Anomalie: {len(an)}\n"
        f"- Azioni: {[ac.get('title') for ac in acts]}\n\n"
        "Scrivi un'analisi discorsiva di 25-30 righe con cause, rischi e piano pratico."
    )
    llm_text = call_llm(prompt)
    if llm_text:
        _, playbook = rule_based_advisor(a, ctx)
        return {"mode":"llm", "advisor_text": llm_text, "playbook": playbook}
    rb_text, playbook = rule_based_advisor(a, ctx)
    return {"mode":"rule-based", "advisor_text": rb_text, "playbook": playbook}
