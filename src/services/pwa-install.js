export class PwaInstallService extends EventTarget {
  constructor() {
    super();
    this.deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferredPrompt = event;
      this.dispatchEvent(new Event('change'));
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.dispatchEvent(new Event('change'));
    });
  }

  get canInstall() {
    return Boolean(this.deferredPrompt);
  }

  get isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  async install() {
    if (!this.deferredPrompt) return false;
    const prompt = this.deferredPrompt;
    this.deferredPrompt = null;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    this.dispatchEvent(new Event('change'));
    return choice.outcome === 'accepted';
  }
}
