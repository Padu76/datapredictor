from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os, io, csv
from datetime import datetime, timedelta
from statistics import mean

# --- CORS ---
allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS","http://localhost:3000").split(",") if o.strip()]
allow_origin_regex = os.getenv("ALLOW_ORIGIN_REGEX", r"^https://.*\.vercel\.app$")

app = FastAPI(title="DataPredictor API – CSV/XLSX + Advisor")
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

def find_col(header, candidates):
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

# --- Analyze endpoint ---
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

    # colonne principali
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

# -------- Advisor LLM Pro --------
class AdvisorPayload(BaseModel):
    analysis: dict
    context: dict | None = None  # es: {"period":"30", "mom_pct":..., "yoy_pct":...}

def rule_based_advisor(a: dict, ctx: dict | None) -> tuple[str, dict]:
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

    # Interpretazioni
    trend = kpi.get("trend_last_2w_vs_prev_2w_pct", 0)
    fchg = forecast.get("change_vs_last30_pct", 0)
    if trend > 10:
        lines.append("La dinamica recente è robusta: spingere ciò che già funziona massimizza il ROI.")
    elif trend < -5:
        lines.append("Segnali di raffreddamento: serve un'azione tattica immediata per invertire il trend.")
    else:
        lines.append("Stabilità moderata: puntare su efficienza e micro-ottimizzazioni continua.")
    if fchg < 0:
        lines.append("Il forecast suggerisce un potenziale rallentamento: ribilanciare stock e domanda.")
    else:
        lines.append("Il forecast è positivo: preparare capacità operativa (stock, customer care, consegne).")

    # Anomalie
    if anomalies:
        lines.append(f"Sono emerse {len(anomalies)} anomalie giornaliere; vanno verificate cause (prezzi, resi, ADS).")
    else:
        lines.append("Non risultano anomalie significative: il profilo è coerente nel periodo osservato.")

    # Azioni tattiche (da backend)
    if actions:
        lines.append("Azioni tattiche suggerite dall'algoritmo nel breve:")
        for a_ in actions[:4]:
            lines.append(f"– [{a_.get('priority','')}] {a_.get('title','')} (uplift atteso {a_.get('expected_uplift_pct','?')}%).")

    # Pillars operativi
    lines.append("Pilastri operativi consigliati:")
    lines.append("1) Focus su canali/prodotti top performer; 2) Test A/B su prezzo/pacchetti; 3) Ritmo promozionale sostenibile; 4) Riduzione attrito checkout.")
    lines.append("Pianificare una cadenza di review settimanale con KPI chiari: revenue, conversion, AOV, CAC, LTV (se disponibile).")

    # Backlog esperimenti (esempi pratici)
    lines.append("Backlog esperimenti (esempi):")
    lines.append("• Pricing: test ±5–10% su 1–2 SKU core per stimare elasticità.")
    lines.append("• Bundle/upsell: aggiunta servizio/prodotto complementare con sconto lieve.")
    lines.append("• Creatività: rotazione asset che hanno generato picchi; raffreddare quelli saturi.")
    lines.append("• Landing page: prova headline orientata al valore + social proof visibile above the fold.")
    lines.append("• Retention: email di riattivazione con voucher mirati a clienti dormienti.")

    # Rischi e mitigazioni
    lines.append("Rischi chiave: sovra-sconto che erode margine; stock-out; saturazione audience paid.")
    lines.append("Mitigazioni: soglia minima di margine per promo; monitor early warning stock; refresh audience e creatività.")

    # KPI target
    lines.append("Target orientativi (da adattare): +8–12% ricavi a 30gg, AOV +3–5%, CAC stabile o in calo, churn in miglioramento se CRM attivo.")

    # chiusura
    lines.append("Conclusione: applicare le azioni prioritarie nei prossimi 7 giorni e preparare piano a 30/90 giorni.")

    # Assicurati di restituire ~25–30 righe
    while len(lines) < 27:
        lines.append("Nota operativa: tracciare gli impatti per apprendere rapidamente e iterare.")
    advisor_text = "\n".join(lines)

    # Playbook 7/30/90
    playbook = {
        "7d": [
            "Diagnosi rapida canali e SKU: conferma driver di revenue.",
            "Attiva 1 promo tattica su top SKU (max 7gg) con margine protetto.",
            "Lancia un test A/B prezzo/bundle su un prodotto core.",
            "Controllo UX: riduci frizioni su checkout (campi, step, tempi).",
            "Setup dashboard settimanale e alert per anomalie."
        ],
        "30d": [
            "Scala campagne su canali con ROI > soglia e spegni i sotto-performanti.",
            "Implementa bundle/upsell su 2–3 offerte con forte fit.",
            "Ottimizza supply: previeni stock-out su best-seller.",
            "Sequenza email/SMS di retention per dormienti.",
            "Revisiona prezzi con evidenze da test (elasticità iniziale)."
        ],
        "90d": [
            "Roadmap creatività + refresh audience per evitare saturazione.",
            "Pricing strategy per stagionalità: listino e promo calendar.",
            "Cohort/LTV (se dati cliente disponibili), segmentazione e loyalty.",
            "Automazioni CRM (winback, cross-sell) basate su comportamento.",
            "Allinea obiettivi margine e crescita, aggiorna playbook."
        ]
    }
    return advisor_text, playbook

def call_llm(advisor_prompt: str) -> str | None:
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
                {"role":"system","content":"Sei un consulente business. Scrivi un report pratico, 25-30 righe, con azioni chiare e tono professionale ma diretto."},
                {"role":"user","content":advisor_prompt}
            ],
            temperature=0.2,
            max_tokens=900,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        # fallback in caso di errore API
        return None

@app.post("/advisor")
async def advisor(payload: AdvisorPayload):
    a = payload.analysis or {}
    ctx = payload.context or {}
    # Prompt per LLM
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
        f"- Anomalie (giorni): {len(an)}\n"
        f"- Azioni suggerite: {[ac.get('title') for ac in acts]}\n\n"
        "Scrivi una analisi discorsiva di 25-30 righe con: lettura dei dati, possibili cause, rischi, e un piano pratico. Linguaggio semplice e diretto."
    )

    llm_text = call_llm(prompt)
    if llm_text:
        # Con LLM generiamo playbook anche con regole per coerenza
        _, playbook = rule_based_advisor(a, ctx)
        return {"mode":"llm", "advisor_text": llm_text, "playbook": playbook}
    # Fallback rule-based
    rb_text, playbook = rule_based_advisor(a, ctx)
    return {"mode":"rule-based", "advisor_text": rb_text, "playbook": playbook}
