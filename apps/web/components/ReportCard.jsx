import { motion } from "framer-motion";

export default function ReportCard({ data }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg p-8 space-y-6 text-gray-800 leading-relaxed"
    >
      <h2 className="text-3xl font-bold text-center mb-6 text-orange-600">
        Panoramica Operativa
      </h2>

      <p className="text-lg">
        Negli ultimi <strong>30 giorni</strong> hai registrato{" "}
        <strong>€ {data.revenue}</strong> di ricavi, distribuiti su{" "}
        <strong>{data.daysWithSales}</strong> giornate attive. Il ticket medio è{" "}
        <strong>€ {data.avgTicket}</strong>.
      </p>

      <p className="text-lg">
        Rispetto alle due settimane precedenti, il trend è{" "}
        <span className="font-semibold text-green-600">+{data.trend}%</span>. Il
        forecast per i prossimi 30 giorni stima{" "}
        <strong>€ {data.forecast}</strong>, un risultato incoraggiante.
      </p>

      <div className="bg-gray-50 rounded-xl p-4">
        <h3 className="text-xl font-semibold mb-2">Consiglio operativo</h3>
        <p>
          La dinamica recente è robusta. Spingi ciò che già funziona, ma testa
          in parallelo piccole ottimizzazioni: A/B test sul prezzo, bundle o
          promozioni mirate. Prepara capacità operativa su stock e customer
          care.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-orange-50 rounded-xl p-4">
          <h4 className="text-lg font-semibold text-orange-600 mb-2">Rischi</h4>
          <ul className="list-disc ml-6 space-y-1">
            <li>Erosione dei margini</li>
            <li>Stock-out</li>
            <li>Saturazione audience</li>
          </ul>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <h4 className="text-lg font-semibold text-green-600 mb-2">
            Mitigazioni
          </h4>
          <ul className="list-disc ml-6 space-y-1">
            <li>Soglie margine minime</li>
            <li>Early warning scorte</li>
            <li>Refresh audience creativo</li>
          </ul>
        </div>
      </div>

      <p className="text-lg font-medium text-center mt-6">
        🎯 Target: +8–12% ricavi 30gg, AOV +3–5%, CAC stabile/in calo
      </p>
    </motion.div>
  );
}

