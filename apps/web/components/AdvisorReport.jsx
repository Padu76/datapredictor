// apps/web/components/AdvisorReport.jsx
// Report consulenziale: font moderno, testo grande, riquadri eleganti.
// Nessuna dipendenza esterna.

const brandColor = process.env.NEXT_PUBLIC_BRAND_COLOR || "#f97316";

function Euro(num, digits = 0) {
  if (num === null || num === undefined || isNaN(num)) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(num));
}

function Pct(num, digits = 2) {
  if (num === null || num === undefined || isNaN(num)) return "—";
  return `${Number(num).toFixed(digits)}%`;
}

// De-duplica righe ripetute e pulisce spaziature
function cleanText(text = "") {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const seen = new Set();
  const dedup = [];
  for (const l of lines) {
    const key = l.replace(/\s+/g, " ").toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      dedup.push(l);
    }
  }
  return dedup.join("\n");
}

// Se manca il testo LLM, costruisce una narrativa base dai KPI
function buildNarrativeFromKPI(kpi = {}) {
  const {
    revenue_30d,
    days_with_sales,
    avg_ticket,
    trend_last_2w_vs_prev_2w_pct,
    forecast_30d,
    anomalies = [],
  } = kpi;

  const parts = [];

  parts.push(
    `Negli ultimi 30 giorni hai generato ${Euro(revenue_30d)} di ricavi, distribuiti su ${days_with_sales ?? "—"} giornate con vendite. Il ticket medio è ${Euro(avg_ticket, 2)}.`
  );

  if (trend_last_2w_vs_prev_2w_pct != null) {
    const sign = Number(trend_last_2w_vs_prev_2w_pct) >= 0 ? "+" : "";
    parts.push(
      `Il trend delle ultime 2 settimane rispetto alle 2 precedenti è ${sign}${Pct(
        trend_last_2w_vs_prev_2w_pct
      )}, un segnale ${Number(trend_last_2w_vs_prev_2w_pct) >= 0 ? "positivo" : "di rallentamento"}.`
    );
  }

  if (forecast_30d != null) {
    parts.push(
      `Guardando avanti, il forecast a 30 giorni stima ${Euro(
        forecast_30d
      )}. Ha senso preparare capacità operativa (stock, customer care, consegne) per sostenere il volume.`
    );
  }

  if (Array.isArray(anomalies) && anomalies.length > 0) {
    parts.push(
      `Sono emerse alcune anomalie da monitorare (es. ${anomalies
        .slice(0, 3)
        .join(", ")}${anomalies.length > 3 ? ", ..." : ""}).`
    );
  } else {
    parts.push(`Non emergono anomalie rilevanti nel periodo analizzato.`);
  }

  parts.push(
    `Piano pratico: spingi ciò che funziona e, in parallelo, testa ottimizzazioni leggere (A/B test su prezzo o bundle, promozioni sostenibili). Imposta soglie minime di margine e un alert scorte per evitare stock-out.`
  );

  return parts.join("\n\n");
}

