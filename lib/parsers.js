import Papa from 'papaparse';
import * as XLSX from 'xlsx';

/** Parse a File object (CSV/XLS/XLSX) into array of rows (objects) */
export async function parseAnyFile(file) {
  const name = (file?.name || '').toLowerCase();
  if (name.endsWith('.csv')) {
    return await parseCSV(file);
  }
  if (name.endsWith('.xls') || name.endsWith('.xlsx')) {
    return await parseXLS(file);
  }
  // Try sniffing content if no extension
  // Fallback CSV
  return await parseCSV(file);
}

export function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (res) => resolve((res.data || []).filter(Boolean)),
      error: (err) => reject(err)
    });
  });
}

export async function parseXLS(file) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows;
}
