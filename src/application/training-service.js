import {
  CYCLE_STATUS,
  CYCLE_TYPE,
  FIXED_BLOCK_SESSIONS_PER_WEIGHT,
  FIXED_BLOCK_WEIGHT_COUNT,
  ONE_RM_FORMULA,
  PROGRESSIVE_END_REPS,
  calculateVolume,
  estimateOneRm,
  initialWeightFromOneRm,
  isCycleCompletedAfterSession,
  nextPrescription,
  sameWeight,
  validateFixedCycleWeights,
  validateProgressiveCycleInput,
} from '../domain/bilbo.js';

export class TrainingService {
  constructor(repository) {
    this.repository = repository;
  }

  async initialize() {
    await this.repository.ready();
  }

  async listExercises() {
    return this.repository.listExercises();
  }

  async createExercise(name, defaultIncrementKg = 2.5) {
    const cleanName = String(name ?? '').trim();
    if (!cleanName) throw new Error('Escribe un nombre para el ejercicio.');
    if (!(defaultIncrementKg > 0)) throw new Error('El incremento predeterminado debe ser mayor que cero.');

    return this.repository.createExercise({
      name: cleanName,
      normalizedName: cleanName.toLocaleLowerCase('es'),
      defaultIncrementKg,
      createdAt: nowIso(),
    });
  }

  async createProgressiveCycle(input) {
    const exerciseId = Number(input.exerciseId);
    await this.#assertExerciseExists(exerciseId);
    await this.#assertNoActiveCycle(exerciseId);

    const oneRmKg = Number(input.oneRmKg);
    const startPercentage = Number(input.startPercentage);
    const incrementKg = Number(input.incrementKg);
    validateProgressiveCycleInput({ oneRmKg, startPercentage, incrementKg });

    const cycle = {
      exerciseId,
      name: requireName(input.name, 'Escribe un nombre para el ciclo.'),
      type: CYCLE_TYPE.PROGRESSIVE,
      status: CYCLE_STATUS.ACTIVE,
      startOneRmKg: oneRmKg,
      startPercentage,
      startWeightKg: initialWeightFromOneRm(oneRmKg, startPercentage, Number(input.roundingKg) || 0.5),
      incrementKg,
      targetEndReps: PROGRESSIVE_END_REPS,
      fixedSessionsPerWeight: null,
      oneRmFormula: normalizeFormula(input.formula),
      totalReps: 0,
      totalVolumeKg: 0,
      startedAt: nowIso(),
      endedAt: null,
    };

    return this.repository.createCycle(cycle);
  }

  async createFixedCycle(input) {
    const exerciseId = Number(input.exerciseId);
    await this.#assertExerciseExists(exerciseId);
    await this.#assertNoActiveCycle(exerciseId);

    const weightsKg = input.weightsKg.map(Number);
    validateFixedCycleWeights(weightsKg);

    const cycle = {
      exerciseId,
      name: requireName(input.name, 'Escribe un nombre para el ciclo.'),
      type: CYCLE_TYPE.FIXED_BLOCKS,
      status: CYCLE_STATUS.ACTIVE,
      startOneRmKg: null,
      startPercentage: null,
      startWeightKg: null,
      incrementKg: null,
      targetEndReps: PROGRESSIVE_END_REPS,
      fixedSessionsPerWeight: FIXED_BLOCK_SESSIONS_PER_WEIGHT,
      oneRmFormula: normalizeFormula(input.formula),
      totalReps: 0,
      totalVolumeKg: 0,
      startedAt: nowIso(),
      endedAt: null,
    };

    const weights = weightsKg.map((weightKg, position) => ({
      position,
      weightKg,
      targetSessions: FIXED_BLOCK_SESSIONS_PER_WEIGHT,
    }));

    return this.repository.createCycleWithWeights(cycle, weights);
  }

