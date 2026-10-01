import { METHOD_RULES } from '../../application/training-service.js';
import { escapeHtml, formatDate, formatNumber, parseDecimal } from '../components/format.js';
import { exerciseSelect, screenHeader, statusPill } from '../components/shared.js';

export async function renderCyclesScreen(container, context) {
  const { service, state, rerender, toast } = context;
  const snapshot = await service.getCyclesSnapshot(state.exerciseId);
  state.exerciseId = snapshot.exerciseId;
  const activeCycle = snapshot.cycles.find((cycle) => cycle.status === 'ACTIVE');

  container.innerHTML = `
    <section class="screen">
      ${screenHeader('Ciclos', 'Configura la progresión y consulta los acumulados de cada ciclo.')}

      <article class="card space-y-4">
        <h2 class="text-lg font-black">Ejercicios</h2>
        ${exerciseSelect(snapshot.exercises, snapshot.exerciseId)}
        <form class="flex gap-2" data-role="exercise-form">
          <input class="field min-w-0 flex-1" name="name" autocomplete="off" placeholder="Press banca" aria-label="Nuevo ejercicio" required />
          <button class="btn-secondary shrink-0" type="submit">Añadir</button>
        </form>
      </article>

      ${snapshot.exerciseId ? `
      <article class="card space-y-4">
        <div>
          <h2 class="text-lg font-black">Nuevo ciclo</h2>
          ${activeCycle ? `<p class="mt-1 text-sm text-amber-300">Completa “${escapeHtml(activeCycle.name)}” antes de crear otro ciclo para este ejercicio.</p>` : ''}
        </div>

        <form class="space-y-4" data-role="cycle-form">
          <div class="grid grid-cols-2 gap-2 rounded-xl bg-panel2 p-1" data-role="type-toggle">
            <button class="rounded-lg bg-brand px-3 py-2.5 text-sm font-black text-slate-950" type="button" data-cycle-type="PROGRESSIVE">Progresivo</button>
            <button class="rounded-lg px-3 py-2.5 text-sm font-bold text-muted" type="button" data-cycle-type="FIXED_BLOCKS">3 pesos × 4</button>
          </div>
          <input type="hidden" name="type" value="PROGRESSIVE" />

          <label class="block"><span class="label">Nombre</span><input class="field" name="name" placeholder="Ciclo octubre" required /></label>
          <label class="block"><span class="label">Fórmula de 1RM estimado</span>
            <select class="field" name="formula"><option value="EPLEY">Epley</option><option value="MAYHEW">Mayhew</option></select>
          </label>

          <div class="space-y-4" data-fields="PROGRESSIVE">
            <label class="block"><span class="label">1RM de referencia (kg)</span><input class="field" name="oneRm" inputmode="decimal" placeholder="100" /></label>
            <div class="grid grid-cols-2 gap-3">
              <label class="block"><span class="label">Porcentaje inicial</span><input class="field" name="percentage" inputmode="decimal" value="50" /></label>
              <label class="block"><span class="label">Incremento (kg)</span><input class="field" name="increment" inputmode="decimal" value="2.5" /></label>
            </div>
            <p class="text-sm leading-6 text-muted">Se añade el incremento en cada entrenamiento. El ciclo termina automáticamente al hacer ${METHOD_RULES.progressiveEndReps} repeticiones o menos.</p>
          </div>

          <div class="hidden space-y-4" data-fields="FIXED_BLOCKS">
            <div class="grid grid-cols-3 gap-2">
              <label><span class="label">Peso 1</span><input class="field" name="weight1" inputmode="decimal" placeholder="60" /></label>
              <label><span class="label">Peso 2</span><input class="field" name="weight2" inputmode="decimal" placeholder="62,5" /></label>
              <label><span class="label">Peso 3</span><input class="field" name="weight3" inputmode="decimal" placeholder="65" /></label>
            </div>
            <p class="text-sm leading-6 text-muted">${METHOD_RULES.fixedBlockSessionsPerWeight} entrenamientos seguidos con cada peso: primero peso 1, después peso 2 y finalmente peso 3.</p>
          </div>

          <button class="btn-primary w-full" type="submit" ${activeCycle ? 'disabled' : ''}>Crear ciclo</button>
        </form>
      </article>` : ''}

      <div class="space-y-3">
        <h2 class="px-1 text-lg font-black">Historial</h2>
        ${snapshot.cycles.length ? snapshot.cycles.map(renderCycleCard).join('') : '<div class="card text-sm text-muted">Aún no hay ciclos para este ejercicio.</div>'}
      </div>
    </section>`;

  container.querySelector('[data-role="exercise-select"]')?.addEventListener('change', (event) => {
    state.exerciseId = Number(event.currentTarget.value);
    rerender();
  });

  container.querySelector('[data-role="exercise-form"]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const id = await service.createExercise(form.elements.name.value);
      state.exerciseId = Number(id);
      toast('Ejercicio creado.', 'success');
      await rerender();
    } catch (error) {
      toast(error.message ?? String(error), 'error');
    }
  });

  const cycleForm = container.querySelector('[data-role="cycle-form"]');
  if (!cycleForm) return;

  container.querySelectorAll('[data-cycle-type]').forEach((button) => {
    button.addEventListener('click', () => setCycleType(container, cycleForm, button.dataset.cycleType));
  });

  cycleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = cycleForm.querySelector('button[type="submit"]');
    const type = cycleForm.elements.type.value;

    try {
      button.disabled = true;
      if (type === 'PROGRESSIVE') {
        await service.createProgressiveCycle({
          exerciseId: state.exerciseId,
          name: cycleForm.elements.name.value,
          formula: cycleForm.elements.formula.value,
          oneRmKg: parseDecimal(cycleForm.elements.oneRm.value),
          startPercentage: parseDecimal(cycleForm.elements.percentage.value),
          incrementKg: parseDecimal(cycleForm.elements.increment.value),
        });
      } else {
        await service.createFixedCycle({
          exerciseId: state.exerciseId,
          name: cycleForm.elements.name.value,
          formula: cycleForm.elements.formula.value,
          weightsKg: [
            parseDecimal(cycleForm.elements.weight1.value),
            parseDecimal(cycleForm.elements.weight2.value),
            parseDecimal(cycleForm.elements.weight3.value),
          ],
        });
      }

      toast('Ciclo creado.', 'success');
      await rerender();
    } catch (error) {
      toast(error.message ?? String(error), 'error');
      button.disabled = false;
    }
  });
}

