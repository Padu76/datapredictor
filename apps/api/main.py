# apps/api/main.py
# DataPredictor API — Analyze CSV/XLSX + Advisor (LLM/rule-based)
# + Paywall a crediti lato server (Supabase RPC) + log usage

import os
import io
import csv
import json
from datetime import datetime, timedelta
from statistics import mean
from typing import Optional, List, Dict, Any

import requests
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# =========================
# ENV
# =========================
SUPABASE_URL = os.getenv("SUPABASE_URL")  # es. https://xxx.supabase.co
SUPABASE_SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE")  # chiave service-role
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,https://datapredictor.vercel.app").split(",")
    if o.strip()
]

# =========================
# APP & CORS
# =========================
app = FastAPI(title="DataPredictor API – CSV/XLSX + Advisor + Credits")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok", "ts": datetime.utcnow().isoformat()}

# =========================
# Helper parsing file
# =========================
DATE_CANDS = ["date", "data", "giorno", "timestamp", "order_date", "created_at"]
AMOUNT_CANDS = ["amount", "revenue", "ricavo", "price", "prezzo", "total", "totale", "valore"]
QTY_CANDS = ["qty", "quantita", "quantity", "qta"]

def to_float(x, decimal=","):
    if x is None:
        return 0.0
    s = str(x).strip().replace("€", "").replace(" ", "")
    if decimal == ",":
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except:
        return 0.0

def parse_date(x, fmt=None):
    if x is None:
        return None
    s = str(x).strip()
    if fmt:
        try:
            f = fmt.strip().upper()
            if f == "DD/MM/YYYY":
                fmt = "%d/%m/%Y"
            elif f == "YYYY-MM-DD":
                fmt = "%Y-%m-%d"
            elif f == "MM/DD/YYYY":
                fmt = "%m/%d/%Y"
            return datetime.strptime(s, fmt)
        except:
            pass
    for f in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s, f)
        except:
            pass
    try:
        return datetime.fromisoformat(s.replace("Z", ""))
    except:
        return None

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
    if not rows:
        return [], []
    header = [str(c) if c is not None else "" for c in rows[0]]
    out = []
    for r in rows[1:]:
        out.append({header[i]: r[i] for i in range(len(header))})
    return header, out

def pick_col(header, colname, fallbacks):
    if colname and colname in header:
        return colname
    low = [h.lower() for h in header]
    for c in fallbacks:
        if c in low:
            return header[low.index(c)]
    return None

