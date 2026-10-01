import { escapeHtml, formatDate, formatKg } from '../components/format.js';
import { exerciseSelect, screenHeader } from '../components/shared.js';

export async function renderRecordsScreen(container, context) {
  const { service, state, rerender } = context;
  const snapshot = await service.getRecordsSnapshot(state.exerciseId);
  state.exerciseId = snapshot.exerciseId;

  container.innerHTML = `
    <section class="screen">
      ${screenHeader('Récords por peso', 'Tu mayor número de repeticiones registrado con cada carga.')}
      ${exerciseSelect(snapshot.exercises, snapshot.exerciseId)}

      <article class="card">
        <p class="text-sm leading-6 text-muted">Los récords se calculan usando todos los ciclos del ejercicio, no solo el ciclo activo.</p>
      </article>

      <div class="space-y-3">
        ${snapshot.records.length ? snapshot.records.map((record) => `
          <article class="card">
            <div class="flex items-baseline justify-between gap-3">
              <strong class="text-2xl font-black">${formatKg(record.weightKg)}</strong>
              <strong class="text-2xl font-black text-brand">${record.maxReps} reps</strong>
            </div>
            <p class="mt-2 text-sm text-muted">${escapeHtml(record.cycleName)} · ${formatDate(record.performedAt)}</p>
          </article>`).join('') : '<div class="card text-sm text-muted">Aún no hay récords.</div>'}
      </div>
    </section>`;

  container.querySelector('[data-role="exercise-select"]')?.addEventListener('change', (event) => {
    state.exerciseId = Number(event.currentTarget.value);
    rerender();
  });
}