  async getTrainingSnapshot(preferredExerciseId = null) {
    const exercises = await this.repository.listExercises();
    const exerciseId = chooseExerciseId(exercises, preferredExerciseId);
    if (!exerciseId) return { exercises, exerciseId: null, cycle: null, sessions: [], weights: [], prescription: null };

    const cycle = await this.repository.getActiveCycle(exerciseId);
    if (!cycle) return { exercises, exerciseId, cycle: null, sessions: [], weights: [], prescription: null };

    const [sessions, weights] = await Promise.all([
      this.repository.listCycleSessions(cycle.id),
      cycle.type === CYCLE_TYPE.FIXED_BLOCKS ? this.repository.listCycleWeights(cycle.id) : Promise.resolve([]),
    ]);

    return {
      exercises,
      exerciseId,
      cycle,
      sessions,
      weights,
      prescription: nextPrescription(cycle, sessions, weights),
    };
  }

  async logPrescribedSession({ cycleId, reps, performedAt = nowIso() }) {
    const cycle = await this.repository.getCycle(Number(cycleId));
    if (!cycle) throw new Error('Ciclo no encontrado.');
    if (cycle.status !== CYCLE_STATUS.ACTIVE) throw new Error('El ciclo ya no está activo.');

    const numericReps = Number(reps);
    if (!Number.isInteger(numericReps) || numericReps <= 0) {
      throw new Error('Las repeticiones deben ser un número entero mayor que cero.');
    }

    const [sessions, weights] = await Promise.all([
      this.repository.listCycleSessions(cycle.id),
      cycle.type === CYCLE_TYPE.FIXED_BLOCKS ? this.repository.listCycleWeights(cycle.id) : Promise.resolve([]),
    ]);

    const prescription = nextPrescription(cycle, sessions, weights);
    if (!prescription || prescription.cycleCanFinish) {
      throw new Error('Este ciclo ya ha alcanzado su condición de finalización.');
    }

    const weightKg = prescription.weightKg;
    const volumeKg = calculateVolume(weightKg, numericReps);
    const session = {
      cycleId: cycle.id,
      performedAt,
      weightKg,
      reps: numericReps,
      volumeKg,
      estimatedOneRmKg: estimateOneRm(weightKg, numericReps, cycle.oneRmFormula),
      createdAt: nowIso(),
    };

    const sessionsIncludingNew = [...sessions, { ...session, id: Number.MAX_SAFE_INTEGER }];
    const cycleCompleted = isCycleCompletedAfterSession(cycle, sessionsIncludingNew, weights);
    const updatedCycle = {
      ...cycle,
      totalReps: cycle.totalReps + numericReps,
      totalVolumeKg: cycle.totalVolumeKg + volumeKg,
      status: cycleCompleted ? CYCLE_STATUS.COMPLETED : cycle.status,
      endedAt: cycleCompleted ? performedAt : cycle.endedAt,
    };

    const sessionId = await this.repository.saveSessionAndCycle(session, updatedCycle);
    return { sessionId, cycleCompleted, cycle: updatedCycle, session: { ...session, id: sessionId } };
  }

  async getCyclesSnapshot(preferredExerciseId = null) {
    const exercises = await this.repository.listExercises();
    const exerciseId = chooseExerciseId(exercises, preferredExerciseId);
    const cycles = exerciseId ? await this.repository.listCycles(exerciseId) : [];
    return { exercises, exerciseId, cycles };
  }

  async getProgressSnapshot(preferredExerciseId = null) {
    const exercises = await this.repository.listExercises();
    const exerciseId = chooseExerciseId(exercises, preferredExerciseId);
    if (!exerciseId) return { exercises, exerciseId: null, sessions: [], summaries: [] };

    const cycles = await this.repository.listCycles(exerciseId);
    const sessionGroups = await Promise.all(cycles.map((cycle) => this.repository.listCycleSessions(cycle.id)));
    const cycleById = new Map(cycles.map((cycle) => [cycle.id, cycle]));
    const sessions = sessionGroups
      .flat()
      .sort(compareSessions)
      .map((session) => ({ ...session, cycleName: cycleById.get(session.cycleId)?.name ?? '' }));

    const summaries = cycles.map((cycle, index) => summarizeCycle(cycle, sessionGroups[index]));
    return { exercises, exerciseId, sessions, summaries };
  }

