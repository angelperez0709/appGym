const DATABASE_NAME = 'bilbo-tracker';
const DATABASE_VERSION = 1;

export const STORE = Object.freeze({
  EXERCISES: 'exercises',
  CYCLES: 'cycles',
  CYCLE_WEIGHTS: 'cycleWeights',
  SESSIONS: 'sessions',
});

let databasePromise;

export function openDatabase() {
  if (!('indexedDB' in globalThis)) {
    return Promise.reject(new Error('Este navegador no soporta IndexedDB.'));
  }

  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.onupgradeneeded = () => createSchema(request.result, request.transaction);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la base de datos.'));
      request.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña de Bilbo Tracker.'));
    });
  }

  return databasePromise;
}

export function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Error de IndexedDB.'));
  });
}

export async function withTransaction(storeNames, mode, operation) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)]));
    let result;
    let operationFinished = false;

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error ?? new Error('La transacción de IndexedDB ha fallado.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('La transacción de IndexedDB se ha cancelado.'));

    Promise.resolve()
      .then(() => operation(stores, transaction))
      .then((value) => {
        result = value;
        operationFinished = true;
      })
      .catch((error) => {
        if (!operationFinished) {
          try { transaction.abort(); } catch { /* la transacción puede haber finalizado */ }
        }
        reject(error);
      });
  });
}

function createSchema(db) {
  if (!db.objectStoreNames.contains(STORE.EXERCISES)) {
    const store = db.createObjectStore(STORE.EXERCISES, { keyPath: 'id', autoIncrement: true });
    store.createIndex('normalizedName', 'normalizedName', { unique: true });
  }

  if (!db.objectStoreNames.contains(STORE.CYCLES)) {
    const store = db.createObjectStore(STORE.CYCLES, { keyPath: 'id', autoIncrement: true });
    store.createIndex('exerciseId', 'exerciseId');
    store.createIndex('exerciseStatus', ['exerciseId', 'status']);
  }

  if (!db.objectStoreNames.contains(STORE.CYCLE_WEIGHTS)) {
    const store = db.createObjectStore(STORE.CYCLE_WEIGHTS, { keyPath: 'id', autoIncrement: true });
    store.createIndex('cycleId', 'cycleId');
  }

  if (!db.objectStoreNames.contains(STORE.SESSIONS)) {
    const store = db.createObjectStore(STORE.SESSIONS, { keyPath: 'id', autoIncrement: true });
    store.createIndex('cycleId', 'cycleId');
  }
}
