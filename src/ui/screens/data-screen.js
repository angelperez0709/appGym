import { downloadCsv } from '../../services/csv-exporter.js';
import { screenHeader } from '../components/shared.js';

export async function renderDataScreen(container, context) {
  const { service, installService, toast } = context;

  container.innerHTML = `
    <section class="screen">
      ${screenHeader('Datos', 'La aplicación funciona sin cuenta y guarda todo localmente en este dispositivo.')}

      <article class="card space-y-4">
        <div>
          <h2 class="text-lg font-black">Instalación PWA</h2>
          <p class="mt-1 text-sm leading-6 text-muted">${installService.isStandalone
            ? 'Bilbo Tracker ya se está ejecutando como aplicación instalada.'
            : installService.canInstall
              ? 'Puedes instalarla en el móvil y abrirla desde el icono como cualquier otra app.'
              : 'En Android abre esta web con Chrome y usa “Instalar aplicación” o “Añadir a pantalla de inicio”.'}</p>
        </div>
        ${installService.canInstall ? '<button class="btn-primary w-full" data-action="install">Instalar Bilbo Tracker</button>' : ''}
      </article>

      <article class="card space-y-4">
        <div>
          <h2 class="text-lg font-black">Exportación CSV</h2>
          <p class="mt-1 text-sm leading-6 text-muted">Incluye ejercicio, ciclo, fecha, peso, repeticiones, volumen, 1RM estimado y acumulados del ciclo.</p>
        </div>
        <button class="btn-secondary w-full" data-action="export">Descargar CSV</button>
      </article>

      <article class="card space-y-2">
        <h2 class="text-lg font-black">Almacenamiento</h2>
        <p class="text-sm leading-6 text-muted">Los datos se guardan en IndexedDB, la base de datos local del navegador. Una vez cargada la PWA, el service worker permite abrirla y registrar entrenamientos sin conexión.</p>
        <p class="text-sm leading-6 text-amber-300">No borres los datos del sitio ni desinstales la PWA sin exportar antes si quieres conservar una copia externa.</p>
      </article>
    </section>`;

  container.querySelector('[data-action="export"]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    try {
      button.disabled = true;
      const rows = await service.exportRows();
      downloadCsv(rows);
      toast('CSV descargado.', 'success');
    } catch (error) {
      toast(error.message ?? String(error), 'error');
    } finally {
      button.disabled = false;
    }
  });

  container.querySelector('[data-action="install"]')?.addEventListener('click', async () => {
    const installed = await installService.install();
    toast(installed ? 'Instalación iniciada.' : 'Instalación cancelada.', installed ? 'success' : 'info');
  });
}