  async getRecordsSnapshot(preferredExerciseId = null) {
    const { exercises, exerciseId, sessions } = await this.getProgressSnapshot(preferredExerciseId);
    if (!exerciseId) return { exercises, exerciseId: null, records: [] };

    const recordByWeight = new Map();
    for (const session of sessions) {
      const key = session.weightKg.toFixed(3);
      const existing = recordByWeight.get(key);
      if (!existing || session.reps > existing.maxReps || (session.reps === existing.maxReps && session.performedAt > existing.performedAt)) {
        recordByWeight.set(key, {
          weightKg: session.weightKg,
          maxReps: session.reps,
          performedAt: session.performedAt,
          cycleName: session.cycleName,
        });
      }
    }

    const records = [...recordByWeight.values()].sort((a, b) => a.weightKg - b.weightKg);
    return { exercises, exerciseId, records };
  }

  async exportRows() {
    const [exercises, cycles, sessions] = await Promise.all([
      this.repository.listExercises(),
      this.repository.listCycles(),
      this.repository.listAllSessions(),
    ]);

    const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
    const cycleById = new Map(cycles.map((cycle) => [cycle.id, cycle]));

    return sessions.map((session) => {
      const cycle = cycleById.get(session.cycleId);
      const exercise = cycle ? exerciseById.get(cycle.exerciseId) : null;
      return {
        exercise: exercise?.name ?? '',
        cycle: cycle?.name ?? '',
        cycle_type: cycle?.type ?? '',
        cycle_status: cycle?.status ?? '',
        one_rm_formula: cycle?.oneRmFormula ?? '',
        cycle_total_reps: cycle?.totalReps ?? 0,
        cycle_total_volume_kg: cycle?.totalVolumeKg ?? 0,
        performed_at: session.performedAt,
        weight_kg: session.weightKg,
        reps: session.reps,
        volume_kg: session.volumeKg,
        estimated_one_rm_kg: session.estimatedOneRmKg,
      };
    });
  }

  async #assertNoActiveCycle(exerciseId) {
    if (await this.repository.getActiveCycle(exerciseId)) {
      throw new Error('Este ejercicio ya tiene un ciclo activo. Complétalo antes de crear otro.');
    }
  }

  async #assertExerciseExists(exerciseId) {
    const exists = (await this.repository.listExercises()).some((exercise) => exercise.id === exerciseId);
    if (!exists) throw new Error('Selecciona un ejercicio válido.');
  }
}

function summarizeCycle(cycle, sessions = []) {
  const ordered = [...sessions].sort(compareSessions);
  const last = ordered.at(-1);

  return {
    cycleId: cycle.id,
    cycleName: cycle.name,
    type: cycle.type,
    status: cycle.status,
    startedAt: cycle.startedAt,
    endedAt: cycle.endedAt,
    sessions: ordered.length,
    totalReps: cycle.totalReps,
    totalVolumeKg: cycle.totalVolumeKg,
    bestEstimatedOneRmKg: maxOf(ordered, (session) => session.estimatedOneRmKg),
    bestSessionVolumeKg: maxOf(ordered, (session) => session.volumeKg),
    maxWeightKg: maxOf(ordered, (session) => session.weightKg),
    lastWeightKg: last?.weightKg ?? 0,
    lastReps: last?.reps ?? 0,
  };
}

function maxOf(items, selector) {
  return items.reduce((max, item) => Math.max(max, selector(item)), 0);
}

function chooseExerciseId(exercises, preferredExerciseId) {
  const preferred = Number(preferredExerciseId);
  if (exercises.some((exercise) => exercise.id === preferred)) return preferred;
  return exercises[0]?.id ?? null;
}

function normalizeFormula(formula) {
  return formula === ONE_RM_FORMULA.MAYHEW ? ONE_RM_FORMULA.MAYHEW : ONE_RM_FORMULA.EPLEY;
}

function requireName(value, message) {
  const clean = String(value ?? '').trim();
  if (!clean) throw new Error(message);
  return clean;
}

function compareSessions(a, b) {
  if (a.performedAt === b.performedAt) return (a.id ?? 0) - (b.id ?? 0);
  return a.performedAt.localeCompare(b.performedAt);
}

function nowIso() {
  return new Date().toISOString();
}

export const METHOD_RULES = Object.freeze({
  progressiveEndReps: PROGRESSIVE_END_REPS,
  fixedBlockWeightCount: FIXED_BLOCK_WEIGHT_COUNT,
  fixedBlockSessionsPerWeight: FIXED_BLOCK_SESSIONS_PER_WEIGHT,
});
