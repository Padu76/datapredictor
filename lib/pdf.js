// lib/pdf.js
// Lightweight PDF export for Advisor Plus (no extra deps needed on server; runs on client)
export async function exportAdvisorPlusPDF({ target, dateCol, domain, baseline, ai, unified, narrative }) {
  // dynamic import jspdf only on client
  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  let y = margin;

  const addTitle = (t) => { doc.setFontSize(20); doc.text(t, margin, y); y += 26; };
  const addSub = (t) => { doc.setFontSize(12); doc.setTextColor(80); doc.text(t, margin, y); doc.setTextColor(0); y += 18; };
  const addH2 = (t) => { doc.setFontSize(14); doc.setFont(undefined,'bold'); doc.text(t, margin, y); doc.setFont(undefined,'normal'); y += 18; };
  const addPara = (t) => {
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(String(t), 515);
    for (const ln of lines) { if (y > 770) { doc.addPage(); y = margin; } doc.text(ln, margin, y); y += 14; }
    y += 6;
  };
  const addList = (arr) => {
    doc.setFontSize(11);
    for (const it of (arr||[])) {
      if (y > 770) { doc.addPage(); y = margin; }
      const bullet = '• ' + String(it);
      const lines = doc.splitTextToSize(bullet, 515);
      for (const ln of lines) { if (y > 770) { doc.addPage(); y = margin; } doc.text(ln, margin, y); y += 14; }
    }
    y += 6;
  };

  // Header
  addTitle('DataPredictor — Advisor Report');
  addSub(`Target: ${target || '—'}   |   Data: ${dateCol || '—'}   |   Dominio: ${domain || '—'}`);

  // Unified section
  addH2('Advisor Unificato');
  addH2('Breve (1–3 mesi)'); addList(unified?.horizonActions?.short || []);
  addH2('Medio (3–6 mesi)'); addList(unified?.horizonActions?.medium || []);
  addH2('Lungo (6+ mesi)'); addList(unified?.horizonActions?.long || []);

  // Narrative
  if (narrative) {
    addH2('Report discorsivo (AI)');
    addPara(narrative);
  }

  // AI section (raw)
  if (ai) {
    addH2('Consulenza PRO (AI) — dettaglio');
    addH2('Breve'); addList(ai?.horizonActions?.short || []);
    addH2('Medio'); addList(ai?.horizonActions?.medium || []);
    addH2('Lungo'); addList(ai?.horizonActions?.long || []);
    if (ai?.risks?.length) { addH2('Rischi'); addList(ai.risks); }
  }

  doc.save(`Advisor_${target || 'report'}.pdf`);
}

// Compat API (se in altre parti del progetto veniva importato exportAnalysisPDF)
export async function exportAnalysisPDF(el, filename='Report.pdf') {
  // Fallback minimal: stampa la pagina corrente
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.text('Report DataPredictor', 40, 50);
  doc.save(filename);
}
