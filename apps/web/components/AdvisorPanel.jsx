// apps/web/components/AdvisorPanel.jsx
// Esempio d'uso pronto: gestisce loading/dati vuoti e passa tutto ad AdvisorReport.

import AdvisorReport from "./AdvisorReport";

export default function AdvisorPanel({ kpi, reportLLM, playbooks, actions, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow p-8 text-center text-gray-500">
        Genero l’analisi...
      </div>
    );
  }

  if (!kpi && !reportLLM) {
    return (
      <div className="bg-white rounded-2xl shadow p-8 text-center text-gray-500">
        Carica un file o seleziona un’analisi per vedere il report.
      </div>
    );
  }

  return (
    <AdvisorReport
      kpi={kpi || {}}
      reportLLM={reportLLM || ""}
      playbooks={playbooks}
      actions={actions}
    />
  );
}
