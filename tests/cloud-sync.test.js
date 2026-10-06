import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TrainingService } from '../src/application/training-service.js';
import { TrainingRepository } from '../src/data/training-repository.js';
import { SyncRepository } from '../src/data/sync-repository.js';
import { CloudSync } from '../src/services/cloud-sync.js';
import { CLOUD_TABLES } from '../src/data/cloud-records.js';
import { openDatabase, idbRequest } from '../src/data/indexed-db.js';

class FakeCloud {
  constructor(userId) {
    this.userId = userId;
    this.rows = Object.fromEntries(CLOUD_TABLES.map((item) => [item.table, []]));
    this.clock = 0;
    this.fail = false;
    this.auth = { getSession: async () => ({ data: { session: { user: { id: this.userId } } } }) };
  }
  from(table) {
    const client = this;
    let action = 'select';
    let payload;
    let first = 0;
    let last = Infinity;
    const filters = [];
    const query = {
      select() { return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      order() { return query; },
      range(start, end) { first = start; last = end; return query; },
      upsert(row) { action = 'upsert'; payload = row; return query; },
      update(row) { action = 'update'; payload = row; return query; },
      delete() { action = 'delete'; return query; },
      async then(resolve, reject) {
        try {
          if (client.fail) return resolve({ error: { message: 'Red interrumpida' } });
          assert.ok(filters.some(([key, value]) => key === 'user_id' && value === client.userId) || payload?.user_id === client.userId);
          const matches = (row) => filters.every(([key, value]) => row[key] === value);
          if (action === 'delete') {
            const deleted = client.rows[table].filter(matches).map((row) => row.id);
            client.rows[table] = client.rows[table].filter((row) => !matches(row));
            if (table === 'cycles') for (const child of ['cycle_weights', 'sessions']) client.rows[child] = client.rows[child].filter((row) => !deleted.includes(row.cycle_id));
            return resolve({ data: [] });
          }
          if (action === 'select') return resolve({ data: structuredClone(client.rows[table].filter(matches).slice(first, last + 1)) });
          let existing = client.rows[table].find((row) => action === 'upsert' ? row.id === payload.id : matches(row));
          if (!existing && action === 'update') return resolve({ data: [] });
          if (payload.exercise_id) assert.ok(client.rows.exercises.some((row) => row.id === payload.exercise_id));
          if (payload.cycle_id) assert.ok(client.rows.cycles.some((row) => row.id === payload.cycle_id));
          const record = { ...payload, updated_at: 'revision-' + ++client.clock };
          if (existing) Object.assign(existing, record);
          else client.rows[table].push(record);
          return resolve({ data: [structuredClone(record)] });
        } catch (error) { reject(error); }
      },
    };
    return query;
  }
}

function setup(client = new FakeCloud('user-a')) {
  const repository = new TrainingRepository('test-' + crypto.randomUUID());
  const service = new TrainingService(repository);
  const cloud = new CloudSync({ client, service, storage: {}, online: () => true });
  cloud.user = { id: client.userId, email: 'example@example.com' };
  cloud.local = new SyncRepository(repository.databaseName);
  cloud.schedule = () => {};
  return { repository, service, cloud, client };
}

async function training(service, type = 'PROGRESSIVE') {
  const exerciseId = await service.createExercise('Banca');
  const cycleId = type === 'PROGRESSIVE'
    ? await service.createProgressiveCycle({ exerciseId, name: 'Uno', oneRmKg: 100, startPercentage: 50, incrementKg: 2.5 })
    : await service.createFixedCycle({ exerciseId, name: 'Bloques', weightsKg: [40, 45, 50] });
  const session = await service.logPrescribedSession({ cycleId, reps: 20 });
  return { exerciseId, cycleId, sessionId: session.sessionId };
}

test('sube datos con relaciones, restaura en otro dispositivo y reintenta sin duplicar', async () => {
  const a = setup();
  await training(a.service, 'FIXED_BLOCKS');
  await a.cloud.sync();
  assert.equal(a.cloud.status, 'synced');
  assert.equal(a.client.rows.exercises.length, 1);
  assert.equal(a.client.rows.cycles.length, 1);
  assert.equal(a.client.rows.cycle_weights.length, 3);
  assert.equal(a.client.rows.sessions.length, 1);
  await a.cloud.sync();
  assert.equal(a.client.rows.sessions.length, 1);
  const b = setup(a.client);
  await b.cloud.sync();
  const snapshot = await b.service.getTrainingSnapshot();
  assert.equal(snapshot.sessions.length, 1);
  assert.equal(snapshot.weights.length, 3);
  assert.equal(snapshot.cycle.totalReps, 20);
  assert.equal(snapshot.sessions[0].cycleId, snapshot.cycle.id);
});

test('un fallo de red conserva los cambios pendientes y el siguiente intento los sube', async () => {
  const a = setup();
  await training(a.service);
  a.client.fail = true;
  await assert.rejects(a.cloud.sync(), /Red interrumpida/);
  assert.equal((await a.cloud.local.snapshot()).sessions[0].dirty, true);
  a.client.fail = false;
  await a.cloud.sync();
  assert.equal((await a.cloud.local.snapshot()).sessions[0].dirty, false);
  assert.equal(a.client.rows.sessions.length, 1);
});

test('borrar un ciclo sin conexión registra el borrado y no vuelve a aparecer en otro móvil', async () => {
  const a = setup();
  const { cycleId } = await training(a.service, 'FIXED_BLOCKS');
  await a.cloud.sync();
  const b = setup(a.client);
  await b.cloud.sync();
  await a.service.deleteCycle(cycleId);
  assert.equal((await a.cloud.local.snapshot()).sync.length, 1);
  await a.cloud.sync();
  await b.cloud.sync();
  assert.equal(a.client.rows.cycles.length, 0);
  assert.equal(a.client.rows.sessions.length, 0);
  assert.equal(a.client.rows.cycle_weights.length, 0);
  assert.equal((await b.cloud.local.snapshot()).cycles.length, 0);
});

test('subida del historial local remapea IDs, conserva la copia original y evita duplicados', async () => {
  const a = setup();
  await a.service.createExercise('Otro ejercicio');
  const guestRepository = new TrainingRepository('guest-' + crypto.randomUUID());
  const guestService = new TrainingService(guestRepository);
  const guest = new SyncRepository(guestRepository.databaseName);
  await training(guestService);
  await a.cloud.local.importGuest(guest);
  await a.cloud.sync();
  await a.cloud.local.importGuest(guest);
  await a.cloud.sync();
  assert.equal(a.client.rows.sessions.length, 1);
  const imported = await a.service.getCyclesSnapshot(2);
  assert.equal(imported.cycles[0].exerciseId, 2);
  assert.equal((await guest.snapshot()).sessions.length, 1);
  const otherAccount = setup(new FakeCloud('user-b'));
  assert.equal((await otherAccount.cloud.local.snapshot()).sessions.length, 0);
  await otherAccount.cloud.local.importGuest(guest);
  assert.notEqual((await otherAccount.cloud.local.snapshot()).sessions[0].cloudId, (await a.cloud.local.snapshot()).sessions[0].cloudId);
});

test('migra IndexedDB v1 sin borrar el historial y asigna identificadores estables', async () => {
  const name = 'legacy-' + crypto.randomUUID();
  const request = indexedDB.open(name, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    const exercises = db.createObjectStore('exercises', { keyPath: 'id', autoIncrement: true });
    exercises.createIndex('normalizedName', 'normalizedName', { unique: true });
    const cycles = db.createObjectStore('cycles', { keyPath: 'id', autoIncrement: true });
    cycles.createIndex('exerciseId', 'exerciseId');
    cycles.createIndex('exerciseStatus', ['exerciseId', 'status']);
    db.createObjectStore('cycleWeights', { keyPath: 'id', autoIncrement: true }).createIndex('cycleId', 'cycleId');
    db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true }).createIndex('cycleId', 'cycleId');
    exercises.add({ id: 7, name: 'Banca', normalizedName: 'banca', defaultIncrementKg: 2.5 });
    cycles.add({ id: 9, exerciseId: 7, name: 'Antiguo', type: 'PROGRESSIVE', status: 'COMPLETED', startedAt: '2026-10-01', totalReps: 15, totalVolumeKg: 750 });
    request.transaction.objectStore('sessions').add({ id: 11, cycleId: 9, weightKg: 50, reps: 15, volumeKg: 750, estimatedOneRmKg: 75 });
  };
  (await idbRequest(request)).close();
  const upgraded = await openDatabase(name);
  assert.equal(upgraded.version, 2);
  const local = new SyncRepository(name);
  await local.prepare();
  const before = await local.snapshot();
  await local.prepare();
  const after = await local.snapshot();
  assert.equal(after.sessions[0].id, 11);
  assert.equal(after.sessions[0].cycleId, 9);
  assert.equal(after.cycles[0].exerciseId, 7);
  assert.equal(after.sessions[0].cloudId, before.sessions[0].cloudId);
  assert.equal(after.sessions[0].dirty, true);
});

