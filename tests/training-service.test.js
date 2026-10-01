import test from 'node:test';
import assert from 'node:assert/strict';
import { TrainingService } from '../src/application/training-service.js';

class MemoryRepository {
  constructor() {
    this.exercises = [];
    this.cycles = [];
    this.weights = [];
    this.sessions = [];
    this.ids = { exercise: 1, cycle: 1, weight: 1, session: 1 };
  }

  async ready() {}
  async listExercises() { return [...this.exercises]; }
  async createExercise(exercise) {
    const id = this.ids.exercise++;
    this.exercises.push({ ...exercise, id });
    return id;
  }
  async listCycles(exerciseId = null) {
    return this.cycles
      .filter((cycle) => exerciseId == null || cycle.exerciseId === exerciseId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  async getCycle(id) { return this.cycles.find((cycle) => cycle.id === id) ?? null; }
  async getActiveCycle(exerciseId) {
    return this.cycles.find((cycle) => cycle.exerciseId === exerciseId && cycle.status === 'ACTIVE') ?? null;
  }
  async createCycle(cycle) {
    const id = this.ids.cycle++;
    this.cycles.push({ ...cycle, id });
    return id;
  }
  async createCycleWithWeights(cycle, weights) {
    const id = await this.createCycle(cycle);
    for (const weight of weights) this.weights.push({ ...weight, id: this.ids.weight++, cycleId: id });
    return id;
  }
  async listCycleWeights(cycleId) { return this.weights.filter((weight) => weight.cycleId === cycleId); }
  async listCycleSessions(cycleId) { return this.sessions.filter((session) => session.cycleId === cycleId); }
  async listAllSessions() { return [...this.sessions]; }
  async saveSessionAndCycle(session, updatedCycle) {
    const id = this.ids.session++;
    this.sessions.push({ ...session, id });
    const index = this.cycles.findIndex((cycle) => cycle.id === updatedCycle.id);
    this.cycles[index] = { ...updatedCycle };
    return id;
  }
}

test('el servicio completa un ciclo progresivo y acumula reps/volumen', async () => {
  const repository = new MemoryRepository();
  const service = new TrainingService(repository);
  const exerciseId = await service.createExercise('Press banca');
  const cycleId = await service.createProgressiveCycle({
    exerciseId,
    name: 'Ciclo 1',
    oneRmKg: 100,
    startPercentage: 50,
    incrementKg: 2.5,
    formula: 'EPLEY',
  });

  const first = await service.logPrescribedSession({ cycleId, reps: 20, performedAt: '2026-10-01T10:00:00Z' });
  assert.equal(first.session.weightKg, 50);
  assert.equal(first.cycleCompleted, false);

  const second = await service.logPrescribedSession({ cycleId, reps: 15, performedAt: '2026-10-03T10:00:00Z' });
  assert.equal(second.session.weightKg, 52.5);
  assert.equal(second.cycleCompleted, true);
  assert.equal(second.cycle.status, 'COMPLETED');
  assert.equal(second.cycle.totalReps, 35);
  assert.equal(second.cycle.totalVolumeKg, 50 * 20 + 52.5 * 15);
});

test('el servicio respeta 4 sesiones con cada uno de los tres pesos', async () => {
  const repository = new MemoryRepository();
  const service = new TrainingService(repository);
  const exerciseId = await service.createExercise('Press militar');
  const cycleId = await service.createFixedCycle({
    exerciseId,
    name: 'Bloques',
    weightsKg: [40, 42.5, 45],
    formula: 'EPLEY',
  });

  const prescribed = [];
  let last;
  for (let index = 0; index < 12; index += 1) {
    last = await service.logPrescribedSession({
      cycleId,
      reps: 20,
      performedAt: `2026-10-${String(index + 1).padStart(2, '0')}T10:00:00Z`,
    });
    prescribed.push(last.session.weightKg);
  }

  assert.deepEqual(prescribed, [40, 40, 40, 40, 42.5, 42.5, 42.5, 42.5, 45, 45, 45, 45]);
  assert.equal(last.cycleCompleted, true);
  assert.equal(last.cycle.status, 'COMPLETED');
  assert.equal(last.cycle.totalReps, 240);
});