# =========================
# /analyze — con mapping opzionale
# =========================
@app.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    mapping: str | None = Form(None)  # JSON string opzionale
):
    fname = file.filename.lower()
    if not (fname.endswith(".csv") or fname.endswith(".xlsx")):
        raise HTTPException(status_code=400, detail="Accettiamo CSV o XLSX.")

    content = await file.read()
    header, rows = (read_csv(content) if fname.endswith(".csv") else read_xlsx(content))
    if not rows:
        raise HTTPException(status_code=400, detail="File vuoto o senza header.")

    # mapping opzionale
    mapping_obj = None
    if mapping:
        try:
            mapping_obj = json.loads(mapping)
        except:
            raise HTTPException(status_code=400, detail="Mapping JSON non valido.")

    decimal = (mapping_obj.get("options", {}).get("decimal") if mapping_obj else None) or ","
    date_fmt = (mapping_obj.get("options", {}).get("date_format") if mapping_obj else None)

    date_col = pick_col(header, (mapping_obj or {}).get("date"), DATE_CANDS)
    if not date_col:
        raise HTTPException(status_code=400, detail="Colonna 'date' non trovata o non mappata.")
    amount_col = pick_col(header, (mapping_obj or {}).get("amount"), AMOUNT_CANDS)
    price_col = pick_col(header, (mapping_obj or {}).get("price"), ["price", "prezzo", "unit_price", "unitprice"])
    qty_col = pick_col(header, (mapping_obj or {}).get("qty"), QTY_CANDS)

    # aggregazione per giorno
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
            amt = 1.0  # fallback
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

    # KPI 30gg
    last30 = [(d, v) for d, v in series if d >= (end - timedelta(days=29))]
    revenue_30 = sum(v for _, v in last30)
    orders_days = sum(1 for _, v in last30 if v > 0)
    avg_ticket = (revenue_30 / orders_days) if orders_days else 0.0

    # Trend 2w vs 2w
    vals = [v for _, v in last30]
    recent = vals[-14:] if len(vals) >= 14 else vals
    prev = vals[-28:-14] if len(vals) >= 28 else vals[:max(len(vals) - 14, 1)]
    w2_recent = mean(recent) if recent else 0.0
    w2_prev = mean(prev) if prev else 0.0
    trend_pct = ((w2_recent - w2_prev) / w2_prev * 100.0) if w2_prev else 0.0

    # Forecast semplice (moving average)
    window = 28 if len(series) >= 28 else max(7, len(series))
    base = mean([v for _, v in series][-window:]) if series else 0.0
    forecast_30_sum = base * 30.0
    forecast_change_pct = ((forecast_30_sum - revenue_30) / revenue_30 * 100.0) if revenue_30 else 0.0

    # Anomalie (z-score)
    def mean_std(xs):
        if not xs:
            return 0.0, 0.0
        m = sum(xs) / len(xs)
        var = sum((x - m) ** 2 for x in xs) / len(xs) if len(xs) > 1 else 0.0
        return m, var ** 0.5

    values = [v for _, v in series]
    m, s = mean_std(values)
    anomalies = []
    if s > 0:
        for d, v in series:
            z = (v - m) / s
            if abs(z) >= 2.5:
                anomalies.append(d.strftime("%Y-%m-%d"))

    actions = []
    if trend_pct < -5:
        actions.append({"title": "Promo mirata 7gg su top prodotti/servizi", "expected_uplift_pct": 5, "priority": "high"})
    if forecast_change_pct < 0:
        actions.append({"title": "Ribilancia stock e spingi best-seller", "expected_uplift_pct": 3, "priority": "high"})
    if anomalies:
        actions.append({"title": "Indaga giorni anomali (prezzi/resi/ads)", "expected_uplift_pct": 2, "priority": "medium"})
    if not actions:
        actions.append({"title": "Mantieni strategia, test A/B prezzo o bundle", "expected_uplift_pct": 1, "priority": "low"})

    timeseries = [{"date": d.strftime("%Y-%m-%d"), "value": float(v)} for d, v in series]

    return {
        "kpi": {
            "revenue_30d": round(revenue_30, 2),
            "orders_days_positive_30d": int(orders_days),
            "avg_ticket": round(avg_ticket, 2),
            "trend_last_2w_vs_prev_2w_pct": round(trend_pct, 2),
        },
        "forecast": {
            "method": "moving-average",
            "window_days": window,
            "forecast_30d_sum": round(forecast_30_sum, 2),
            "change_vs_last30_pct": round(forecast_change_pct, 2),
        },
        "anomalies": anomalies[:10],
        "actions": actions,
        "timeseries": timeseries,
    }

# =========================
# Advisor (LLM fallback a rule-based)
# + Paywall a crediti (Supabase)
# =========================
class KPIModel(BaseModel):
    revenue_30d: Optional[float] = None
    orders_days_positive_30d: Optional[int] = None
    avg_ticket: Optional[float] = None
    trend_last_2w_vs_prev_2w_pct: Optional[float] = None

class ForecastModel(BaseModel):
    forecast_30d_sum: Optional[float] = None
    change_vs_last30_pct: Optional[float] = None

class AnalysisIn(BaseModel):
    kpi: Optional[KPIModel] = None
    forecast: Optional[ForecastModel] = None
    anomalies: Optional[List[Dict[str, Any]]] = None
    actions: Optional[List[Dict[str, Any]]] = None

class ContextIn(BaseModel):
    period: Optional[str] = None
    mom_pct: Optional[float] = Field(None, alias="mom_pct")
    yoy_pct: Optional[float] = Field(None, alias="yoy_pct")

class AdvisorRequest(BaseModel):
    analysis: AnalysisIn
    context: Optional[ContextIn] = None
    user_id: Optional[str] = None  # ⬅︎ se presente, consumo crediti

def _sb_headers() -> Dict[str, str]:
    return {
        "apikey": SUPABASE_SERVICE_ROLE,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE}",
        "Content-Type": "application/json",
    }

