const CACHE_PREFIX = `bilbo-tracker-${encodeURIComponent(new URL(self.registration.scope).pathname)}-shell-`;
const CACHE_NAME = `${CACHE_PREFIX}__BUILD_VERSION__`;
const PRECACHE_ASSETS = ['__BUILD_ASSETS__'];
const ASSETS = PRECACHE_ASSETS[0] === '__BUILD_ASSETS__'
  ? ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './assets/app.css']
  : PRECACHE_ASSETS;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(
    ASSETS.map((asset) => new Request(new URL(asset, self.registration.scope), { cache: 'reload' })),
  )));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME && (key.startsWith(CACHE_PREFIX) || key === 'bilbo-tracker-shell-v1')).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) => (
      (await cache.match(new URL('./index.html', self.registration.scope))) ?? fetch(event.request)
    )));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}
