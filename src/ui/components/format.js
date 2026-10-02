import { roundDecimal } from '../../domain/numbers.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatKg(value, maximumFractionDigits = 2) {
  return `${formatNumber(value, maximumFractionDigits)} kg`;
}

export function formatNumber(value, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: Math.min(maximumFractionDigits, 2) }).format(roundDecimal(value) || 0);
}

export function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

export function parseDecimal(value) {
  return Number(String(value ?? '').trim().replace(',', '.'));
}