def consume_credit(user_id: str) -> bool:
    """
    Consumo atomico di 1 credito via funzione RPC su Supabase:
    create or replace function public.consume_credit(uid uuid) returns boolean ...
    Ritorna True se consumato, False se crediti finiti o errore.
    """
    if not (SUPABASE_URL and SUPABASE_SERVICE_ROLE and user_id):
        return True  # se non configurato, non blocco (soft)
    try:
        url = f"{SUPABASE_URL}/rest/v1/rpc/consume_credit"
        r = requests.post(url, headers=_sb_headers(), data=json.dumps({"uid": user_id}), timeout=10)
        if r.status_code != 200:
            print("[consume_credit] bad status:", r.status_code, r.text)
            return False
        return bool(r.json())
    except Exception as e:
        print("[consume_credit] exception:", e)
        return False

def log_usage(user_id: str, event: str, meta: Dict[str, Any]):
    if not (SUPABASE_URL and SUPABASE_SERVICE_ROLE and user_id):
        return
    try:
        url = f"{SUPABASE_URL}/rest/v1/usage_events"
        payload = {"user_id": user_id, "event": event, "delta": -1, "meta": meta}
        r = requests.post(url, headers=_sb_headers(), data=json.dumps(payload), timeout=10)
        if r.status_code not in (200, 201):
            print("[log_usage] bad status:", r.status_code, r.text)
    except Exception as e:
        print("[log_usage] exception:", e)

def rule_based_advisor(a: AnalysisIn, ctx: Optional[ContextIn]) -> Dict[str, Any]:
    k = a.kpi or KPIModel()
    f = a.forecast or ForecastModel()
    mom = ctx.mom_pct if ctx else None
    yoy = ctx.yoy_pct if ctx else None

    def _eur(x, d=0):
        try:
            return ("€ {:,.%df}" % d).format(float(x)).replace(",", "X").replace(".", ",").replace("X", ".")
        except Exception:
            return "€ 0"

    def _pct(x, d=2):
        try:
            return f"{float(x):.{d}f}%"
        except Exception:
            return "0%"

    parts = []

    parts.append(
        f"Negli ultimi 30 giorni hai generato {_eur(k.revenue_30d)} di ricavi, distribuiti su "
        f"{(k.orders_days_positive_30d if k.orders_days_positive_30d is not None else '—')} giornate con vendite. "
        f"Il ticket medio si attesta a {_eur(k.avg_ticket, 2)}."
    )

    if k.trend_last_2w_vs_prev_2w_pct is not None:
        segnale = "positivo" if float(k.trend_last_2w_vs_prev_2w_pct) >= 0 else "di rallentamento"
        parts.append(
            f"Il trend delle ultime due settimane rispetto alle due precedenti è {_pct(k.trend_last_2w_vs_prev_2w_pct)}, "
            f"un segnale {segnale} che descrive bene la dinamica recente."
        )

    if f.forecast_30d_sum is not None:
        if f.change_vs_last30_pct is not None:
            tag = "in crescita" if float(f.change_vs_last30_pct) >= 0 else "in raffreddamento"
            parts.append(
                f"Il forecast a 30 giorni stima {_eur(f.forecast_30d_sum)} ({_pct(f.change_vs_last30_pct)} vs ultimi 30): "
                f"lo scenario è {tag}. Conviene preparare la capacità operativa — stock, customer care e consegne."
            )
        else:
            parts.append(
                f"Il forecast a 30 giorni stima {_eur(f.forecast_30d_sum)}. "
                "Mantieni presidio su customer journey e supply per consolidare la traiettoria."
            )

    extra = []
    if mom is not None:
        extra.append(f"MoM {_pct(mom, 1)}")
    if yoy is not None:
        extra.append(f"YoY {_pct(yoy, 1)}")
    if extra:
        parts.append("Indicatori aggiuntivi: " + " | ".join(extra) + ".")

    parts.append(
        "Non risultano anomalie rilevanti nel periodo analizzato."
        if not a.anomalies else
        f"Si registrano {len(a.anomalies)} giornate anomale da indagare (prezzi, resi, advertising)."
    )

    parts.append(
        "Linea guida: spingi ciò che già funziona e affianca esperimenti controllati — A/B prezzo o bundle, "
        "promozioni leggere e snellimento del checkout."
    )
    parts.append(
        "Rischi principali: erosione margini, stock-out e saturazione audience. "
        "Mitigazioni: soglie minime di margine, early warning scorte e refresh periodico di creatività/targeting."
    )
    parts.append(
        "Obiettivi a 30 giorni: ricavi +8–12%, AOV +3–5%, CAC stabile o in calo. "
        "Misura ogni esperimento e itera rapidamente: ogni insight deve tradursi in una decisione operativa."
    )

    advisor_text = "\n\n".join(parts)
    playbook = {
        "7d": [
            "Diagnosi driver ricavi per canale/SKU.",
            "Promo tattica 7gg sui top seller (margine protetto).",
            "A/B test su prezzo o bundle su 1 prodotto core.",
            "Snellisci checkout (campi/step, rimozione frizioni).",
            "Imposta alert su anomalie e stock.",
        ],
        "30d": [
            "Scala i canali con ROI positivo, riduci i sotto-performanti.",
            "Attiva bundle/upsell su 2–3 offerte chiave.",
            "Ottimizza supply per prevenire stock-out.",
            "Sequenza di retention sui clienti dormienti.",
            "Revisione prezzi alla luce degli esiti A/B.",
        ],
        "90d": [
            "Roadmap creatività/audience e calendario promozioni.",
            "Loyalty/CRM automation, analisi coorti e LTV.",
            "Allineamento crescita-margine e aggiornamento playbook.",
            "Standardizza best practice e documenta gli apprendimenti.",
            "Dashboard di tracking per gli esperimenti chiave.",
        ],
    }
    return {"mode": "rule-based", "advisor_text": advisor_text, "playbook": playbook}

