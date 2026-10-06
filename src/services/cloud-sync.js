import { TrainingRepository } from '../data/training-repository.js';
import { SyncRepository } from '../data/sync-repository.js';
import { CLOUD_TABLES, toCloudRow } from '../data/cloud-records.js';

const ACCOUNT_KEY = 'bilbo-cloud-account';

export class CloudSync extends EventTarget {
  constructor({ client, service, storage = globalThis.localStorage, online = () => globalThis.navigator?.onLine !== false }) {
    super();
    this.client = client;
    this.service = service;
    this.storage = storage;
    this.online = online;
    this.user = null;
    this.status = 'local';
    this.message = '';
    this.pending = 0;
    this.running = null;
    this.guest = new SyncRepository('bilbo-tracker');
  }

  async initialize() {
    this.recovering = this.storage.getItem('bilbo-password-recovery') === '1';
    try { this.user = JSON.parse(this.storage.getItem(ACCOUNT_KEY)); } catch { this.user = null; }
    // Cached identity selects the offline database; only the Auth token authorizes cloud requests.
    if (!this.user?.id) this.user = null;
    const repository = new TrainingRepository(this.user ? 'bilbo-tracker-user-' + this.user.id : 'bilbo-tracker');
    this.service.repository = repository;
    this.local = new SyncRepository(repository.databaseName);
    await repository.ready();
    repository.addEventListener('change', () => {
      if (this.user) { this.setStatus('pending', 'Cambios guardados en el dispositivo.'); this.schedule(); }
    });
    this.client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        this.recovering = true;
        this.storage.setItem('bilbo-password-recovery', '1');
        this.dispatchEvent(new Event('change'));
      }
      if (session?.user && session.user.id !== this.user?.id) {
        this.saveAccount(session.user);
        setTimeout(() => globalThis.location.reload(), 0);
      } else if (event === 'SIGNED_OUT' && this.user && this.online()) {
        this.storage.removeItem(ACCOUNT_KEY);
        setTimeout(() => globalThis.location.reload(), 0);
      }
    });
    globalThis.addEventListener?.('online', () => this.schedule());
    globalThis.document?.addEventListener('visibilitychange', () => {
      if (globalThis.document.visibilityState === 'visible') this.schedule();
    });
    this.timer = setInterval(() => { if (globalThis.document?.visibilityState !== 'hidden') this.schedule(); }, 60000);
    this.timer.unref?.();
    if (this.user) this.schedule();
  }

  saveAccount(user) {
    this.storage.setItem(ACCOUNT_KEY, JSON.stringify({ id: user.id, email: user.email }));
  }

  setStatus(status, message) {
    this.status = status;
    this.message = message;
    this.dispatchEvent(new Event('change'));
  }

  schedule() {
    clearTimeout(this.scheduled);
    this.scheduled = setTimeout(() => this.sync().catch(() => {}), 500);
  }

  async signIn(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
    this.saveAccount(data.user);
    globalThis.location.reload();
  }

  async signUp(email, password) {
    const { data, error } = await this.client.auth.signUp({ email, password, options: { emailRedirectTo: new URL('./', globalThis.location.href).href } });
    if (error) throw new Error(error.message);
    if (data.session) { this.saveAccount(data.user); globalThis.location.reload(); }
    return Boolean(data.session);
  }

  async resetPassword(email) {
    const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo: new URL('./', globalThis.location.href).href });
    if (error) throw new Error(error.message);
  }

  async updatePassword(password) {
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw new Error(error.message);
    this.recovering = false;
    this.storage.removeItem('bilbo-password-recovery');
  }

  async signOut() {
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw new Error(error.message);
    this.storage.removeItem(ACCOUNT_KEY);
    this.storage.removeItem('bilbo-password-recovery');
    globalThis.location.reload();
  }

  async importGuest() {
    if (!this.user) throw new Error('Inicia sesión primero.');
    await this.sync();
    if (this.status !== 'synced') throw new Error(this.message || 'Conecta a Internet antes de subir el historial local.');
    await this.local.importGuest(this.guest);
    // Mark only after the local transaction succeeds. Retry uploads use the same UUIDs.
    await this.guest.setImported(this.user.id);
    this.setStatus('pending', 'Historial importado. Subiendo a la nube…');
    await this.sync();
  }

  async fetchRemote() {
    const remote = {};
    for (const definition of CLOUD_TABLES) {
      remote[definition.store] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await this.client.from(definition.table).select('*').eq('user_id', this.user.id).order('id').range(offset, offset + 999);
        if (error) throw new Error(error.message);
        remote[definition.store].push(...data);
        if (data.length < 1000) break;
      }
    }
    return remote;
  }

  async downloadCloud() {
    if (this.running) await this.running;
    if (!this.online() || !this.user) throw new Error('Necesitas conexión e iniciar sesión.');
    this.running = (async () => {
      const remote = await this.fetchRemote();
      await this.local.mergeRemote(remote, { discardLocal: true });
      this.setStatus('synced', 'Datos recuperados de la nube.');
      this.dispatchEvent(new Event('datachange'));
    })();
    try { await this.running; }
    finally { this.running = null; }
  }

  async sync({ forceLocal = false } = {}) {
    if (this.running) {
      await this.running;
      if (forceLocal) return this.sync({ forceLocal });
      return;
    }
    if (!this.user) return;
    if (!this.online()) { this.setStatus('offline', 'Sin conexión. Los cambios se enviarán al recuperar Internet.'); return; }
    this.running = this.performSync(forceLocal);
    try { await this.running; }
    finally { this.running = null; }
  }

  async performSync(forceLocal) {
    this.setStatus('syncing', 'Sincronizando…');
    try {
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      if (!data.session || data.session.user.id !== this.user.id) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión; tus cambios locales se conservan.');
      await this.local.prepare();
      const snapshot = await this.local.snapshot();
      for (const deletion of snapshot.sync.filter((row) => row.table)) {
        const result = await this.client.from(deletion.table).delete().eq('id', deletion.cloudId).eq('user_id', this.user.id);
        if (result.error) throw new Error(result.error.message);
        await this.local.acknowledgeDelete(deletion.id);
      }
      for (const definition of CLOUD_TABLES) {
        for (const row of snapshot[definition.store].filter((item) => item.dirty || forceLocal)) {
          const payload = toCloudRow(definition, row, snapshot, this.user.id);
          let query;
          if (row.cloudUpdatedAt && !forceLocal) {
            query = this.client.from(definition.table).update(payload).eq('id', row.cloudId).eq('user_id', this.user.id).eq('updated_at', row.cloudUpdatedAt);
          } else query = this.client.from(definition.table).upsert(payload, { onConflict: 'id' });
          const result = await query.select('id,updated_at');
          if (result.error) throw new Error(result.error.message);
          if (!result.data?.length) {
            // A previous upload can have succeeded even if its network response was lost.
            const existing = await this.client.from(definition.table).select('*').eq('id', row.cloudId).eq('user_id', this.user.id);
            if (!existing.error && existing.data?.length === 1 && Object.entries(payload).every(([key, value]) => existing.data[0][key] === value)) {
              await this.local.acknowledge(definition.store, row, existing.data[0].updated_at);
              continue;
            }
            this.setStatus('conflict', 'Este registro cambió en otro dispositivo. Elige qué datos conservar.');
            return;
          }
          await this.local.acknowledge(definition.store, row, result.data[0].updated_at);
        }
      }
      const remote = await this.fetchRemote();
      await this.local.mergeRemote(remote);
      const current = await this.local.snapshot();
      this.pending = CLOUD_TABLES.reduce((sum, item) => sum + current[item.store].filter((row) => row.dirty).length, 0) + current.sync.filter((row) => row.table).length;
      this.setStatus(this.pending ? 'pending' : 'synced', this.pending ? 'Quedan cambios pendientes de enviar.' : 'Todos los cambios están guardados en la nube.');
      this.dispatchEvent(new Event('datachange'));
      if (this.pending) this.schedule();
    } catch (error) {
      this.setStatus(this.online() ? 'error' : 'offline', 'No se pudo sincronizar. Los datos siguen en este dispositivo. ' + (error.message ?? ''));
      throw error;
    }
  }
}
