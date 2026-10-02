import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTrainScreen } from '../src/ui/screens/train-screen.js';

test('guardar actualiza el contenido y el siguiente peso sin rerender ni enfoque automático', async () => {
  const snapshot = {
    exerciseId: 1, exercises: [{ id: 1, name: 'Banca' }],
    cycle: { id: 2, name: 'Ciclo', type: 'PROGRESSIVE', totalReps: 0, totalVolumeKg: 0 },
    sessions: [], prescription: { weightKg: 50, label: 'Primera sesión' },
  };
  const content = { innerHTML: '' };
  const button = { disabled: false };
  let submit;
  let reads = 0;
  const form = {
    isConnected: true, dataset: { cycleId: '2' },
    elements: { namedItem: () => ({ value: '20' }) },
    querySelector: () => button,
    addEventListener: (_, listener) => { submit = listener; },
  };
  const container = {
    innerHTML: '',
    querySelector: (selector) => {
      if (selector === '[data-role="session-form"]') return form;
      if (selector === '[data-role="training-content"]') return content;
      if (selector.includes('input')) assert.fail('No debe enfocar el input');
      return null;
    },
  };
  await renderTrainScreen(container, {
    state: {}, toast: () => {}, rerender: () => assert.fail('No debe recargar la pantalla'),
    service: {
      getTrainingSnapshot: async () => {
        reads++;
        return reads === 1 ? snapshot : { ...snapshot, cycle: { ...snapshot.cycle, totalReps: 20, totalVolumeKg: 1000 }, prescription: { weightKg: 52.5, label: 'Sube el peso' } };
      },
      logPrescribedSession: async (input) => {
        assert.deepEqual(input, { cycleId: 2, reps: 20 });
        return { cycleCompleted: false };
      },
    },
  });
  await submit({ preventDefault() {} });
  assert.equal(reads, 2);
  assert.match(content.innerHTML, /52,5/);
  assert.match(content.innerHTML, />20<\/p>/);
});