function setCycleType(container, form, type) {
  form.elements.type.value = type;
  container.querySelectorAll('[data-fields]').forEach((fields) => fields.classList.toggle('hidden', fields.dataset.fields !== type));
  container.querySelectorAll('[data-cycle-type]').forEach((button) => {
    const active = button.dataset.cycleType === type;
    button.className = active
      ? 'rounded-lg bg-brand px-3 py-2.5 text-sm font-black text-slate-950'
      : 'rounded-lg px-3 py-2.5 text-sm font-bold text-muted';
  });
}

function renderCycleCard(cycle) {
  const detail = cycle.type === 'PROGRESSIVE'
    ? `Desde ${formatNumber(cycle.startPercentage, 1)}% · +${formatNumber(cycle.incrementKg, 2)} kg/entreno`
    : `${METHOD_RULES.fixedBlockWeightCount} pesos · ${METHOD_RULES.fixedBlockSessionsPerWeight} entrenos/peso`;

  return `
    <article class="card space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="truncate text-lg font-black">${escapeHtml(cycle.name)}</h3>
          <p class="mt-1 text-sm text-muted">${detail}</p>
          <p class="mt-1 text-xs text-muted">Inicio ${formatDate(cycle.startedAt)}${cycle.endedAt ? ` · Fin ${formatDate(cycle.endedAt)}` : ''}</p>
        </div>
        ${statusPill(cycle.status)}
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="metric"><p class="metric-label">Reps totales</p><p class="metric-value">${cycle.totalReps}</p></div>
        <div class="metric"><p class="metric-label">Volumen total</p><p class="metric-value">${formatNumber(cycle.totalVolumeKg)} kg</p></div>
      </div>
    </article>`;
}
