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
          <input class="field min-w-0 flex-1" name="name" autocomplete="off" aria-label="Nuevo ejercicio" required />
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

          <label class="block"><span class="label">Nombre</span><input class="field" name="name" required /></label>
          <p class="text-sm text-muted">1RM estimado con Epley.</p>

          <div class="space-y-4" data-fields="PROGRESSIVE">
            <label class="block"><span class="label">1RM de referencia (kg)</span><input class="field" name="oneRm" inputmode="decimal" value="${snapshot.previousOneRmKg ? escapeHtml(String(Number(snapshot.previousOneRmKg.toFixed(2)))) : ''}" /></label>
            <div class="grid grid-cols-2 gap-3">
              <label class="block"><span class="label">Porcentaje inicial</span><input class="field" name="percentage" inputmode="decimal" value="50" /></label>
              <label class="block"><span class="label">Incremento (kg)</span><input class="field" name="increment" inputmode="decimal" value="2.5" /></label>
            </div>
            <p class="text-sm leading-6 text-muted">Se añade el incremento en cada entrenamiento. El ciclo termina automáticamente al hacer ${METHOD_RULES.progressiveEndReps} repeticiones o menos.</p>
          </div>

          <div class="hidden space-y-4" data-fields="FIXED_BLOCKS">
            <div class="grid grid-cols-3 gap-2">
              <label><span class="label">Peso 1</span><input class="field" name="weight1" inputmode="decimal" /></label>
              <label><span class="label">Peso 2</span><input class="field" name="weight2" inputmode="decimal" /></label>
              <label><span class="label">Peso 3</span><input class="field" name="weight3" inputmode="decimal" /></label>
            </div>
            <p class="text-sm leading-6 text-muted">${METHOD_RULES.fixedBlockSessionsPerWeight} entrenamientos seguidos con cada peso: primero peso 1, después peso 2 y finalmente peso 3.</p>
          </div>

          <button class="btn-primary w-full" type="submit" ${activeCycle ? 'disabled' : ''}>Crear ciclo</button>
        </form>
      </article>` : ''}

      <div class="space-y-3">
        <h2 class="px-1 text-lg font-black">Historial</h2>
        ${snapshot.cycles.length ? snapshot.cycles.map((cycle) => renderCycleCard(cycle, state.expandedCycleId)).join('') : '<div class="card text-sm text-muted">Aún no hay ciclos para este ejercicio.</div>'}
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

  container.querySelectorAll('[data-open-cycle]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('[data-cycle-card]');
      const panel = card.querySelector('[data-session-panel]');
      const expanded = panel.hidden;
      panel.hidden = !expanded;
      state.expandedCycleId = expanded ? Number(button.dataset.openCycle) : null;
      card.querySelectorAll('[data-open-cycle]').forEach((toggle) => toggle.setAttribute('aria-expanded', String(expanded)));
      card.querySelector('[data-edit-label]').textContent = expanded ? 'Ocultar' : 'Editar';
    });
  });
  let saveQueue = Promise.resolve();
  container.querySelectorAll('[data-session-row] input').forEach((input) => {
    input.addEventListener('change', () => {
      const row = input.closest('[data-session-row]');
      const weightKg = parseDecimal(row.querySelector('[name="weight"]').value);
      const reps = parseDecimal(row.querySelector('[name="reps"]').value);
      saveQueue = saveQueue.then(async () => {
        try {
          const result = await service.updateSession({
            cycleId: Number(row.dataset.cycleId), sessionId: Number(row.dataset.sessionRow), weightKg, reps,
          });
          row.querySelector('[data-session-rm]').textContent = formatNumber(result.session.estimatedOneRmKg, 2);
          const card = row.closest('[data-cycle-card]');
          card.querySelector('[data-total-reps]').textContent = result.cycle.totalReps;
          card.querySelector('[data-total-volume]').textContent = formatNumber(result.cycle.totalVolumeKg) + ' kg';
          card.querySelector('[data-cycle-status]').innerHTML = statusPill(result.cycle.status);
          card.querySelector('[data-best-rm]').textContent = formatNumber(result.bestEstimatedOneRmKg, 2) + ' kg';
          toast('Sesión actualizada.', 'success');
        } catch (error) {
          toast(error.message ?? String(error), 'error');
        }
      });
    });
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
          formula: 'EPLEY',
          oneRmKg: parseDecimal(cycleForm.elements.oneRm.value),
          startPercentage: parseDecimal(cycleForm.elements.percentage.value),
          incrementKg: parseDecimal(cycleForm.elements.increment.value),
        });
      } else {
        await service.createFixedCycle({
          exerciseId: state.exerciseId,
          name: cycleForm.elements.name.value,
          formula: 'EPLEY',
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

function renderCycleCard(cycle, expandedCycleId) {
  const detail = cycle.type === 'PROGRESSIVE'
    ? `Desde ${formatNumber(cycle.startPercentage, 1)}% · +${formatNumber(cycle.incrementKg, 2)} kg/entreno`
    : `${METHOD_RULES.fixedBlockWeightCount} pesos · ${METHOD_RULES.fixedBlockSessionsPerWeight} entrenos/peso`;

  return `
    <article class="card space-y-4" data-cycle-card="${cycle.id}">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="text-lg font-black"><button class="text-left" type="button" data-open-cycle="${cycle.id}" aria-expanded="${expandedCycleId === cycle.id}">${escapeHtml(cycle.name)}</button></h3>
          <p class="mt-1 text-sm text-muted">${detail}</p>
          ${cycle.startOneRmKg ? `<p class="mt-1 text-sm text-muted">1RM de referencia: ${formatNumber(cycle.startOneRmKg, 2)} kg</p>` : ''}
          <p class="mt-1 text-sm text-muted">Mejor 1RM estimado (Epley): <span data-best-rm>${cycle.bestEstimatedOneRmKg ? `${formatNumber(cycle.bestEstimatedOneRmKg, 2)} kg` : 'Sin sesiones'}</span></p>
          <p class="mt-1 text-xs text-muted">Inicio ${formatDate(cycle.startedAt)}${cycle.endedAt ? ` · Fin ${formatDate(cycle.endedAt)}` : ''}</p>
        </div>
        <span data-cycle-status>${statusPill(cycle.status)}</span>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="metric"><p class="metric-label">Reps totales</p><p class="metric-value" data-total-reps>${cycle.totalReps}</p></div>
        <div class="metric"><p class="metric-label">Volumen total</p><p class="metric-value" data-total-volume>${formatNumber(cycle.totalVolumeKg)} kg</p></div>
      </div>
      <button class="btn-secondary w-full" type="button" data-open-cycle="${cycle.id}" aria-expanded="${expandedCycleId === cycle.id}"><span data-edit-label>${expandedCycleId === cycle.id ? 'Ocultar' : 'Editar'}</span></button>
      <div data-session-panel ${expandedCycleId === cycle.id ? '' : 'hidden'}>${renderSessionTable(cycle)}</div>
    </article>`;
}

function renderSessionTable(cycle) {
  if (!cycle.sessions.length) return '<p class="text-sm text-muted">Aún no hay sesiones en este ciclo.</p>';
  return `<div class="overflow-x-auto"><table class="w-full text-sm">
    <thead><tr><th class="p-2 text-left">Fecha</th><th class="p-2 text-left">Peso (kg)</th><th class="p-2 text-left">Reps</th><th class="p-2 text-left">1RM (kg)</th></tr></thead>
    <tbody>${cycle.sessions.map((session) => `<tr data-session-row="${session.id}" data-cycle-id="${cycle.id}">
      <td class="p-2">${formatDate(session.performedAt)}</td>
      <td class="p-2"><input class="field min-w-20" name="weight" inputmode="decimal" value="${session.weightKg}" aria-label="Peso de la sesión" required /></td>
      <td class="p-2"><input class="field min-w-20" name="reps" type="number" min="1" step="1" value="${session.reps}" aria-label="Repeticiones de la sesión" required /></td>
      <td class="p-2" data-session-rm>${formatNumber(session.estimatedOneRmKg, 2)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}
