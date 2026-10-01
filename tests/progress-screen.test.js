import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProgressScreen } from '../src/ui/screens/progress-screen.js';
import { lineChart } from '../src/ui/components/chart.js';

test('muestra ambas métricas de ciclos completos y en curso sin rellenar sesiones', async () => {
  const container = { innerHTML: '', querySelector: () => null };
  const state = { exerciseId: 7 };
  await renderProgressScreen(container, {
    state,
    service: { getProgressSnapshot: async (id) => {
      assert.equal(id, 7);
      return {
        exerciseId: 7, exercises: [],
        summaries: [
          { cycleId: 1, cycleName: 'Completo', status: 'COMPLETED', sessions: 2 },
          { cycleId: 2, cycleName: 'En curso', status: 'ACTIVE', sessions: 1 },
        ],
        sessions: [
          { cycleId: 1, volumeKg: 1000, estimatedOneRmKg: 80 },
          { cycleId: 1, volumeKg: 900, estimatedOneRmKg: 85 },
          { cycleId: 2, volumeKg: 1200, estimatedOneRmKg: 90 },
        ],
      };
    } },
  });
  const html = container.innerHTML;
  assert.equal((html.match(/role="img"/g) ?? []).length, 2);
  assert.equal((html.match(/<circle /g) ?? []).length, 6);
  assert.match(html, /Completo · Sesión 1: 1[.,]?000 kg/);
  assert.match(html, /Completo · Sesión 1: 80 kg/);
  assert.match(html, /En curso · Sesión 1: 90 kg/);
  assert.doesNotMatch(html, /En curso · Sesión 2/);
  const circles = [...html.matchAll(/<circle cx="([^"]+)"/g)].map((match) => Number(match[1]));
  assert.equal(circles[0], circles[2]);
  assert.ok(circles[1] > circles[2]);
});

test('gráficas vacías, una única sesión y nombres escapados', () => {
  assert.match(lineChart({ series: [] }), /Aún no hay datos/);
  const html = lineChart({ series: [{ name: '<script>', points: [{ label: 'Sesión 1', value: 100 }] }] });
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /NaN|Infinity|<script>/);
  assert.equal((html.match(/<circle /g) ?? []).length, 1);
});
