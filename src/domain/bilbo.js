import { roundDecimal } from './numbers.js';

export const CYCLE_TYPE = Object.freeze({
  PROGRESSIVE: 'PROGRESSIVE',
  FIXED_BLOCKS: 'FIXED_BLOCKS',
});

export const CYCLE_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
});

export const ONE_RM_FORMULA = Object.freeze({
  EPLEY: 'EPLEY',
  MAYHEW: 'MAYHEW',
});

export const PROGRESSIVE_END_REPS = 15;
export const FIXED_BLOCK_WEIGHT_COUNT = 3;
export const FIXED_BLOCK_SESSIONS_PER_WEIGHT = 4;

export function roundToStep(value, step) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
  return roundDecimal(Math.round(value / step) * step);
}

export function estimateOneRm(weightKg, reps, formula = ONE_RM_FORMULA.EPLEY) {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return roundDecimal(weightKg);

  if (formula === ONE_RM_FORMULA.MAYHEW) {
    const denominator = 52.2 + 41.9 * Math.exp(-0.055 * reps);
    return roundDecimal((100 * weightKg) / denominator);
  }

  return roundDecimal(weightKg * (1 + reps / 30));
}

export function calculateVolume(weightKg, reps) {
  return roundDecimal(weightKg * reps);
}

export function initialWeightFromOneRm(oneRmKg, percentage, roundingKg = 0.5) {
  return roundToStep(oneRmKg * (percentage / 100), roundingKg);
}

export function nextPrescription(cycle, sessions, fixedWeights = []) {
  if (!cycle || cycle.status !== CYCLE_STATUS.ACTIVE) return null;

  const ordered = [...sessions].sort(compareSessions);

  if (cycle.type === CYCLE_TYPE.PROGRESSIVE) {
    if (ordered.length === 0) {
      return {
        weightKg: roundDecimal(cycle.startWeightKg ?? 0),
        label: 'Primera sesión del ciclo',
        cycleCanFinish: false,
      };
    }

    const last = ordered.at(-1);
    const reachedEnd = last.reps <= PROGRESSIVE_END_REPS;

    return {
      weightKg: roundDecimal(reachedEnd ? last.weightKg : last.weightKg + (cycle.incrementKg ?? 0)),
      label: reachedEnd
        ? `Ciclo completado con ${last.reps} reps.`
        : `Sube ${formatDecimal(cycle.incrementKg ?? 0)} kg respecto a la última sesión.`,
      cycleCanFinish: reachedEnd,
    };
  }

  const weights = [...fixedWeights].sort((a, b) => a.position - b.position);
  if (weights.length === 0) return null;

  for (const block of weights) {
    const completed = ordered.filter((session) => sameWeight(session.prescribedWeightKg ?? session.weightKg, block.weightKg)).length;
    if (completed < block.targetSessions) {
      return {
        weightKg: roundDecimal(block.weightKg),
        label: `Peso ${block.position + 1} de ${weights.length}`,
        blockProgress: `${completed + 1}/${block.targetSessions}`,
        cycleCanFinish: false,
      };
    }
  }

  const last = weights.at(-1);
  return {
    weightKg: roundDecimal(last.weightKg),
    label: 'Ciclo de bloques completado.',
    blockProgress: `${last.targetSessions}/${last.targetSessions}`,
    cycleCanFinish: true,
  };
}

export function isCycleCompletedAfterSession(cycle, sessionsIncludingNew, fixedWeights = []) {
  if (cycle.type === CYCLE_TYPE.PROGRESSIVE) {
    return sessionsIncludingNew.at(-1)?.reps <= PROGRESSIVE_END_REPS;
  }

  if (fixedWeights.length !== FIXED_BLOCK_WEIGHT_COUNT) return false;

  return fixedWeights.every((block) => {
    const count = sessionsIncludingNew.filter((session) => sameWeight(session.prescribedWeightKg ?? session.weightKg, block.weightKg)).length;
    return count >= block.targetSessions;
  });
}

export function validateProgressiveCycleInput({ oneRmKg, startPercentage, incrementKg }) {
  if (!(oneRmKg > 0)) throw new Error('El 1RM de referencia debe ser mayor que cero.');
  if (!(startPercentage > 0 && startPercentage <= 100)) {
    throw new Error('El porcentaje inicial debe estar entre 0 y 100.');
  }
  if (!(incrementKg > 0)) throw new Error('El incremento debe ser mayor que cero.');
}

export function validateFixedCycleWeights(weightsKg) {
  if (weightsKg.length !== FIXED_BLOCK_WEIGHT_COUNT || weightsKg.some((weight) => !(weight > 0))) {
    throw new Error(`Introduce exactamente ${FIXED_BLOCK_WEIGHT_COUNT} pesos válidos.`);
  }

  const unique = new Set(weightsKg.map((weight) => Number(weight).toFixed(3)));
  if (unique.size !== FIXED_BLOCK_WEIGHT_COUNT) {
    throw new Error('Los tres pesos del ciclo deben ser distintos.');
  }
}

export function sameWeight(a, b) {
  return Math.abs(a - b) < 0.001;
}

function compareSessions(a, b) {
  if (a.performedAt === b.performedAt) return a.id - b.id;
  return a.performedAt.localeCompare(b.performedAt);
}

function formatDecimal(value) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(value);
}
