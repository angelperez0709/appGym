import { idbRequest, STORE, withTransaction } from './indexed-db.js';
import { CLOUD_TABLES, fromCloudRow, snakeCase } from './cloud-records.js';

const stores = CLOUD_TABLES.map((item) => item.store);

export class SyncRepository {
  constructor(databaseName) { this.databaseName = databaseName; }

  transaction(mode, operation) {
    return withTransaction([...stores, STORE.SYNC], mode, operation, this.databaseName);
  }

  async snapshot() {
    return this.transaction('readonly', async (db) => Object.fromEntries(await Promise.all(
      [...stores, STORE.SYNC].map(async (name) => [name, await idbRequest(db[name].getAll())]),
    )));
  }

  async prepare() {
    await this.transaction('readwrite', async (db) => {
      for (const name of stores) {
        for (const row of await idbRequest(db[name].getAll())) {
          if (!row.cloudId) await idbRequest(db[name].put({ ...row, cloudId: crypto.randomUUID(), dirty: true, syncRevision: crypto.randomUUID() }));
        }
      }
    });
  }

  async acknowledge(store, row, cloudUpdatedAt) {
    await this.transaction('readwrite', async (db) => {
      const current = await idbRequest(db[store].get(row.id));
      if (!current) return;
      // Keep a newer edit pending, but remember the server revision we just wrote.
      await idbRequest(db[store].put({ ...current, cloudUpdatedAt, dirty: current.syncRevision !== row.syncRevision }));
    });
  }

  async acknowledgeDelete(id) {
    await this.transaction('readwrite', (db) => idbRequest(db.sync.delete(id)));
  }

  async importGuest(guest) {
    await guest.prepare();
    const source = await guest.snapshot();
    // Derive a stable UUID per account so importing the same guest data into a
    // different account never collides with rows owned by the first account.
    const importedIds = new Map();
    for (const name of stores) for (const row of source[name]) {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(this.databaseName + ':' + row.cloudId))).slice(0, 16);
      digest[6] = (digest[6] & 15) | 64;
      digest[8] = (digest[8] & 63) | 128;
      const hex = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      importedIds.set(row.cloudId, `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`);
    }
    await this.transaction('readwrite', async (db) => {
      const idMaps = {};
      for (const definition of CLOUD_TABLES) {
        const existing = await idbRequest(db[definition.store].getAll());
        idMaps[definition.store] = new Map();
        for (const row of source[definition.store]) {
          const cloudId = importedIds.get(row.cloudId);
          const match = existing.find((item) => item.cloudId === cloudId || (definition.store === 'exercises' && item.normalizedName === row.normalizedName));
          if (match) { idMaps[definition.store].set(row.id, match.id); continue; }
          const copy = { ...row, cloudId, dirty: true, syncRevision: crypto.randomUUID(), cloudUpdatedAt: undefined };
          delete copy.id;
          if (definition.parent) copy[definition.foreignKey] = idMaps[definition.parent].get(row[definition.foreignKey]);
          const id = await idbRequest(db[definition.store].add(copy));
          idMaps[definition.store].set(row.id, id);
          existing.push({ ...copy, id });
        }
      }
    });
  }

  async mergeRemote(remote, { discardLocal = false } = {}) {
    await this.transaction('readwrite', async (db) => {
      if (discardLocal) {
        for (const name of [...stores, STORE.SYNC]) await idbRequest(db[name].clear());
      }
      const local = {};
      for (const name of stores) local[name] = await idbRequest(db[name].getAll());
      const pendingDeletes = await idbRequest(db.sync.getAll());
      const deletedCycles = new Set(pendingDeletes.filter((row) => row.table === 'cycles').map((row) => row.cloudId));
      const deletedRows = new Set(pendingDeletes.map((row) => row.table + ':' + row.cloudId));
      const maps = {};
      const protectedIds = Object.fromEntries(stores.map((name) => [name, new Set(local[name].filter((row) => row.dirty).map((row) => row.id))]));
      for (const child of [...CLOUD_TABLES].reverse()) {
        if (child.parent) for (const row of local[child.store]) {
          if (protectedIds[child.store].has(row.id)) protectedIds[child.parent].add(row[child.foreignKey]);
        }
      }
      for (const definition of CLOUD_TABLES) {
        maps[definition.store] = new Map(local[definition.store].map((row) => [row.cloudId, row.id]));
        const serverIds = new Set(remote[definition.store].map((row) => row.id));
        for (const row of remote[definition.store]) {
          if (deletedRows.has(definition.table + ':' + row.id)) continue;
          if ((definition.store === 'cycles' && deletedCycles.has(row.id)) || (definition.parent === 'cycles' && deletedCycles.has(row.cycle_id))) continue;
          const existing = local[definition.store].find((item) => item.cloudId === row.id);
          if (existing?.dirty) continue;
          const copy = fromCloudRow(definition, row);
          if (definition.parent) {
            copy[definition.foreignKey] = maps[definition.parent].get(row[snakeCase(definition.foreignKey)]);
            if (copy[definition.foreignKey] == null) continue;
          }
          const duplicateExercise = definition.store === 'exercises' ? local.exercises.find((item) => item.normalizedName === copy.normalizedName && item.cloudId !== copy.cloudId) : null;
          if (duplicateExercise) throw new Error('Hay un ejercicio con el mismo nombre en otro dispositivo. Sincroniza antes de crear otro con ese nombre.');
          if (existing) copy.id = existing.id;
          const id = await idbRequest(db[definition.store].put(copy));
          maps[definition.store].set(row.id, id);
        }
        for (const row of local[definition.store]) {
          if (!serverIds.has(row.cloudId) && !protectedIds[definition.store].has(row.id)) await idbRequest(db[definition.store].delete(row.id));
        }
      }
    });
  }

  async setImported(userId) {
    await this.transaction('readwrite', (db) => idbRequest(db.sync.put({ id: 'imported:' + userId })));
  }

  async guestAvailable(userId) {
    const data = await this.snapshot();
    return data.exercises.length > 0 && !data.sync.some((row) => row.id === 'imported:' + userId);
  }
}
