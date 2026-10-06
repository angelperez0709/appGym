import { roundNumericFields } from '../domain/numbers.js';
import { idbRequest, openDatabase, STORE, withTransaction } from './indexed-db.js';

export class TrainingRepository extends EventTarget {
  constructor(databaseName = 'bilbo-tracker') {
    super();
    this.databaseName = databaseName;
  }

  async #transaction(names, mode, operation) {
    const result = await withTransaction(names, mode, async (stores) => {
      if (mode === 'readwrite') {
        for (const [name, store] of Object.entries(stores)) {
          if (name === STORE.SYNC) continue;
          stores[name] = new Proxy(store, { get(target, property) {
            if (property === 'add' || property === 'put') return (row) => target[property]({ ...row, cloudId: row.cloudId ?? crypto.randomUUID(), syncRevision: crypto.randomUUID(), dirty: true });
            const value = target[property];
            return typeof value === 'function' ? value.bind(target) : value;
          } });
        }
      }
      return operation(stores);
    }, this.databaseName);
    if (mode === 'readwrite') this.dispatchEvent(new Event('change'));
    return result;
  }
  async ready() {
    await openDatabase(this.databaseName);
  }

  async listExercises() {
    const exercises = await this.#getAll(STORE.EXERCISES);
    return exercises.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }

  async createExercise(exercise) {
    try {
      return await this.#transaction([STORE.EXERCISES], 'readwrite', async ({ exercises }) => (
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
    const db = await openDatabase(this.databaseName);
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
    return this.#transaction([STORE.CYCLES, STORE.SESSIONS, STORE.CYCLE_WEIGHTS, STORE.SYNC], 'readwrite', async ({ cycles, sessions, cycleWeights, sync }) => {
      const cycle = await idbRequest(cycles.get(cycleId));
      if (cycle?.cloudId) await idbRequest(sync.put({ id: 'delete:cycles:' + cycle.cloudId, table: 'cycles', cloudId: cycle.cloudId }));
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
    const db = await openDatabase(this.databaseName);
    const transaction = db.transaction(STORE.CYCLES, 'readonly');
    const store = transaction.objectStore(STORE.CYCLES);
    const rows = await idbRequest(store.index('exerciseStatus').getAll([exerciseId, 'ACTIVE']));
    return rows.map(roundNumericFields).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
  }

  async createCycle(cycle) {
    return this.#transaction([STORE.CYCLES], 'readwrite', async ({ cycles }) => idbRequest(cycles.add(roundNumericFields(cycle))));
  }

  async createCycleWithWeights(cycle, weights) {
    return this.#transaction(
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
    const db = await openDatabase(this.databaseName);
    const transaction = db.transaction(STORE.CYCLE_WEIGHTS, 'readonly');
    const store = transaction.objectStore(STORE.CYCLE_WEIGHTS);
    const rows = await idbRequest(store.index('cycleId').getAll(cycleId));
    return rows.map(roundNumericFields).sort((a, b) => a.position - b.position);
  }

  async listCycleSessions(cycleId) {
    const db = await openDatabase(this.databaseName);
    const transaction = db.transaction(STORE.SESSIONS, 'readonly');
    const store = transaction.objectStore(STORE.SESSIONS);
    const rows = await idbRequest(store.index('cycleId').getAll(cycleId));
    return sortSessions(rows.map(roundNumericFields));
  }

  async listAllSessions() {
    return sortSessions(await this.#getAll(STORE.SESSIONS));
  }

  async saveSessionAndCycle(session, updatedCycle) {
    return this.#transaction(
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
    return this.#transaction(
      [STORE.SESSIONS, STORE.CYCLES],
      'readwrite',
      async ({ sessions, cycles }) => {
        await idbRequest(sessions.delete(sessionId));
        await idbRequest(cycles.put(roundNumericFields(updatedCycle)));
      },
    );
  }

  async updateSessionAndCycle(session, updatedCycle) {
    return this.#transaction([STORE.SESSIONS, STORE.CYCLES], 'readwrite', async ({ sessions, cycles }) => {
      await idbRequest(sessions.put(roundNumericFields(session)));
      await idbRequest(cycles.put(roundNumericFields(updatedCycle)));
    });
  }

  async #get(storeName, key) {
    const db = await openDatabase(this.databaseName);
    const transaction = db.transaction(storeName, 'readonly');
    return roundNumericFields(await idbRequest(transaction.objectStore(storeName).get(key)));
  }

  async #getAll(storeName) {
    const db = await openDatabase(this.databaseName);
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
