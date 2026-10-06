import { TrainingService } from './application/training-service.js';
import { TrainingRepository } from './data/training-repository.js';
import { PwaInstallService } from './services/pwa-install.js';
import { registerPwaUpdates } from './services/pwa-update.js';
import { AppController } from './ui/app-controller.js';
import { CloudSync } from './services/cloud-sync.js';
import { supabase } from './services/supabase-client.js';

const root = document.querySelector('#app');
const repository = new TrainingRepository();
const service = new TrainingService(repository);
const installService = new PwaInstallService();
const cloud = new CloudSync({ client: supabase, service });
const app = new AppController({ root, service, installService, cloud });

bootstrap();

async function bootstrap() {
  try {
    await cloud.initialize();
    await service.initialize();
    await app.start();
    registerPwaUpdates({
      onUpdate: (apply) => app.showUpdate(apply),
      onError: (error) => console.warn('No se pudo comprobar la actualización:', error),
    });
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
