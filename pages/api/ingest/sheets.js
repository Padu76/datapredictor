// pages\api\ingest\sheets.js
// TEMPORANEAMENTE DISABILITATO - Import problematico durante build
// TODO: Fixare import lib/connectors/googleSheets

export default async function handler(req, res) {
  return res.status(501).json({ 
    error: 'Google Sheets ingest temporaneamente disabilitato',
    message: 'Usa upload diretto CSV/XLSX dalla pagina /upload'
  });
}