test('los cambios sin Internet sobreviven al reinicio y se suben al reconectar', async () => {
  const a = setup();
  let connected = false;
  a.cloud.online = () => connected;
  await training(a.service);
  await a.cloud.sync();
  assert.equal(a.cloud.status, 'offline');
  assert.equal(a.client.rows.sessions.length, 0);
  const reopened = new SyncRepository(a.repository.databaseName);
  assert.equal((await reopened.snapshot()).sessions[0].dirty, true);
  connected = true;
  await a.cloud.sync();
  assert.equal(a.cloud.status, 'synced');
  assert.equal(a.client.rows.sessions.length, 1);
});

test('ediciones en dos dispositivos producen un conflicto visible y conservan la copia local', async () => {
  const a = setup();
  const ids = await training(a.service);
  await a.cloud.sync();
  const b = setup(a.client);
  await b.cloud.sync();
  const bSnapshot = await b.service.getTrainingSnapshot();
  await a.service.updateSession({ ...ids, weightKg: 55, reps: 21 });
  await a.cloud.sync();
  await b.service.updateSession({ cycleId: bSnapshot.cycle.id, sessionId: bSnapshot.sessions[0].id, weightKg: 60, reps: 22 });
  await b.cloud.sync();
  assert.equal(b.cloud.status, 'conflict');
  assert.equal((await b.cloud.local.snapshot()).sessions[0].weightKg, 60);
  await b.cloud.sync({ forceLocal: true });
  assert.equal(b.cloud.status, 'synced');
  assert.equal(a.client.rows.sessions[0].weight_kg, 60);
});

test('una respuesta de subida no borra una edición local más reciente', async () => {
  const a = setup();
  const ids = await training(a.service);
  const before = (await a.cloud.local.snapshot()).sessions[0];
  await a.service.updateSession({ ...ids, weightKg: 60, reps: 25 });
  await a.cloud.local.acknowledge('sessions', before, 'remote-revision');
  const after = (await a.cloud.local.snapshot()).sessions[0];
  assert.equal(after.dirty, true);
  assert.equal(after.weightKg, 60);
  assert.equal(after.cloudUpdatedAt, 'remote-revision');
});
