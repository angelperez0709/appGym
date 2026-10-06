import { downloadCsv } from '../../services/csv-exporter.js';
import { screenHeader } from '../components/shared.js';
import { escapeHtml } from '../components/format.js';

export async function renderDataScreen(container, context) {
  const { service, installService, toast, cloud } = context;
  const canImport = cloud?.user ? await cloud.guest.guestAvailable(cloud.user.id) : false;

  container.innerHTML = `
    <section class="screen">
      ${screenHeader('Datos', 'Gestiona tu cuenta, la sincronización y las copias de tus entrenamientos.')}
      ${cloud ? renderCloudCard(cloud, canImport) : ''}

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
        <p class="text-sm leading-6 text-muted">Puedes entrenar sin conexión. Con una cuenta, los cambios se sincronizan con Supabase cuando hay Internet. Cada cuenta tiene su propia copia local.</p>
        <p class="text-sm leading-6 text-amber-300">Antes de borrar los datos del navegador, comprueba que no queden cambios pendientes de sincronizar.</p>
      </article>
    </section>`;

  container.querySelector('[data-role="auth-form"]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const action = event.submitter?.value ?? 'login';
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const controls = form.querySelectorAll('button');
    controls.forEach((button) => { button.disabled = true; });
    try {
      if (action === 'signup') {
        const signedIn = await cloud.signUp(email, password);
        if (!signedIn) toast('Revisa tu correo para confirmar la cuenta. Después inicia sesión.', 'success');
      } else await cloud.signIn(email, password);
    } catch (error) { toast(error.message, 'error'); }
    finally { controls.forEach((button) => { button.disabled = false; }); }
  });

  container.querySelector('[data-action="reset-password"]')?.addEventListener('click', async () => {
    const email = container.querySelector('[name="email"]').value.trim();
    if (!email) { toast('Escribe tu correo para recuperar la contraseña.', 'error'); return; }
    try { await cloud.resetPassword(email); toast('Revisa tu correo para restablecer la contraseña.', 'success'); }
    catch (error) { toast(error.message, 'error'); }
  });

  container.querySelector('[data-role="password-form"]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await cloud.updatePassword(event.currentTarget.elements.password.value);
      toast('Contraseña actualizada.', 'success');
      await renderDataScreen(container, context);
    } catch (error) { toast(error.message, 'error'); }
  });

  const cloudActions = {
    sync: () => cloud.sync(),
    import: () => cloud.importGuest(),
    logout: () => cloud.signOut(),
    'keep-local': () => cloud.sync({ forceLocal: true }),
    'use-cloud': () => cloud.downloadCloud(),
  };
  container.querySelectorAll('[data-cloud-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.dataset.cloudAction;
      if (action === 'use-cloud' && !window.confirm('¿Recuperar la versión de la nube y descartar los cambios pendientes de este dispositivo?')) return;
      if (action === 'keep-local' && !window.confirm('¿Guardar la versión de este dispositivo en la nube, sustituyendo los registros que hayan cambiado en otro dispositivo?')) return;
      button.disabled = true;
      try {
        await cloudActions[action]();
        if (['synced', 'pending'].includes(cloud.status) && action !== 'logout') await renderDataScreen(container, context);
      } catch (error) { toast(error.message, 'error'); }
      finally { button.disabled = false; }
    });
  });

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

function renderCloudCard(cloud, canImport) {
  const authForm = `<form class="space-y-3" data-role="auth-form">
    <label class="block"><span class="label">Correo electrónico</span><input class="field" name="email" type="email" autocomplete="username" value="${escapeHtml(cloud.user?.email ?? '')}" required /></label>
    <label class="block"><span class="label">Contraseña</span><input class="field" name="password" type="password" autocomplete="current-password" minlength="6" required /></label>
    <div class="flex flex-wrap gap-2"><button class="btn-primary" type="submit" value="login">Iniciar sesión</button>${cloud.user ? '' : '<button class="btn-secondary" type="submit" value="signup">Crear cuenta</button>'}</div>
    <button class="btn-secondary" type="button" data-action="reset-password">He olvidado mi contraseña</button>
  </form>`;
  return `<article class="card space-y-4">
    <h2 class="text-lg font-black">Cuenta y nube</h2>
    ${cloud.recovering ? `<form class="space-y-3" data-role="password-form"><label class="block"><span class="label">Nueva contraseña</span><input class="field" type="password" name="password" autocomplete="new-password" minlength="6" required /></label><button class="btn-primary" type="submit">Cambiar contraseña</button></form>` : ''}
    ${cloud.user ? `
      <p class="text-sm">${escapeHtml(cloud.user.email)}</p>
      <p class="text-sm text-muted" data-cloud-status aria-live="polite">${escapeHtml(cloud.message || 'Preparando sincronización…')}</p>
      <div class="flex flex-wrap gap-2"><button class="btn-primary" type="button" data-cloud-action="sync">Sincronizar ahora</button><button class="btn-secondary" type="button" data-cloud-action="logout">Cerrar sesión</button></div>
      ${canImport ? '<p class="text-sm text-muted">Hay entrenamientos guardados antes de iniciar sesión. Súbelos a esta cuenta desde este dispositivo.</p><button class="btn-secondary w-full" type="button" data-cloud-action="import">Subir mi historial local</button>' : ''}
      <div class="space-y-2" data-cloud-conflict ${cloud.status === 'conflict' ? '' : 'hidden'}><p class="text-sm text-amber-300">Hay cambios de otro dispositivo. Elige qué versión conservar.</p><button class="btn-secondary" type="button" data-cloud-action="keep-local">Conservar mis cambios</button><button class="btn-secondary" type="button" data-cloud-action="use-cloud">Recuperar versión de la nube</button></div>
      <details><summary class="text-sm text-muted">Volver a iniciar sesión</summary>${authForm}</details>
    ` : `<p class="text-sm text-muted">Inicia sesión para guardar tus entrenamientos en la nube y recuperarlos en otro dispositivo. Tu historial local se conserva.</p>${authForm}`}
  </article>`;
}
