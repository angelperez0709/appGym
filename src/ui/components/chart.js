import { escapeHtml, formatNumber } from './format.js';

export function lineChart({ points, suffix = '', emptyText = 'Aún no hay datos.' }) {
  if (!points.length) {
    return `<div class="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-line bg-panel2/50 px-4 text-center text-sm text-muted">${escapeHtml(emptyText)}</div>`;
  }

  const width = 640;
  const height = 260;
  const padding = { top: 24, right: 18, bottom: 36, left: 48 };
  const values = points.map((point) => Number(point.value) || 0);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(rawMax - rawMin, rawMax * 0.08, 1);
  const min = Math.max(0, rawMin - spread * 0.12);
  const max = rawMax + spread * 0.12;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const xy = points.map((point, index) => {
    const x = points.length === 1
      ? padding.left + plotWidth / 2
      : padding.left + (index / (points.length - 1)) * plotWidth;
    const y = padding.top + (1 - (point.value - min) / Math.max(max - min, 1)) * plotHeight;
    return { x, y, ...point };
  });

  const polyline = xy.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const grid = [0, 0.5, 1].map((ratio) => {
    const y = padding.top + ratio * plotHeight;
    const value = max - ratio * (max - min);
    return `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#303641" stroke-width="1" />
      <text x="${padding.left - 8}" y="${y + 4}" fill="#9ca3af" font-size="12" text-anchor="end">${escapeHtml(formatNumber(value, 1))}</text>`;
  }).join('');

  const dots = xy.map(({ x, y, value, label }) => `
    <circle cx="${x}" cy="${y}" r="4" fill="#4ade80">
      <title>${escapeHtml(`${label}: ${formatNumber(value, 1)}${suffix}`)}</title>
    </circle>`).join('');

  const firstLabel = escapeHtml(points[0]?.label ?? '1');
  const lastLabel = escapeHtml(points.at(-1)?.label ?? String(points.length));

  return `
    <div class="overflow-hidden rounded-xl bg-panel2/40 p-2">
      <svg viewBox="0 0 ${width} ${height}" class="h-auto w-full" role="img" aria-label="Gráfica de evolución">
        ${grid}
        <polyline points="${polyline}" fill="none" stroke="#4ade80" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        ${dots}
        <text x="${padding.left}" y="${height - 10}" fill="#9ca3af" font-size="12">${firstLabel}</text>
        <text x="${width - padding.right}" y="${height - 10}" fill="#9ca3af" font-size="12" text-anchor="end">${lastLabel}</text>
      </svg>
    </div>`;
}
