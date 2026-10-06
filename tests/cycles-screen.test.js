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
  assert.match(container.innerHTML, /data-delete-session="3"/);
  assert.match(container.innerHTML, /<article[^>]*data-cycle-card="2"/);
  assert.match(container.innerHTML, /data-delete-cycle="2">Eliminar ciclo</);
  assert.match(container.innerHTML, /data-edit-label>Ocultar</);
  assert.doesNotMatch(container.innerHTML, />Guardar<|>Acción</);
  assert.doesNotMatch(container.innerHTML, /placeholder=|name="formula"|Mayhew/);
});

test('eliminar exige confirmación y espera a que el borrado termine antes de actualizar la pantalla', async () => {
  const state = { exerciseId: 1, expandedCycleId: 2 };
  let click;
  let allowed = false;
  let removed = false;
  let reads = 0;
  const button = {
    disabled: false, dataset: { deleteCycle: '2' },
    addEventListener: (_, handler) => { click = handler; },
    closest: () => ({ isConnected: true, querySelectorAll: () => [button] }),
  };
  const container = {
    innerHTML: '', querySelector: () => null,
    querySelectorAll: (selector) => selector === '[data-delete-cycle]' && !removed ? [button] : [],
  };
  await renderCyclesScreen(container, {
    state, rerender: () => assert.fail('No debe reiniciar la pantalla'), toast: () => {},
    confirm: (message) => {
      assert.match(message, /Borrar.*todas sus sesiones.*no se puede deshacer/);
      return allowed;
    },
    service: {
      getCyclesSnapshot: async () => {
        reads++;
        return { exerciseId: 1, exercises: [], cycles: removed ? [] : [{ id: 2, name: 'Borrar', type: 'FIXED_BLOCKS', sessions: [] }] };
      },
      deleteCycle: async (id) => { assert.equal(id, 2); assert.equal(button.disabled, true); removed = true; },
    },
  });
  await click();
  assert.equal(removed, false);
  assert.equal(button.disabled, false);
  allowed = true;
  await click();
  assert.equal(removed, true);
  assert.equal(state.expandedCycleId, null);
  assert.equal(reads, 2);
  assert.match(container.innerHTML, /Aún no hay ciclos/);
});

test('eliminar una sesión pide confirmación y conserva el panel abierto sin recargar', async () => {
  const state = { exerciseId: 1, expandedCycleId: 2 };
  let click;
  let allowed = false;
  let deleted = false;
  const card = { isConnected: true, querySelectorAll: () => [button] };
  const row = { dataset: { cycleId: '2', sessionRow: '3' }, closest: () => card };
  const button = { disabled: false, closest: () => row, addEventListener: (_, handler) => { click = handler; } };
  const container = { innerHTML: '', querySelector: () => null,
    querySelectorAll: (selector) => selector === '[data-delete-session]' && !deleted ? [button] : [] };
  await renderCyclesScreen(container, {
    state, toast: () => {}, rerender: () => assert.fail('No debe reiniciar la página'),
    confirm: (message) => { assert.match(message, /Eliminar esta sesión/); return allowed; },
    service: {
      getCyclesSnapshot: async () => ({ exerciseId: 1, exercises: [], cycles: [] }),
      deleteSession: async (ids) => { assert.deepEqual(ids, { cycleId: 2, sessionId: 3 }); assert.equal(button.disabled, true); deleted = true; },
    },
  });
  await click();
  assert.equal(deleted, false);
  allowed = true;
  await click();
  assert.equal(deleted, true);
  assert.equal(state.expandedCycleId, 2);
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
