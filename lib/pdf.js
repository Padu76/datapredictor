export async function exportAnalysisPDF(el, filename = 'report.pdf') {
  // dynamic imports to avoid SSR issues
  const html2canvas = (await import('html2canvas')).default;
  const jsPDF = (await import('jspdf')).default;

  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#0b0e14' });
  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Fit image to page width
  const ratio = canvas.width / canvas.height;
  const pdfWidth = pageWidth - 40;
  const pdfHeight = pdfWidth / ratio;

  pdf.addImage(imgData, 'PNG', 20, 20, pdfWidth, pdfHeight);
  pdf.save(filename);
}
