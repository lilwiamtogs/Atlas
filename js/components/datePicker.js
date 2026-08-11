const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calendarMarkup() {
  return `
    <div class="atlas-calendar-screen" data-atlas-calendar hidden>
      <section class="atlas-calendar" role="dialog" aria-modal="true" aria-labelledby="atlas-calendar-title">
        <header class="atlas-calendar-header">
          <div><p class="eyebrow">Choose date</p><h2 id="atlas-calendar-title"></h2></div>
          <button class="atlas-calendar-close" type="button" aria-label="Close calendar">×</button>
        </header>
        <div class="atlas-calendar-nav">
          <button type="button" data-calendar-previous aria-label="Previous month">←</button>
          <button type="button" data-calendar-today>Today</button>
          <button type="button" data-calendar-next aria-label="Next month">→</button>
        </div>
        <div class="atlas-calendar-weekdays" aria-hidden="true">
          ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => `<span>${day}</span>`).join('')}
        </div>
        <div class="atlas-calendar-grid"></div>
      </section>
    </div>`;
}

export default function enhanceDatePickers(root = document) {
  const inputs = [...root.querySelectorAll('input[type="date"]')];
  if (!inputs.length) return;

  let screen = root.querySelector('[data-atlas-calendar]');
  if (!screen) {
    root.insertAdjacentHTML('beforeend', calendarMarkup());
    screen = root.querySelector('[data-atlas-calendar]');
  }

  const title = screen.querySelector('#atlas-calendar-title');
  const grid = screen.querySelector('.atlas-calendar-grid');
  let activeInput = null;
  let activeTrigger = null;
  let viewDate = new Date();

  const close = () => {
    screen.classList.remove('is-visible');
    window.setTimeout(() => { screen.hidden = true; }, 180);
    activeTrigger?.focus();
  };

  const renderMonth = () => {
    title.textContent = MONTH_FORMAT.format(viewDate);
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const selected = activeInput?.value;
    const minimum = activeInput?.dataset.minimum || '';
    const today = dateKey(new Date());
    grid.innerHTML = `${'<span class="atlas-calendar-blank"></span>'.repeat(firstDay)}${Array.from({ length: days }, (_, index) => {
      const value = dateKey(new Date(year, month, index + 1));
      return `<button type="button" data-calendar-date="${value}" ${minimum && value < minimum ? 'disabled' : ''} class="${value === selected ? 'is-selected' : ''} ${value === today ? 'is-today' : ''}" aria-label="${DATE_FORMAT.format(parseDate(value))}" aria-pressed="${value === selected}">${index + 1}</button>`;
    }).join('')}`;
  };

  const open = (input, trigger) => {
    activeInput = input;
    activeTrigger = trigger;
    const selected = parseDate(input.value);
    viewDate = selected || new Date();
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    renderMonth();
    screen.hidden = false;
    requestAnimationFrame(() => {
      screen.classList.add('is-visible');
      screen.querySelector('.is-selected:not(:disabled), [data-calendar-date]:not(:disabled)')?.focus();
    });
  };

  inputs.forEach((input) => {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'atlas-date-trigger';
    trigger.textContent = parseDate(input.value) ? DATE_FORMAT.format(parseDate(input.value)) : 'Choose a date';
    input.dataset.minimum = input.min || '';
    input.type = 'hidden';
    input.insertAdjacentElement('afterend', trigger);
    trigger.addEventListener('click', () => open(input, trigger));
  });

  screen.querySelector('[data-calendar-previous]').onclick = () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    renderMonth();
  };
  screen.querySelector('[data-calendar-next]').onclick = () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    renderMonth();
  };
  screen.querySelector('[data-calendar-today]').onclick = () => {
    viewDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    renderMonth();
  };
  screen.querySelector('.atlas-calendar-close').onclick = close;
  screen.onclick = (event) => {
    if (event.target === screen) close();
    const button = event.target.closest('[data-calendar-date]');
    if (!button || button.disabled || !activeInput) return;
    activeInput.value = button.dataset.calendarDate;
    activeInput.dispatchEvent(new Event('change', { bubbles: true }));
    activeTrigger.textContent = DATE_FORMAT.format(parseDate(activeInput.value));
    close();
  };
}