def call_llm(advisor_prompt: str) -> Optional[str]:
    api_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    if not api_key:
        return None
    try:
        # OpenAI SDK v1
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "Sei un consulente business. Report pratico, 25-30 righe, tono diretto."},
                {"role": "user", "content": advisor_prompt},
            ],
            temperature=0.2,
            max_tokens=900,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        print("[LLM] fallback rule-based:", e)
        return None

@app.post("/advisor")
def advisor(req: AdvisorRequest):
    # 1) Paywall a crediti (se user_id presente)
    if req.user_id:
        ok = consume_credit(req.user_id)
        if not ok:
            raise HTTPException(status_code=402, detail="Crediti esauriti. Vai alla pagina Prezzi per ricaricare.")
        try:
            log_usage(req.user_id, "advisor", {"endpoint": "advisor", "period": req.context.period if req.context else None})
        except Exception:
            pass

    # 2) Prompt LLM (se configurato), altrimenti rule-based
    a = req.analysis.dict() if isinstance(req.analysis, BaseModel) else (req.analysis or {})
    ctx = req.context.dict(by_alias=True) if isinstance(req.context, BaseModel) else (req.context or {})
    k = a.get("kpi", {}) or {}
    fc = a.get("forecast", {}) or {}
    an = a.get("anomalies", []) or []
    acts = a.get("actions", []) or []
    mom = ctx.get("mom_pct", "n/d")
    yoy = ctx.get("yoy_pct", "n/d")

    prompt = (
        "Dati analisi:\n"
        f"- Ricavi30: €{k.get('revenue_30d', 0)}\n"
        f"- Giorni con vendite: {k.get('orders_days_positive_30d', 0)}\n"
        f"- Ticket medio: €{k.get('avg_ticket', 0)}\n"
        f"- Trend 2w vs 2w: {k.get('trend_last_2w_vs_prev_2w_pct', 0)}%\n"
        f"- Forecast30: €{fc.get('forecast_30d_sum', 0)} ({fc.get('change_vs_last30_pct', 0)}% vs ultimi30)\n"
        f"- MoM stimato: {mom}% | YoY stimato: {yoy}%\n"
        f"- Anomalie: {len(an)}\n"
        f"- Azioni: {[ac.get('title') for ac in acts]}\n\n"
        "Scrivi un'analisi discorsiva di 25-30 righe con cause, rischi e piano pratico (7/30/90 giorni)."
    )

    llm_text = call_llm(prompt)
    if llm_text:
        rb = rule_based_advisor(req.analysis, req.context)
        # usa playbook rule-based anche quando risponde LLM
        return {"mode": "llm", "advisor_text": llm_text, "playbook": rb["playbook"]}

    return rule_based_advisor(req.analysis, req.context)