export default function AdvisorReport({
  kpi = {},
  reportLLM = "",
  playbooks = {
    "7 giorni": [
      "Diagnosi driver ricavi (canali/SKU).",
      "Promo tattica 7gg sui top SKU (margine protetto).",
      "Test A/B prezzo/bundle su 1 prodotto core.",
      "Snellisci checkout (campi, step).",
      "Setup alert anomalie.",
    ],
    "30 giorni": [
      "Scala canali ROI+, spegni i sotto-performanti.",
      "Bundle/upsell su 2–3 offerte.",
      "Ottimizza supply per evitare stock-out.",
      "Sequenza retention su clienti dormienti.",
      "Revisione prezzo sulla base dei test.",
    ],
    "90 giorni": [
      "Roadmap creatività/audience.",
      "Listino e promo calendar per stagionalità.",
      "Cohort/LTV, loyalty e automazioni CRM.",
      "Allineamento crescita/margine e aggiornamento playbook.",
      "Documenta gli apprendimenti.",
    ],
  },
  actions = [
    { label: "Mantieni strategia, test A/B prezzo o bundle", impact: "≈ +1%", priority: "low" },
  ],
}) {
  // Testo finale (LLM pulito oppure narrativa da KPI)
  const narrative = (reportLLM?.trim() ? cleanText(reportLLM) : buildNarrativeFromKPI(kpi))
    .split(/\n{2,}/); // spezza in paragrafi vuoto-vuoto

  return (
    <section className="max-w-6xl mx-auto font-sans"> {/* forza font moderno */}
      {/* Header + CTA */}
      <div className="flex items-center justify-between mb-6">
        <h2
          className="text-3xl md:text-4xl font-extrabold tracking-tight"
          style={{ color: brandColor }}
        >
          Report consulenziale
        </h2>
        <button
          type="button"
          className="px-4 py-2 rounded-xl text-white font-semibold shadow"
          style={{ backgroundColor: brandColor }}
          onClick={() => window.dispatchEvent(new CustomEvent("generate-advisor-report"))}
        >
          Genera di nuovo
        </button>
      </div>

      {/* Card principale del testo */}
      <div className="rounded-2xl shadow-lg p-8 md:p-10 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60">
        <h3 className="text-2xl md:text-3xl font-bold mb-6" style={{ color: brandColor }}>
          Panoramica operativa
        </h3>

        {/* Paragrafi grandi e leggibili */}
        <div className="space-y-5">
          {narrative.map((para, i) => (
            <p key={i} className="text-xl md:text-2xl leading-relaxed text-zinc-800 dark:text-zinc-100">
              {para}
            </p>
          ))}
        </div>

        {/* KPI riassuntivi dentro il riquadro */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
          <div className="rounded-xl p-4 text-center bg-zinc-50 dark:bg-zinc-800">
            <div className="text-sm text-zinc-500 dark:text-zinc-400">Ricavi 30gg</div>
            <div className="text-2xl md:text-3xl font-extrabold">{Euro(kpi.revenue_30d)}</div>
          </div>
          <div className="rounded-xl p-4 text-center bg-zinc-50 dark:bg-zinc-800">
            <div className="text-sm text-zinc-500 dark:text-zinc-400">Giorni con vendite</div>
            <div className="text-2xl md:text-3xl font-extrabold">{kpi.days_with_sales ?? "—"}</div>
          </div>
          <div className="rounded-xl p-4 text-center bg-zinc-50 dark:bg-zinc-800">
            <div className="text-sm text-zinc-500 dark:text-zinc-400">Ticket medio</div>
            <div className="text-2xl md:text-3xl font-extrabold">{Euro(kpi.avg_ticket, 2)}</div>
          </div>
          <div className="rounded-xl p-4 text-center bg-zinc-50 dark:bg-zinc-800">
            <div className="text-sm text-zinc-500 dark:text-zinc-400">Trend 2w vs prev.</div>
            <div className="text-2xl md:text-3xl font-extrabold text-emerald-600">
              {Pct(kpi.trend_last_2w_vs_prev_2w_pct)}
            </div>
          </div>
        </div>
      </div>

      {/* Playbooks */}
      <div className="grid md:grid-cols-3 gap-6 mt-8">
        {Object.entries(playbooks).map(([title, items]) => (
          <div
            key={title}
            className="rounded-2xl shadow p-6 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60"
          >
            <h4 className="text-xl md:text-2xl font-semibold mb-3" style={{ color: brandColor }}>
              Playbook {title}
            </h4>
            <ul className="list-disc ml-6 space-y-2 text-lg md:text-xl text-zinc-800 dark:text-zinc-200">
              {items.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Azioni consigliate */}
      {actions && actions.length > 0 && (
        <div className="rounded-2xl shadow p-6 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 mt-6">
          <h4 className="text-xl md:text-2xl font-semibold mb-3" style={{ color: brandColor }}>
            Azioni consigliate
          </h4>
          <ol className="list-decimal ml-6 space-y-3 text-lg md:text-xl text-zinc-800 dark:text-zinc-100">
            {actions.map((a, i) => (
              <li key={i}>
                <span className="font-semibold">{a.label || a.title}</span>
                {a.impact ? ` — impatto atteso ${a.impact}` : ""}
                {a.priority ? ` — priorità ${a.priority}` : ""}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
