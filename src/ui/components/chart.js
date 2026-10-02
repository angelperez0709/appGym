import { escapeHtml, formatNumber } from './format.js';

export function lineChart({ series, suffix = '', title = 'Gráfica de evolución', emptyText = 'Aún no hay datos.' }) {
  const points = series.flatMap((item) => item.points);
  if (!points.length) {
    return `<div class="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-line bg-panel2/50 px-4 text-center text-sm text-muted">${escapeHtml(emptyText)}</div>`;
  }

  const sessionCount = Math.max(...series.map((item) => item.points.length));
  const width = 640;
  const height = 340;
  const padding = { top: 24, right: 18, bottom: 36, left: 64 };
  const values = points.map((point) => Number(point.value) || 0);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const min = rawMin === rawMax ? Math.max(0, rawMin - Math.max(rawMin * 0.08, 1)) : rawMin;
  const max = rawMin === rawMax ? rawMax + Math.max(rawMax * 0.08, 1) : rawMax;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const colors = ['#4ade80', '#60a5fa', '#fbbf24', '#f472b6', '#a78bfa', '#22d3ee', '#fb923c'];
  const lines = series.map((item, cycleIndex) => {
    const color = colors[cycleIndex % colors.length];
    const dash = cycleIndex < colors.length ? '' : `stroke-dasharray="${4 + Math.floor(cycleIndex / colors.length) * 2} 4"`;
    const xy = item.points.map((point, index) => ({
      ...point,
      x: sessionCount === 1 ? padding.left + plotWidth / 2 : padding.left + index / (sessionCount - 1) * plotWidth,
      y: padding.top + (1 - (point.value - min) / (max - min)) * plotHeight,
    }));
    const polyline = xy.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const dots = xy.map(({ x, y, value, label }) => `
      <circle cx="${x}" cy="${y}" r="4" fill="${color}">
        <title>${escapeHtml(`${item.name} · ${label}: ${formatNumber(value, 1)}${suffix}`)}</title>
      </circle>`).join('');
    return `<g aria-label="${escapeHtml(item.name)}">
      <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="3" ${dash} stroke-linecap="round" stroke-linejoin="round" />
      ${dots}
    </g>`;
  }).join('');
  const legend = series.map((item, index) => `<li class="flex items-center gap-2 text-xs text-muted">
    <svg width="24" height="12" aria-hidden="true"><line x1="0" y1="6" x2="24" y2="6" stroke="${colors[index % colors.length]}" stroke-width="3" ${index < colors.length ? '' : `stroke-dasharray="${4 + Math.floor(index / colors.length) * 2} 4"`} /></svg>
    <span>${escapeHtml(item.name)}${item.points.length ? '' : ' (sin sesiones)'}</span>
  </li>`).join('');

  const grid = Array.from({ length: 11 }, (_, index) => index / 10).map((ratio) => {
    const y = padding.top + ratio * plotHeight;
    const value = max - ratio * (max - min);
    return `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#303641" stroke-width="1" />
      <text x="${padding.left - 8}" y="${y + 4}" fill="#9ca3af" font-size="12" text-anchor="end">${escapeHtml(formatNumber(value, 1))}</text>`;
  }).join('');

  const sessionLabels = Array.from({ length: sessionCount }, (_, index) => {
    const x = sessionCount === 1 ? padding.left + plotWidth / 2 : padding.left + index / (sessionCount - 1) * plotWidth;
    return `<text x="${x}" y="${height - 10}" fill="#9ca3af" font-size="12" text-anchor="middle" data-axis="session">${index + 1}</text>`;
  }).join('');

  return `
    <div class="min-w-0 overflow-hidden rounded-xl bg-panel2/40 p-2">
      <svg viewBox="0 0 ${width} ${height}" class="h-auto w-full" role="img" aria-label="${escapeHtml(title)}">
        ${grid}
        ${lines}
        ${sessionLabels}
      </svg>
      <ul class="mt-2 flex flex-wrap gap-3" aria-label="Ciclos">${legend}</ul>
    </div>`;
}
