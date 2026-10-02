import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCyclesScreen } from '../src/ui/screens/cycles-screen.js';

test('muestra un ejercicio, referencia precargada y tabla editable sin placeholders ni selector de fórmula', async () => {
  const container = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  await renderCyclesScreen(container, {
    state: { exerciseId: 1, expandedCycleId: 2 },
    service: { getCyclesSnapshot: async () => ({
      exerciseId: 1, exercises: [{ id: 1, name: 'Banca' }], previousOneRmKg: 105,
      cycles: [{ id: 2, name: 'Anterior', type: 'PROGRESSIVE', status: 'COMPLETED', startOneRmKg: 100,
        startPercentage: 50, incrementKg: 2.5, startedAt: '2026-10-01', totalReps: 20, totalVolumeKg: 1200,
        bestEstimatedOneRmKg: 105, sessions: [{ id: 3, performedAt: '2026-10-01', weightKg: 60, reps: 20, estimatedOneRmKg: 100 }] }],
    }) },
  });
  assert.match(container.innerHTML, /data-role="exercise-select"/);
  assert.match(container.innerHTML, /name="oneRm"[^>]*value="105"/);
  assert.match(container.innerHTML, /1RM de referencia: 100 kg/);
  assert.match(container.innerHTML, /<table/);
  assert.match(container.innerHTML, /data-session-row="3"/);
  assert.match(container.innerHTML, /<article[^>]*data-cycle-card="2"/);
  assert.match(container.innerHTML, /data-edit-label>Ocultar</);
  assert.doesNotMatch(container.innerHTML, />Guardar<|>Acción</);
  assert.doesNotMatch(container.innerHTML, /placeholder=|name="formula"|Mayhew/);
});

test('Editar abre y Ocultar cierra el panel sin volver a renderizar la pantalla', async () => {
  const panel = { hidden: true };
  const label = { textContent: 'Editar' };
  let click;
  const button = {
    dataset: { openCycle: '2' },
    addEventListener: (event, handler) => { if (event === 'click') click = handler; },
    setAttribute: (name, value) => { button[name] = value; },
    closest: () => card,
  };
  const card = {
    querySelector: (selector) => selector === '[data-session-panel]' ? panel : label,
    querySelectorAll: () => [button],
  };
  const container = {
    innerHTML: '', querySelector: () => null,
    querySelectorAll: (selector) => selector === '[data-open-cycle]' ? [button] : [],
  };
  const state = { exerciseId: 1 };
  await renderCyclesScreen(container, {
    state,
    rerender: () => assert.fail('No debe recargar la pantalla'),
    service: { getCyclesSnapshot: async () => ({ exerciseId: 1, exercises: [], cycles: [] }) },
  });
  click();
  assert.equal(panel.hidden, false);
  assert.equal(label.textContent, 'Ocultar');
  assert.equal(button['aria-expanded'], 'true');
  click();
  assert.equal(panel.hidden, true);
  assert.equal(label.textContent, 'Editar');
  assert.equal(button['aria-expanded'], 'false');
});
