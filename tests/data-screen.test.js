import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDataScreen } from '../src/ui/screens/data-screen.js';

function container() {
  return { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
}

test('Datos muestra registro, login y recuperación sin pedir credenciales de Supabase', async () => {
  const screen = container();
  await renderDataScreen(screen, { cloud: { user: null }, installService: {} });
  assert.match(screen.innerHTML, /Crear cuenta/);
  assert.match(screen.innerHTML, /Iniciar sesión/);
  assert.match(screen.innerHTML, /He olvidado mi contraseña/);
  assert.doesNotMatch(screen.innerHTML, /service_role|sb_publishable|Database password/);
});

test('cuenta autenticada muestra la subida del historial local, estado y conflictos', async () => {
  const screen = container();
  await renderDataScreen(screen, {
    installService: {}, cloud: {
      user: { id: 'user-a', email: '<user>@example.com' }, status: 'conflict', message: 'Pendiente',
      guest: { guestAvailable: async (id) => { assert.equal(id, 'user-a'); return true; } },
    },
  });
  assert.match(screen.innerHTML, /&lt;user&gt;@example.com/);
  assert.match(screen.innerHTML, /Subir mi historial local/);
  assert.match(screen.innerHTML, /Sincronizar ahora/);
  assert.match(screen.innerHTML, /Conservar mis cambios/);
  assert.doesNotMatch(screen.innerHTML, /data-cloud-conflict hidden/);
});
