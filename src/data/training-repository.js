import { roundNumericFields } from '../domain/numbers.js';
import { idbRequest, openDatabase, STORE, withTransaction } from './indexed-db.js';

export class TrainingRepository {
  async ready() {
    await openDatabase();
  }

  async listExercises() {
    const exercises = await this.#getAll(STORE.EXERCISES);
    return exercises.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }

  async createExercise(exercise) {
    try {
      return await withTransaction([STORE.EXERCISES], 'readwrite', async ({ exercises }) => (
        idbRequest(exercises.add(roundNumericFields(exercise)))
      ));
    } catch (error) {
      if (error?.name === 'ConstraintError') {
        throw new Error('Ya existe un ejercicio con ese nombre.');
      }
      throw error;
    }
  }

  async listCycles(exerciseId = null) {
    const db = await openDatabase();
    const transaction = db.transaction(STORE.CYCLES, 'readonly');
    const store = transaction.objectStore(STORE.CYCLES);
    const rows = exerciseId == null
      ? await idbRequest(store.getAll())
      : await idbRequest(store.index('exerciseId').getAll(exerciseId));

    return rows.map(roundNumericFields).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async getCycle(cycleId) {
    return this.#get(STORE.CYCLES, cycleId);
  }

  async deleteCycle(cycleId) {
    return withTransaction([STORE.CYCLES, STORE.SESSIONS, STORE.CYCLE_WEIGHTS], 'readwrite', async ({ cycles, sessions, cycleWeights }) => {
      const [sessionIds, weightIds] = await Promise.all([
        idbRequest(sessions.index('cycleId').getAllKeys(cycleId)),
        idbRequest(cycleWeights.index('cycleId').getAllKeys(cycleId)),
      ]);
      await Promise.all([
        ...sessionIds.map((id) => idbRequest(sessions.delete(id))),
        ...weightIds.map((id) => idbRequest(cycleWeights.delete(id))),
        idbRequest(cycles.delete(cycleId)),
      ]);
    });
  }

  async getActiveCycle(exerciseId) {
    const db = await openDatabase();
    const transaction = db.transaction(STORE.CYCLES, 'readonly');
    const store = transaction.objectStore(STORE.CYCLES);
    const rows = await idbRequest(store.index('exerciseStatus').getAll([exerciseId, 'ACTIVE']));
    return rows.map(roundNumericFields).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
  }

  async createCycle(cycle) {
    return withTransaction([STORE.CYCLES], 'readwrite', async ({ cycles }) => idbRequest(cycles.add(roundNumericFields(cycle))));
  }

  async createCycleWithWeights(cycle, weights) {
    return withTransaction(
      [STORE.CYCLES, STORE.CYCLE_WEIGHTS],
      'readwrite',
      async ({ cycles, cycleWeights }) => {
        const cycleId = await idbRequest(cycles.add(roundNumericFields(cycle)));
        for (const weight of weights) {
          await idbRequest(cycleWeights.add(roundNumericFields({ ...weight, cycleId })));
        }
        return cycleId;
      },
    );
  }

  async listCycleWeights(cycleId) {
    const db = await openDatabase();
    const transaction = db.transaction(STORE.CYCLE_WEIGHTS, 'readonly');
    const store = transaction.objectStore(STORE.CYCLE_WEIGHTS);
    const rows = await idbRequest(store.index('cycleId').getAll(cycleId));
    return rows.map(roundNumericFields).sort((a, b) => a.position - b.position);
  }

  async listCycleSessions(cycleId) {
    const db = await openDatabase();
    const transaction = db.transaction(STORE.SESSIONS, 'readonly');
    const store = transaction.objectStore(STORE.SESSIONS);
    const rows = await idbRequest(store.index('cycleId').getAll(cycleId));
    return sortSessions(rows.map(roundNumericFields));
  }

  async listAllSessions() {
    return sortSessions(await this.#getAll(STORE.SESSIONS));
  }

  async saveSessionAndCycle(session, updatedCycle) {
    return withTransaction(
      [STORE.SESSIONS, STORE.CYCLES],
      'readwrite',
      async ({ sessions, cycles }) => {
        const sessionId = await idbRequest(sessions.add(roundNumericFields(session)));
        await idbRequest(cycles.put(roundNumericFields(updatedCycle)));
        return sessionId;
      },
    );
  }

  async deleteSessionAndReplaceCycle(sessionId, updatedCycle) {
    return withTransaction(
      [STORE.SESSIONS, STORE.CYCLES],
      'readwrite',
      async ({ sessions, cycles }) => {
        await idbRequest(sessions.delete(sessionId));
        await idbRequest(cycles.put(roundNumericFields(updatedCycle)));
      },
    );
  }

  async updateSessionAndCycle(session, updatedCycle) {
    return withTransaction([STORE.SESSIONS, STORE.CYCLES], 'readwrite', async ({ sessions, cycles }) => {
      await idbRequest(sessions.put(roundNumericFields(session)));
      await idbRequest(cycles.put(roundNumericFields(updatedCycle)));
    });
  }

  async #get(storeName, key) {
    const db = await openDatabase();
    const transaction = db.transaction(storeName, 'readonly');
    return roundNumericFields(await idbRequest(transaction.objectStore(storeName).get(key)));
  }

  async #getAll(storeName) {
    const db = await openDatabase();
    const transaction = db.transaction(storeName, 'readonly');
    return (await idbRequest(transaction.objectStore(storeName).getAll())).map(roundNumericFields);
  }
}

function sortSessions(sessions) {
  return [...sessions].sort((a, b) => {
    if (a.performedAt === b.performedAt) return (a.id ?? 0) - (b.id ?? 0);
    return a.performedAt.localeCompare(b.performedAt);
  });
}
