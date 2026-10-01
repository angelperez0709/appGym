import { lineChart } from '../components/chart.js';
import { escapeHtml, formatKg, formatNumber } from '../components/format.js';
import { exerciseSelect, screenHeader, statusPill } from '../components/shared.js';

export async function renderProgressScreen(container, context) {
  const { service, state, rerender } = context;
  const snapshot = await service.getProgressSnapshot(state.exerciseId);
  state.exerciseId = snapshot.exerciseId;
  const seriesFor = (metric) => snapshot.summaries.map((cycle) => ({
    name: cycle.cycleName,
    points: snapshot.sessions
      .filter((session) => session.cycleId === cycle.cycleId)
      .map((session, index) => ({ label: `Sesión ${index + 1}`, value: session[metric] })),
  }));

  container.innerHTML = `
    <section class="screen">
      ${screenHeader('Progreso', 'Sigue la evolución de la serie Bilbo y compara todos los ciclos.')}
      ${exerciseSelect(snapshot.exercises, snapshot.exerciseId)}

      <p class="text-sm text-muted">Cada línea representa un ciclo del ejercicio. Los ciclos en curso muestran solo las sesiones registradas.</p>

      <article class="card space-y-3">
        <div>
          <h2 class="text-lg font-black">Volumen por sesión de entrenamiento</h2>
          <p class="mt-1 text-xs text-muted">Peso × repeticiones de la serie Bilbo, en kg.</p>
        </div>
        ${lineChart({ series: seriesFor('volumeKg'), suffix: ' kg', title: 'Volumen por sesión de entrenamiento' })}
      </article>

      <article class="card space-y-3">
        <div>
          <h2 class="text-lg font-black">1RM estimado por sesión de entrenamiento</h2>
          <p class="mt-1 text-xs text-muted">Se usa la fórmula de cada ciclo. A muchas repeticiones puede alejarse del 1RM real.</p>
        </div>
        ${lineChart({ series: seriesFor('estimatedOneRmKg'), suffix: ' kg', title: '1RM estimado por sesión de entrenamiento' })}
      </article>

      <div class="space-y-3">
        <h2 class="px-1 text-lg font-black">Comparación entre ciclos</h2>
        ${snapshot.summaries.length ? snapshot.summaries.map(renderSummary).join('') : '<div class="card text-sm text-muted">Aún no hay ciclos para comparar.</div>'}
      </div>
    </section>`;

  container.querySelector('[data-role="exercise-select"]')?.addEventListener('change', (event) => {
    state.exerciseId = Number(event.currentTarget.value);
    rerender();
  });
}

function renderSummary(cycle) {
  return `
    <article class="card space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-black">${escapeHtml(cycle.cycleName)}</h3>
          <p class="mt-1 text-sm text-muted">${cycle.sessions} entrenamientos · ${cycle.type === 'PROGRESSIVE' ? 'Progresivo' : '3 × 4'}</p>
        </div>
        ${statusPill(cycle.status)}
      </div>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        ${metric('Reps totales', cycle.totalReps)}
        ${metric('Volumen total', `${formatNumber(cycle.totalVolumeKg)} kg`)}
        ${metric('Mejor e1RM', formatKg(cycle.bestEstimatedOneRmKg))}
        ${metric('Peso máximo', formatKg(cycle.maxWeightKg))}
        ${metric('Mejor volumen/serie', `${formatNumber(cycle.bestSessionVolumeKg)} kg`)}
        ${metric('Última serie', cycle.sessions ? `${formatNumber(cycle.lastWeightKg, 1)} × ${cycle.lastReps}` : '—')}
      </div>
    </article>`;
}

function metric(label, value) {
  return `<div class="metric"><p class="metric-label">${escapeHtml(label)}</p><p class="metric-value">${escapeHtml(value)}</p></div>`;
}
