import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CYCLE_STATUS,
  CYCLE_TYPE,
  FIXED_BLOCK_SESSIONS_PER_WEIGHT,
  PROGRESSIVE_END_REPS,
  calculateVolume,
  estimateOneRm,
  initialWeightFromOneRm,
  isCycleCompletedAfterSession,
  nextPrescription,
} from '../src/domain/bilbo.js';

const progressiveCycle = {
  id: 1,
  status: CYCLE_STATUS.ACTIVE,
  type: CYCLE_TYPE.PROGRESSIVE,
  startWeightKg: 50,
  incrementKg: 2.5,
};

test('calcula el peso inicial a partir del porcentaje del 1RM', () => {
  assert.equal(initialWeightFromOneRm(100, 50), 50);
  assert.equal(initialWeightFromOneRm(103, 50, 0.5), 51.5);
});

test('el ciclo progresivo prescribe incremento y termina con 15 reps o menos', () => {
  const first = nextPrescription(progressiveCycle, []);
  assert.equal(first.weightKg, 50);

  const sessions = [{ id: 1, performedAt: '2026-10-01T10:00:00Z', weightKg: 50, reps: 24 }];
  assert.equal(nextPrescription(progressiveCycle, sessions).weightKg, 52.5);

  const ending = [...sessions, { id: 2, performedAt: '2026-10-03T10:00:00Z', weightKg: 52.5, reps: PROGRESSIVE_END_REPS }];
  assert.equal(isCycleCompletedAfterSession(progressiveCycle, ending), true);
});

test('el ciclo 3x4 hace cuatro entrenamientos por peso en orden', () => {
  const cycle = { id: 2, status: CYCLE_STATUS.ACTIVE, type: CYCLE_TYPE.FIXED_BLOCKS };
  const weights = [60, 62.5, 65].map((weightKg, position) => ({
    position,
    weightKg,
    targetSessions: FIXED_BLOCK_SESSIONS_PER_WEIGHT,
  }));
  const sessions = Array.from({ length: 4 }, (_, index) => ({
    id: index + 1,
    performedAt: `2026-10-0${index + 1}T10:00:00Z`,
    weightKg: 60,
    reps: 20,
  }));

  const next = nextPrescription(cycle, sessions, weights);
  assert.equal(next.weightKg, 62.5);
  assert.equal(next.blockProgress, '1/4');

  const all = weights.flatMap((weight) => Array.from({ length: 4 }, (_, index) => ({
    id: weight.position * 4 + index + 1,
    performedAt: `2026-10-${String(weight.position * 4 + index + 1).padStart(2, '0')}T10:00:00Z`,
    weightKg: weight.weightKg,
    reps: 20,
  })));
  assert.equal(isCycleCompletedAfterSession(cycle, all, weights), true);
});

test('volumen y e1RM se calculan como métricas derivadas', () => {
  assert.equal(calculateVolume(60, 20), 1200);
  assert.equal(estimateOneRm(60, 1, 'EPLEY'), 60);
  assert.equal(estimateOneRm(60, 30, 'EPLEY'), 120);
});
