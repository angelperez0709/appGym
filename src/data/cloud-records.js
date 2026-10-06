import { roundNumericFields } from '../domain/numbers.js';

export const CLOUD_TABLES = [
  { store: 'exercises', table: 'exercises', fields: ['name', 'normalizedName', 'defaultIncrementKg', 'createdAt'] },
  { store: 'cycles', table: 'cycles', parent: 'exercises', foreignKey: 'exerciseId', fields: ['name', 'type', 'status', 'startOneRmKg', 'startPercentage', 'startWeightKg', 'incrementKg', 'targetEndReps', 'fixedSessionsPerWeight', 'oneRmFormula', 'totalReps', 'totalVolumeKg', 'startedAt', 'endedAt'] },
  { store: 'cycleWeights', table: 'cycle_weights', parent: 'cycles', foreignKey: 'cycleId', fields: ['position', 'weightKg', 'targetSessions'] },
  { store: 'sessions', table: 'sessions', parent: 'cycles', foreignKey: 'cycleId', fields: ['performedAt', 'weightKg', 'prescribedWeightKg', 'reps', 'volumeKg', 'estimatedOneRmKg', 'createdAt'] },
];

export function snakeCase(name) {
  return name.replace(/[A-Z]/g, (letter) => '_' + letter.toLowerCase());
}

export function toCloudRow(definition, row, snapshot, userId) {
  const payload = { id: row.cloudId, user_id: userId };
  for (const field of definition.fields) payload[snakeCase(field)] = row[field] ?? null;
  if (definition.parent) {
    const parent = snapshot[definition.parent].find((item) => item.id === row[definition.foreignKey]);
    if (!parent?.cloudId) throw new Error('Falta el ejercicio o ciclo de una sesión. Los datos locales se conservan.');
    payload[snakeCase(definition.foreignKey)] = parent.cloudId;
  }
  return roundNumericFields(payload);
}

export function fromCloudRow(definition, row) {
  const local = { cloudId: row.id, cloudUpdatedAt: row.updated_at, dirty: false };
  for (const field of definition.fields) local[field] = row[snakeCase(field)];
  return roundNumericFields(local);
}
