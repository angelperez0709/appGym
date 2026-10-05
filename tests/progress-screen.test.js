import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProgressScreen } from '../src/ui/screens/progress-screen.js';
import { barChart, lineChart } from '../src/ui/components/chart.js';

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
  assert.equal((html.match(/<circle /g) ?? []).length, 3);
  assert.equal((html.match(/data-bar=/g) ?? []).length, 3);
  assert.equal((html.match(/<polyline /g) ?? []).length, 2);
  assert.match(html, /Completo · Sesión 1: 1[.,]?000 kg/);
  assert.match(html, /Completo · Sesión 1: 80 kg/);
  assert.match(html, /En curso · Sesión 1: 90 kg/);
  assert.doesNotMatch(html, /En curso · Sesión 2/);
  const circles = [...html.matchAll(/<circle cx="([^"]+)"/g)].map((match) => Number(match[1]));
  assert.equal(circles[0], circles[2]);
  assert.ok(circles[1] > circles[2]);
});

test('barras agrupadas por sesión, sin inventar sesiones y con escala desde cero', () => {
  const html = barChart({ series: [
    { name: 'A', points: [{ label: 'Sesión 1', value: 100 }, { label: 'Sesión 2', value: 200 }] },
    { name: 'B', points: [{ label: 'Sesión 1', value: 150 }] },
  ] });
  const bars = [...html.matchAll(/data-bar="(\d+)" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)].map((match) => match.slice(1).map(Number));
  assert.equal(bars.length, 3);
  assert.equal(bars[0][0], bars[2][0]);
  assert.ok(bars[0][1] + bars[0][3] < bars[2][1]);
  assert.ok(bars[2][1] + bars[2][3] < bars[1][1]);
  assert.equal(bars[1][4], bars[0][4] * 2);
  assert.match(html, /text-anchor="end">0<\/text>/);
  assert.doesNotMatch(html, /<polyline|<circle|min-width:|overflow-x-auto/);
});

test('barras vacías, una sesión y valores cero no generan coordenadas inválidas', () => {
  assert.match(barChart({ series: [] }), /Aún no hay datos/);
  for (const value of [0, 100]) {
    const html = barChart({ series: [{ name: '<script>', points: [{ label: 'Sesión 1', value }] }] });
    assert.match(html, /&lt;script&gt;/);
    assert.equal((html.match(/data-bar=/g) ?? []).length, 1);
    assert.doesNotMatch(html, /NaN|Infinity|<script>/);
  }
});

test('gráficas vacías, una única sesión y nombres escapados', () => {
  assert.match(lineChart({ series: [] }), /Aún no hay datos/);
  const html = lineChart({ series: [{ name: '<script>', points: [{ label: 'Sesión 1', value: 100 }] }] });
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /NaN|Infinity|<script>/);
  assert.equal((html.match(/<circle /g) ?? []).length, 1);
  assert.equal((html.match(/data-axis="session"/g) ?? []).length, 1);
});

test('numera todas las sesiones y divide el rango vertical en diez intervalos iguales', () => {
  const html = lineChart({ series: [{ name: 'Ciclo', points: Array.from({ length: 10 }, (_, index) => ({ label: `Sesión ${index + 1}`, value: 100 + index * 10 })) }] });
  const labels = [...html.matchAll(/data-axis="session">(\d+)<\/text>/g)].map((match) => Number(match[1]));
  assert.deepEqual(labels, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const ticks = [...html.matchAll(/text-anchor="end">([^<]+)<\/text>/g)].map((match) => Number(match[1].replace(',', '.')));
  assert.deepEqual(ticks, [190, 181, 172, 163, 154, 145, 136, 127, 118, 109, 100]);
  assert.doesNotMatch(html, />Sesión \d+<\/text>/);
  assert.doesNotMatch(html, /min-width:|overflow-x-auto/);
});
