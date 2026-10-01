import { renderCyclesScreen } from './screens/cycles-screen.js';
import { renderDataScreen } from './screens/data-screen.js';
import { renderProgressScreen } from './screens/progress-screen.js';
import { renderRecordsScreen } from './screens/records-screen.js';
import { renderTrainScreen } from './screens/train-screen.js';

const SCREENS = Object.freeze({
  train: renderTrainScreen,
  progress: renderProgressScreen,
  records: renderRecordsScreen,
  cycles: renderCyclesScreen,
  data: renderDataScreen,
});

const NAV_ITEMS = [
  ['train', 'Entrenar', iconDumbbell()],
  ['progress', 'Progreso', iconChart()],
  ['records', 'Récords', iconTrophy()],
  ['cycles', 'Ciclos', iconRepeat()],
  ['data', 'Datos', iconDatabase()],
];

export class AppController {
  constructor({ root, service, installService }) {
    this.root = root;
    this.service = service;
    this.installService = installService;
    this.renderVersion = 0;
    this.state = {
      tab: restoreTab(),
      exerciseId: restoreExerciseId(),
    };
  }

  async start() {
    this.#renderShell();
    this.installService.addEventListener('change', () => {
      if (this.state.tab === 'data') this.renderCurrent();
    });
    await this.renderCurrent();
  }

  async renderCurrent() {
    const version = ++this.renderVersion;
    const screen = this.root.querySelector('#screen');
    const renderScreen = SCREENS[this.state.tab] ?? SCREENS.train;

    this.#syncNavigation();
    screen.innerHTML = loadingTemplate();

    try {
      await renderScreen(screen, {
        service: this.service,
        installService: this.installService,
        state: this.state,
        rerender: () => this.renderCurrent(),
        toast: (message, type) => this.toast(message, type),
      });

      if (version !== this.renderVersion) return;
      persistState(this.state);
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (error) {
      if (version !== this.renderVersion) return;
      screen.innerHTML = errorTemplate(error.message ?? String(error));
    }
  }

  toast(message, type = 'info') {
    const host = this.root.querySelector('#toast-host');
    const toast = document.createElement('div');
    const palette = type === 'error'
      ? 'border-rose-400/40 bg-rose-950 text-rose-100'
      : type === 'success'
        ? 'border-brand/40 bg-emerald-950 text-emerald-100'
        : 'border-info/40 bg-slate-800 text-slate-100';

    toast.className = `pointer-events-auto rounded-xl border px-4 py-3 text-sm font-bold shadow-lift ${palette}`;
    toast.textContent = message;
    host.append(toast);

    setTimeout(() => {
      toast.classList.add('opacity-0', 'transition-opacity');
      setTimeout(() => toast.remove(), 220);
    }, 3200);
  }

  #renderShell() {
    this.root.innerHTML = `
      <div class="app-shell bg-ink">
        <main id="screen" aria-live="polite"></main>
        <div id="toast-host" class="pointer-events-none fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md flex-col gap-2" aria-live="assertive"></div>
        <nav class="bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel/95 backdrop-blur" aria-label="Navegación principal">
          <div class="mx-auto grid max-w-2xl grid-cols-5 px-1 pt-1">
            ${NAV_ITEMS.map(([key, label, icon]) => `
              <button class="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-bold text-muted" data-nav="${key}" type="button">
                ${icon}
                <span>${label}</span>
              </button>`).join('')}
          </div>
        </nav>
      </div>`;

    this.root.querySelectorAll('[data-nav]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.nav;
        if (tab === this.state.tab) return;
        this.state.tab = tab;
        this.renderCurrent();
      });
    });
  }

  #syncNavigation() {
    this.root.querySelectorAll('[data-nav]').forEach((button) => {
      const active = button.dataset.nav === this.state.tab;
      button.classList.toggle('text-brand', active);
      button.classList.toggle('bg-brand/10', active);
      button.classList.toggle('text-muted', !active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }
}

function loadingTemplate() {
  return `
    <div class="flex min-h-[70dvh] items-center justify-center">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-brand" aria-label="Cargando"></div>
    </div>`;
}

function errorTemplate(message) {
  const node = document.createElement('div');
  node.textContent = message;
  return `
    <section class="screen">
      <div class="card border-rose-400/30">
        <h1 class="text-xl font-black text-rose-200">No se pudo abrir Bilbo Tracker</h1>
        <p class="mt-2 text-sm leading-6 text-rose-100/80">${node.innerHTML}</p>
      </div>
    </section>`;
}

function restoreTab() {
  const tab = localStorage.getItem('bilbo:tab');
  return Object.hasOwn(SCREENS, tab) ? tab : 'train';
}

function restoreExerciseId() {
  const value = Number(localStorage.getItem('bilbo:exerciseId'));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function persistState(state) {
  localStorage.setItem('bilbo:tab', state.tab);
  if (state.exerciseId) localStorage.setItem('bilbo:exerciseId', String(state.exerciseId));
}

function svg(path) {
  return `<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

function iconDumbbell() {
  return svg('<path d="M6 5v14M18 5v14M3 8v8M21 8v8M6 12h12"/>');
}
function iconChart() {
  return svg('<path d="M4 19V5M4 19h16M7 15l4-4 3 2 5-7"/>');
}
function iconTrophy() {
  return svg('<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5v1a4 4 0 0 0 4 4M16 6h3v1a4 4 0 0 1-4 4M12 12v4M9 20h6M10 16h4"/>');
}
function iconRepeat() {
  return svg('<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>');
}
function iconDatabase() {
  return svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>');
}
