import Store from '../store.js';
import { escapeHtml } from '../utils/html.js';
import { getClassState, getNow, toDateTimeLocal } from '../utils/time.js';

let unlocked = false;
let tapCount = 0;
let tapTimer;

function diagnosticValue(item) {
  return item ? `${item.code} · ${item.title}` : 'None';
}

const DeveloperTools = {
  render(state, now, route) {
    if (!unlocked) return '';
    const { current, next } = getClassState(state.schedule.classes, now);

    return `
      <aside class="developer-panel" aria-label="Developer mode">
        <div class="developer-heading">
          <div>
            <p class="eyebrow">Developer mode</p>
            <h2>Time controls</h2>
          </div>
          <button class="icon-button" id="close-dev" type="button" aria-label="Hide developer mode">×</button>
        </div>
        <label class="field-label" for="time-override">Simulated date and time</label>
        <input id="time-override" type="datetime-local" value="${escapeHtml(toDateTimeLocal(now))}">
        <div class="developer-actions">
          <button class="text-button" id="apply-time" type="button">Apply override</button>
          <button class="text-button secondary" id="use-live-time" type="button">Use live time</button>
        </div>
        <dl class="diagnostics">
          <div><dt>Route</dt><dd>${escapeHtml(route)}</dd></div>
          <div><dt>Current</dt><dd>${escapeHtml(diagnosticValue(current))}</dd></div>
          <div><dt>Next</dt><dd>${escapeHtml(diagnosticValue(next))}</dd></div>
          <div><dt>Source</dt><dd>${escapeHtml(state.scheduleSource)}</dd></div>
        </dl>
        <button class="reset-button" id="reset-test-data" type="button">Reset Atlas test data</button>
      </aside>`;
  },

  bind(router) {
    const brand = document.getElementById('atlas-brand');
    brand?.addEventListener('click', () => {
      clearTimeout(tapTimer);
      tapCount += 1;
      tapTimer = setTimeout(() => { tapCount = 0; }, 2500);
      if (tapCount >= 7) {
        tapCount = 0;
        unlocked = true;
        router.render();
      }
    });

    document.getElementById('close-dev')?.addEventListener('click', () => {
      unlocked = false;
      router.render();
    });

    document.getElementById('apply-time')?.addEventListener('click', () => {
      const input = document.getElementById('time-override');
      if (!input.value) return;
      const value = new Date(input.value).toISOString();
      localStorage.setItem('atlas.timeOverride', value);
      Store.set({ timeOverride: value });
    });

    document.getElementById('use-live-time')?.addEventListener('click', () => {
      localStorage.removeItem('atlas.timeOverride');
      Store.set({ timeOverride: '' });
    });

    document.getElementById('reset-test-data')?.addEventListener('click', () => {
      if (!window.confirm('Reset Atlas test data and return to live time?')) return;
      Object.keys(localStorage)
        .filter((key) => key.startsWith('atlas.'))
        .forEach((key) => localStorage.removeItem(key));
      window.location.reload();
    });
  },
};

export default DeveloperTools;
