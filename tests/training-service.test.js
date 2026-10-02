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
  async deleteCycle(id) {
    this.cycles = this.cycles.filter((cycle) => cycle.id !== id);
    this.sessions = this.sessions.filter((session) => session.cycleId !== id);
    this.weights = this.weights.filter((weight) => weight.cycleId !== id);
  }
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
  async updateSessionAndCycle(session, cycle) {
    this.sessions[this.sessions.findIndex((row) => row.id === session.id)] = session;
    this.cycles[this.cycles.findIndex((row) => row.id === cycle.id)] = cycle;
  }
  async saveSessionAndCycle(session, updatedCycle) {
    const id = this.ids.session++;
    this.sessions.push({ ...session, id });
    const index = this.cycles.findIndex((cycle) => cycle.id === updatedCycle.id);
    this.cycles[index] = { ...updatedCycle };
    return id;
  }
}

test('eliminar un ciclo borra sus sesiones y pesos, conserva los demás y libera el ejercicio', async () => {
  const repository = new MemoryRepository();
  const service = new TrainingService(repository);
  const exerciseId = await service.createExercise('Banca');
  const otherExerciseId = await service.createExercise('Militar');
  const cycleId = await service.createFixedCycle({ exerciseId, name: 'Eliminar', weightsKg: [30, 35, 40] });
  const otherCycleId = await service.createFixedCycle({ exerciseId: otherExerciseId, name: 'Conservar', weightsKg: [20, 25, 30] });
  await service.logPrescribedSession({ cycleId, reps: 20 });
  await service.logPrescribedSession({ cycleId: otherCycleId, reps: 25 });
  await service.deleteCycle(cycleId);
  assert.equal(await repository.getCycle(cycleId), null);
  assert.equal((await repository.listCycleSessions(cycleId)).length, 0);
  assert.equal((await repository.listCycleWeights(cycleId)).length, 0);
  assert.equal((await service.getProgressSnapshot(exerciseId)).sessions.length, 0);
  assert.equal((await service.getRecordsSnapshot(exerciseId)).records.length, 0);
  assert.equal((await repository.listCycleSessions(otherCycleId)).length, 1);
  assert.equal((await repository.listCycleWeights(otherCycleId)).length, 3);
  assert.equal((await service.exportRows()).length, 1);
  assert.equal((await service.listExercises()).length, 2);
  await service.createProgressiveCycle({ exerciseId, name: 'Nuevo', oneRmKg: 100, startPercentage: 50, incrementKg: 2.5 });
  await assert.rejects(service.deleteCycle(cycleId), /Ciclo no encontrado/);
});

test('corrige sesiones, recalcula métricas y precarga la referencia introducida en el ciclo anterior', async () => {
  const repository = new MemoryRepository();
  const service = new TrainingService(repository);
  const exerciseId = await service.createExercise('Banca');
  const cycleId = await service.createProgressiveCycle({ exerciseId, name: 'Uno', oneRmKg: 100, startPercentage: 50, incrementKg: 2.5, formula: 'MAYHEW' });
  assert.equal((await repository.getCycle(cycleId)).oneRmFormula, 'EPLEY');
  const first = await service.logPrescribedSession({ cycleId, reps: 15 });
  await service.updateSession({ cycleId, sessionId: first.sessionId, weightKg: 60, reps: 20 });
  const cycle = await repository.getCycle(cycleId);
  assert.equal(cycle.status, 'ACTIVE');
  assert.equal(cycle.endedAt, null);
  assert.equal(cycle.totalReps, 20);
  assert.equal(cycle.totalVolumeKg, 1200);
  assert.equal((await service.getTrainingSnapshot(exerciseId)).prescription.weightKg, 62.5);
  await service.updateSession({ cycleId, sessionId: first.sessionId, weightKg: 90, reps: 20 });
  const snapshot = await service.getCyclesSnapshot(exerciseId);
  assert.equal(snapshot.previousOneRmKg, 100);
  assert.ok(snapshot.cycles[0].bestEstimatedOneRmKg > 100);
  await assert.rejects(service.updateSession({ cycleId, sessionId: first.sessionId, weightKg: Infinity, reps: 20 }));
  await assert.rejects(service.updateSession({ cycleId, sessionId: first.sessionId, weightKg: 60, reps: 1.5 }));
});

test('corregir pesos en bloques conserva el avance de las sesiones', async () => {
  const repository = new MemoryRepository();
  const service = new TrainingService(repository);
  const exerciseId = await service.createExercise('Militar');
  const cycleId = await service.createFixedCycle({ exerciseId, name: 'Bloques', weightsKg: [40, 45, 50] });
  const first = await service.logPrescribedSession({ cycleId, reps: 20 });
  for (let index = 0; index < 3; index++) await service.logPrescribedSession({ cycleId, reps: 20 });
  await service.updateSession({ cycleId, sessionId: first.sessionId, weightKg: 41, reps: 21 });
  assert.equal((await service.getTrainingSnapshot(exerciseId)).prescription.weightKg, 45);
});

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
