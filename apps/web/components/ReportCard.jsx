// apps/web/components/ReportCard.jsx
const brandColor = process.env.NEXT_PUBLIC_BRAND_COLOR || "#f97316";

function Euro({ value, digits = 0 }) {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Number(value));
}

function Pct({ value, digits = 2 }) {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return `${Number(value).toFixed(digits)}%`;
}

export default function ReportCard({ data }) {
  const {
    revenue_30d,
    days_with_sales,
    avg_ticket,
    trend_last_2w_vs_prev_2w_pct,
    forecast_30d,
    anomalies = [],
  } = data || {};

  const hasAnomalies = Array.isArray(anomalies) && anomalies.length > 0;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6 text-gray-800 leading-relaxed">
      <h2
        className="text-3xl font-extrabold text-center mb-2"
        style={{ color: brandColor }}
      >
        Panoramica Operativa
      </h2>
      <p className="text-center text-gray-500">lettura consulenziale e azionabile</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <div className="text-sm text-gray-500">Ricavi 30gg</div>
          <div className="text-2xl font-bold"><Euro value={revenue_30d} /></div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <div className="text-sm text-gray-500">Giorni con vendite</div>
          <div className="text-2xl font-bold">{days_with_sales ?? "—"}</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <div className="text-sm text-gray-500">Ticket medio</div>
          <div className="text-2xl font-bold"><Euro value={avg_ticket} digits={2} /></div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <div className="text-sm text-gray-500">Trend 2w vs prev.</div>
          <div className="text-2xl font-bold text-green-600">
            <Pct value={trend_last_2w_vs_prev_2w_pct} />
          </div>
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl p-4">
        <h3 className="text-xl font-semibold mb-2">Lettura sintetica</h3>
        <p className="text-lg">
          Negli ultimi <strong>30 giorni</strong> hai generato{" "}
          <strong><Euro value={revenue_30d} /></strong> su{" "}
          <strong>{days_with_sales ?? "—"}</strong> giornate attive. Il ticket
          medio è <strong><Euro value={avg_ticket} digits={2} /></strong>. Il
          trend a 2 settimane è{" "}
          <strong className="text-green-600">
            <Pct value={trend_last_2w_vs_prev_2w_pct} />
          </strong>
          , indice di una dinamica in miglioramento. La proiezione a 30 giorni
          stima <strong><Euro value={forecast_30d} /></strong>: conviene
          preparare capacità operativa (stock, customer care, consegne).
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white border rounded-xl p-4">
          <h4 className="text-lg font-semibold mb-2" style={{ color: brandColor }}>
            Azioni tattiche (2-3 settimane)
          </h4>
          <ul className="list-disc ml-6 space-y-1">
            <li>A/B test su prezzo o bundle mirati</li>
            <li>Promozioni sostenibili sui top seller</li>
            <li>Checkout fluido + reminder carrello</li>
          </ul>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <h4 className="text-lg font-semibold mb-2" style={{ color: brandColor }}>
            Rischi & Mitigazioni
          </h4>
          <ul className="list-disc ml-6 space-y-1">
            <li>Margini: imposta soglie minime automatiche</li>
            <li>Stock-out: early warning su giacenze</li>
            <li>Saturazione: refresh audience/creatività</li>
          </ul>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <h4 className="text-lg font-semibold mb-2" style={{ color: brandColor }}>
            Target misurabili (30gg)
          </h4>
          <ul className="list-disc ml-6 space-y-1">
            <li>Ricavi +8–12%</li>
            <li>AOV +3–5%</li>
            <li>CAC stabile o in calo</li>
          </ul>
        </div>
      </div>

      <div className={`${hasAnomalies ? "bg-amber-50" : "bg-green-50"} rounded-xl p-4`}>
        <h4 className="text-lg font-semibold mb-2">
          {hasAnomalies ? "Anomalie da monitorare" : "Stato qualità dati"}
        </h4>
        {hasAnomalies ? (
          <ul className="list-disc ml-6 space-y-1">
            {anomalies.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        ) : (
          <p>Nessuna anomalia rilevante nel periodo analizzato.</p>
        )}
      </div>

      <p className="text-center text-sm text-gray-500">
        Nota: misura ogn
