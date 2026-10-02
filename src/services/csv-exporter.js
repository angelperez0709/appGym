import { roundDecimal } from '../domain/numbers.js';
const DEFAULT_FILENAME = 'bilbo-tracker.csv';

export function downloadCsv(rows, filename = DEFAULT_FILENAME) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Todavía no hay entrenamientos que exportar.');
  }

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(',')),
  ].join('\r\n');

  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeCsv(value) {
  const text = value == null ? '' : String(typeof value === 'number' ? roundDecimal(value) : value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}
