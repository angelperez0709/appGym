import { escapeHtml, formatDate, formatKg, formatNumber } from '../components/format.js';
import { exerciseSelect, screenHeader } from '../components/shared.js';

export async function renderTrainScreen(container, context) {
  const { service, state, rerender, toast } = context;
  const snapshot = await service.getTrainingSnapshot(state.exerciseId);
  state.exerciseId = snapshot.exerciseId;

  container.innerHTML = `
    <section class="screen">
      ${screenHeader('Entrenar', 'Registra únicamente la serie Bilbo del entrenamiento.')}
      ${exerciseSelect(snapshot.exercises, snapshot.exerciseId)}
      ${renderTrainingContent(snapshot)}
    </section>`;

  container.querySelector('[data-role="exercise-select"]')?.addEventListener('change', (event) => {
    state.exerciseId = Number(event.currentTarget.value);
    rerender();
  });

  const form = container.querySelector('[data-role="session-form"]');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const repsInput = form.elements.namedItem('reps');

    try {
      button.disabled = true;
      const result = await service.logPrescribedSession({
        cycleId: Number(form.dataset.cycleId),
        reps: Number(repsInput.value),
      });

      if (result.cycleCompleted) {
        toast(`Ciclo completado · ${result.cycle.totalReps} reps · ${formatNumber(result.cycle.totalVolumeKg)} kg`, 'success');
      } else {
        toast('Serie guardada.', 'success');
      }
      await rerender();
    } catch (error) {
      toast(error.message ?? String(error), 'error');
      button.disabled = false;
    }
  });

  queueMicrotask(() => container.querySelector('input[name="reps"]')?.focus());
}

function renderTrainingContent({ exercises, cycle, sessions, prescription }) {
  if (exercises.length === 0) {
    return `
      <div class="card space-y-3 text-center">
        <p class="text-lg font-extrabold">Todavía no hay ejercicios</p>
        <p class="text-sm leading-6 text-muted">Crea un ejercicio y su primer ciclo desde la pestaña Ciclos.</p>
      </div>`;
  }

  if (!cycle) {
    return `
      <div class="card space-y-3 text-center">
        <p class="text-lg font-extrabold">No hay un ciclo activo</p>
        <p class="text-sm leading-6 text-muted">Crea el siguiente ciclo para este ejercicio desde la pestaña Ciclos.</p>
      </div>`;
  }

  return `
    <article class="card space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-bold uppercase tracking-wider text-muted">Ciclo activo</p>
          <h2 class="mt-1 text-xl font-black">${escapeHtml(cycle.name)}</h2>
        </div>
        <span class="chip !border-brand/40 !bg-brand/10 !text-brand">${cycle.type === 'PROGRESSIVE' ? 'Progresivo' : '3 × 4'}</span>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="metric"><p class="metric-label">Reps acumuladas</p><p class="metric-value">${cycle.totalReps}</p></div>
        <div class="metric"><p class="metric-label">Volumen acumulado</p><p class="metric-value">${formatNumber(cycle.totalVolumeKg)} kg</p></div>
      </div>

      ${prescription ? `
        <div class="rounded-2xl border border-brand/30 bg-brand/10 p-4">
          <p class="text-xs font-bold uppercase tracking-wider text-brand">Siguiente peso</p>
          <p class="mt-1 text-4xl font-black tracking-tight text-white">${formatKg(prescription.weightKg)}</p>
          <p class="mt-2 text-sm text-slate-300">${escapeHtml(prescription.label)}${prescription.blockProgress ? ` · ${escapeHtml(prescription.blockProgress)}` : ''}</p>
        </div>` : ''}
    </article>

    ${prescription ? `
      <form class="card space-y-4" data-role="session-form" data-cycle-id="${cycle.id}">
        <div>
          <h2 class="text-lg font-black">Registrar serie Bilbo</h2>
          <p class="mt-1 text-sm text-muted">El peso lo prescribe automáticamente el ciclo.</p>
        </div>
        <div>
          <label class="label" for="bilbo-reps">Repeticiones</label>
          <input id="bilbo-reps" class="field !py-4 text-center !text-3xl !font-black" type="number" inputmode="numeric" min="1" step="1" name="reps" placeholder="25" required />
        </div>
        <button class="btn-primary w-full" type="submit">Guardar serie</button>
      </form>` : ''}

    <article class="card space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-black">Últimas sesiones</h2>
        <span class="text-xs font-semibold text-muted">${sessions.length} en el ciclo</span>
      </div>
      ${sessions.length ? [...sessions].reverse().slice(0, 6).map((session) => `
        <div class="border-t border-line pt-3 first:border-0 first:pt-0">
          <div class="flex items-baseline justify-between gap-3">
            <span class="text-sm text-muted">${formatDate(session.performedAt)}</span>
            <strong>${formatKg(session.weightKg)} × ${session.reps}</strong>
          </div>
          <p class="mt-1 text-xs text-muted">Volumen ${formatNumber(session.volumeKg)} kg · e1RM ${formatKg(session.estimatedOneRmKg)}</p>
        </div>`).join('') : '<p class="text-sm text-muted">Aún no hay sesiones en este ciclo.</p>'}
    </article>`;
}

