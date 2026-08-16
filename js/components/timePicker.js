import Icon from './icon.js';

let globalDismissBound = false;

function parts(value = '23:59') {
  const [hours = 23, minute = 59] = String(value).split(':').map(Number);
  return { hour: hours % 12 || 12, minute, period: hours >= 12 ? 'PM' : 'AM' };
}

function labelFor(value) {
  const { hour, minute, period } = parts(value);
  return `${hour}:${String(minute).padStart(2, '0')} ${period}`;
}

export default function enhanceTimePickers(root = document) {
  root.querySelectorAll('input[type="time"]:not([data-time-enhanced])').forEach((input) => {
    input.dataset.timeEnhanced = 'true';
    const shell = document.createElement('div');
    shell.className = 'atlas-time';
    shell.innerHTML = `<button class="atlas-time-trigger" type="button" aria-expanded="false"><span>${labelFor(input.value)}</span>${Icon('calendar')}</button><div class="atlas-time-panel" hidden><label>Hour<input data-time-hour inputmode="numeric" maxlength="2"></label><span>:</span><label>Minute<input data-time-minute inputmode="numeric" maxlength="2"></label><label>AM / PM<select data-time-period><option>AM</option><option>PM</option></select></label><button class="atlas-time-done" type="button">Done</button></div>`;
    input.after(shell);
    const panel = shell.querySelector('.atlas-time-panel');
    const trigger = shell.querySelector('.atlas-time-trigger');
    const hour = shell.querySelector('[data-time-hour]');
    const minute = shell.querySelector('[data-time-minute]');
    const period = shell.querySelector('[data-time-period]');
    let panelTransitioning = false;
    const readNative = () => {
      const value = parts(input.value);
      hour.value = String(value.hour).padStart(2, '0');
      minute.value = String(value.minute).padStart(2, '0');
      period.value = value.period;
      trigger.querySelector('span').textContent = labelFor(input.value);
    };
    const commit = () => {
      const normalizedHour = Math.min(12, Math.max(1, Number(hour.value) || 12));
      const normalizedMinute = Math.min(59, Math.max(0, Number(minute.value) || 0));
      const hours24 = normalizedHour % 12 + (period.value === 'PM' ? 12 : 0);
      hour.value = String(normalizedHour).padStart(2, '0');
      minute.value = String(normalizedMinute).padStart(2, '0');
      input.value = `${String(hours24).padStart(2, '0')}:${String(normalizedMinute).padStart(2, '0')}`;
      trigger.querySelector('span').textContent = labelFor(input.value);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const step = (field, delta) => {
      if (field === hour) field.value = String(((Number(field.value) - 1 + delta + 12) % 12) + 1).padStart(2, '0');
      else field.value = String((Number(field.value) + delta + 60) % 60).padStart(2, '0');
      commit();
    };
    [hour, minute].forEach((field) => {
      field.addEventListener('input', () => { field.value = field.value.replace(/\D/g, '').slice(0, 2); });
      field.addEventListener('change', commit);
      field.addEventListener('wheel', (event) => { event.preventDefault(); step(field, event.deltaY < 0 ? 1 : -1); }, { passive: false });
      field.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); step(field, event.key === 'ArrowUp' ? 1 : -1); }
      });
    });
    period.addEventListener('change', commit);
    period.addEventListener('wheel', (event) => { event.preventDefault(); period.value = period.value === 'AM' ? 'PM' : 'AM'; commit(); }, { passive: false });
    const setPanelOpen = async (open, { restoreFocus = false } = {}) => {
      if (panelTransitioning || open === !panel.hidden) return;
      panelTransitioning = true;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (open) panel.hidden = false;
      trigger.setAttribute('aria-expanded', String(open));
      if (!reduceMotion && typeof panel.animate === 'function') {
        const frames = open
          ? [{ opacity: 0, transform: 'translateY(-6px) scale(.98)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }]
          : [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(-6px) scale(.98)' }];
        const animation = panel.animate(frames, { duration: open ? 180 : 150, easing: open ? 'cubic-bezier(.22,1,.36,1)' : 'ease-in', fill: 'both' });
        await animation.finished.catch(() => {});
        animation.cancel();
      }
      if (!open) panel.hidden = true;
      else hour.focus();
      if (!open && restoreFocus) trigger.focus();
      panelTransitioning = false;
    };
    trigger.addEventListener('click', () => {
      if (panel.hidden) document.dispatchEvent(new CustomEvent('atlas:close-time-pickers', { detail: { except: shell } }));
      setPanelOpen(panel.hidden);
    });
    shell.querySelector('.atlas-time-done').addEventListener('click', () => { commit(); setPanelOpen(false, { restoreFocus: true }); });
    shell.addEventListener('atlas:close-time-picker', (event) => {
      if (!panel.hidden) setPanelOpen(false, { restoreFocus: Boolean(event.detail?.restoreFocus) });
    });
    readNative();
  });

  if (globalDismissBound) return;
  globalDismissBound = true;
  document.addEventListener('atlas:close-time-pickers', (event) => {
    document.querySelectorAll('.atlas-time').forEach((shell) => {
      if (shell !== event.detail?.except) shell.dispatchEvent(new CustomEvent('atlas:close-time-picker'));
    });
  });
  document.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.atlas-time')) return;
    document.dispatchEvent(new CustomEvent('atlas:close-time-pickers'));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const openShell = document.querySelector('.atlas-time:has(.atlas-time-panel:not([hidden]))');
    if (!openShell) return;
    event.preventDefault();
    openShell.dispatchEvent(new CustomEvent('atlas:close-time-picker', { detail: { restoreFocus: true } }));
  });
}
