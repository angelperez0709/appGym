import { TrainingService } from './application/training-service.js';
import { TrainingRepository } from './data/training-repository.js';
import { PwaInstallService } from './services/pwa-install.js';
import { AppController } from './ui/app-controller.js';

const root = document.querySelector('#app');
const repository = new TrainingRepository();
const service = new TrainingService(repository);
const installService = new PwaInstallService();
const app = new AppController({ root, service, installService });

bootstrap();

async function bootstrap() {
  try {
    await service.initialize();
    await app.start();
    registerServiceWorker();
  } catch (error) {
    root.innerHTML = `
      <main class="mx-auto flex min-h-screen max-w-lg items-center px-5">
        <div class="card w-full border-rose-400/30">
          <h1 class="text-xl font-black text-rose-200">Error al iniciar Bilbo Tracker</h1>
          <p class="mt-2 text-sm leading-6 text-rose-100/80"></p>
        </div>
      </main>`;
    root.querySelector('p').textContent = error.message ?? String(error);
  }
}

function registerServiceWorker() {
  const localDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!('serviceWorker' in navigator) || localDevelopment) return;
  const register = () => navigator.serviceWorker.register('./sw.js').catch((error) => {
    console.warn('No se pudo registrar el service worker:', error);
  });

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
