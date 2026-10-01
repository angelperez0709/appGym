import { escapeHtml } from './format.js';

export function screenHeader(title, subtitle = '') {
  return `
    <header class="space-y-1">
      <h1 class="text-3xl font-black tracking-tight text-white">${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="text-sm leading-6 text-muted">${escapeHtml(subtitle)}</p>` : ''}
    </header>`;
}

export function exerciseSelect(exercises, selectedId) {
  if (exercises.length <= 1) return '';
  return `
    <label class="block">
      <span class="label">Ejercicio</span>
      <select class="field" data-role="exercise-select">
        ${exercises.map((exercise) => `<option value="${exercise.id}" ${exercise.id === selectedId ? 'selected' : ''}>${escapeHtml(exercise.name)}</option>`).join('')}
      </select>
    </label>`;
}

export function statusPill(status) {
  const active = status === 'ACTIVE';
  return `<span class="chip ${active ? '!border-brand/40 !bg-brand/10 !text-brand' : ''}">${active ? 'ACTIVO' : 'COMPLETADO'}</span>`;
}
