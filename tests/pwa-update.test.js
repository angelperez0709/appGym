import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { registerPwaUpdates } from '../src/services/pwa-update.js';

function fixture({ waiting = true, controller = true } = {}) {
  const events = {};
  const messages = [];
  const offers = [];
  let reloads = 0;
  let checks = 0;
  const registration = {
    waiting: waiting ? { postMessage: (message) => messages.push(message) } : null,
    addEventListener: (event, callback) => { events[event] = callback; },
    update: async () => { checks++; },
  };
  const options = {
    navigator: { onLine: true, serviceWorker: {
      controller: controller ? {} : null,
      addEventListener: (event, callback) => { events[event] = callback; },
      register: async (url, config) => {
        assert.equal(url, './sw.js');
        assert.equal(config.updateViaCache, 'none');
        return registration;
      },
    } },
    document: { visibilityState: 'visible', addEventListener: (event, callback) => { events[event] = callback; } },
    location: { hostname: 'angelperez0709.github.io', reload: () => { reloads++; } },
    onUpdate: (apply) => offers.push(apply),
    onError: (error) => assert.fail(error),
  };
  return { options, registration, events, messages, offers, reloads: () => reloads, checks: () => checks };
}

test('la actualización espera confirmación y recarga una sola vez después de activarse', async () => {
  const f = fixture();
  await registerPwaUpdates(f.options);
  assert.ok(f.offers.length);
  assert.equal(f.reloads(), 0);
  assert.equal(f.messages.length, 0);
  f.events.controllerchange();
  assert.equal(f.reloads(), 0);
  f.offers[0]();
  assert.deepEqual(f.messages, [{ type: 'SKIP_WAITING' }]);
  f.events.controllerchange();
  f.events.controllerchange();
  assert.equal(f.reloads(), 1);
});

test('la primera instalación no ofrece actualizar ni recarga y comprueba al volver a la app', async () => {
  const f = fixture({ controller: false });
  await registerPwaUpdates(f.options);
  assert.equal(f.offers.length, 0);
  f.events.controllerchange();
  assert.equal(f.reloads(), 0);
  f.events.visibilitychange();
  assert.equal(f.checks(), 2);
});

test('detecta una nueva versión cuando acaba de instalarse', async () => {
  const f = fixture({ waiting: false });
  await registerPwaUpdates(f.options);
  let statechange;
  f.registration.installing = { state: 'installing', addEventListener: (_, callback) => { statechange = callback; } };
  f.events.updatefound();
  f.registration.waiting = { postMessage() {} };
  f.registration.installing.state = 'installed';
  statechange();
  assert.equal(f.offers.length, 1);
});

test('el worker limpia solo su caché, conserva otros sitios y espera para activarse', async () => {
  const events = {};
  const deleted = [];
  let skipped = 0;
  let claimed = false;
  let pending;
  const prefix = 'bilbo-tracker-%2FappGym%2F-shell-';
  runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    URL, Request,
    self: {
      registration: { scope: 'https://example.com/appGym/' }, location: { origin: 'https://example.com' },
      addEventListener: (name, handler) => { events[name] = handler; },
      skipWaiting: async () => { skipped++; }, clients: { claim: async () => { claimed = true; } },
    },
    caches: {
      open: async () => ({ addAll: async (requests) => assert.ok(requests.every((request) => request.cache === 'reload')) }),
      keys: async () => [prefix + '__BUILD_VERSION__', prefix + 'old', 'bilbo-tracker-shell-v1', 'other-site'],
      delete: async (key) => { deleted.push(key); },
    },
  });
  const event = { waitUntil: (promise) => { pending = promise; } };
  events.install(event);
  await pending;
  assert.equal(skipped, 0);
  events.message({ ...event, data: { type: 'SKIP_WAITING' } });
  await pending;
  assert.equal(skipped, 1);
  events.activate(event);
  await pending;
  assert.deepEqual(deleted.sort(), ['bilbo-tracker-shell-v1', prefix + 'old'].sort());
  assert.equal(claimed, true);
});
