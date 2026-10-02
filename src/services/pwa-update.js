export async function registerPwaUpdates({ onUpdate, onError, navigator: browser = globalThis.navigator, document: page = globalThis.document, location = globalThis.location }) {
  if (!browser?.serviceWorker || ['localhost', '127.0.0.1'].includes(location.hostname)) return;
  let requested = false;
  let reloading = false;
  browser.serviceWorker.addEventListener('controllerchange', () => {
    if (requested && !reloading) {
      reloading = true;
      location.reload();
    }
  });
  try {
    const registration = await browser.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    const offerUpdate = () => {
      if (!registration.waiting || !browser.serviceWorker.controller) return;
      onUpdate(() => {
        if (!registration.waiting) {
          location.reload();
          return;
        }
        requested = true;
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      });
    };
    const watchInstalling = () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') offerUpdate();
      });
    };
    registration.addEventListener('updatefound', watchInstalling);
    watchInstalling();
    offerUpdate();
    let checking = false;
    const check = async () => {
      if (checking || browser.onLine === false) return;
      checking = true;
      try { await registration.update(); offerUpdate(); }
      catch (error) { onError(error); }
      finally { checking = false; }
    };
    page.addEventListener('visibilitychange', () => {
      if (page.visibilityState === 'visible') check();
    });
    globalThis.addEventListener?.('online', check);
    await check();
  } catch (error) {
    onError(error);
  }
}
