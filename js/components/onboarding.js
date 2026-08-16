const TUTORIAL_KEY = 'atlas.tutorialComplete.v2';
const INSTALL_KEY = 'atlas.installKnown';

export function isInstalledApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

const DIALOG_FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function containDialogFocus(container, { onEscape } = {}) {
  container.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && onEscape) {
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...container.querySelectorAll(DIALOG_FOCUSABLE)].filter((item) => item.getClientRects().length);
    const first = items[0];
    const last = items.at(-1);
    if (!items.length) event.preventDefault();
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}

export function isMobileWeb() {
  const compact = window.matchMedia('(max-width: 619px)').matches;
  const touchFirst = window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return compact && touchFirst && !isInstalledApp();
}

export function markInstallKnown() {
  localStorage.setItem(INSTALL_KEY, 'true');
}

export function showInstallGate(canPrompt = false) {
  if (!isMobileWeb()) return null;
  const existingGate = document.getElementById('mobile-install-gate');
  if (existingGate) {
    existingGate.classList.add('is-closing');
    window.setTimeout(() => {
      existingGate.remove();
      showInstallGate(canPrompt);
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280);
    return existingGate;
  }
  if (canPrompt) localStorage.removeItem(INSTALL_KEY);
  const installKnown = localStorage.getItem(INSTALL_KEY) === 'true';
  const appleDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const gate = document.createElement('div');
  gate.className = 'install-gate';
  gate.id = 'mobile-install-gate';
  gate.innerHTML = `
    <section class="atlas-card install-gate-card" role="dialog" aria-modal="true" aria-labelledby="install-gate-title" tabindex="-1">
      <img src="assets/icons/atlas-192.png" alt="" aria-hidden="true">
      <p class="eyebrow">Atlas for mobile</p>
      <h1 id="install-gate-title">${installKnown ? 'Atlas is installed.' : 'Install Atlas to continue'}</h1>
      <p>${installKnown ? 'The installation is complete. This browser tab is not the installed app.' : 'Atlas works offline and feels at home on your phone once it is installed.'}</p>
      ${!installKnown && !appleDevice ? `<button class="primary-action" id="install-gate-button" type="button" ${canPrompt ? '' : 'disabled'}>${canPrompt ? 'Install Atlas' : 'Preparing installer…'}</button>` : ''}
      <div class="manual-install-steps ${installKnown ? 'is-installed' : ''}">
        <strong>${installKnown ? 'Open the installed Atlas' : appleDevice ? 'On iPhone or iPad' : 'Install from your browser'}</strong>
        <span>${installKnown ? 'Return to your home screen and open Atlas from its app icon.' : appleDevice ? 'Tap Share, then choose “Add to Home Screen.”' : 'Open the browser menu and choose “Install app” or “Add to Home screen.”'}</span>
      </div>
      ${installKnown ? '<button class="text-button reinstall-atlas" id="reinstall-atlas" type="button">I uninstalled Atlas</button>' : ''}
      <p class="install-gate-hint">${installKnown ? 'You can safely close this browser tab.' : 'Already installed? Open Atlas from your home screen.'}</p>
    </section>`;
  document.body.append(gate);
  containDialogFocus(gate);
  requestAnimationFrame(() => gate.querySelector('button:not([disabled]), [role="dialog"]')?.focus({ preventScroll: true }));
  gate.querySelector('#reinstall-atlas')?.addEventListener('click', () => {
    localStorage.removeItem(INSTALL_KEY);
    showInstallGate(canPrompt);
  });
  return gate;
}

const tutorialSteps = [
  { eyebrow: 'Welcome to Atlas', title: 'Your semester, without the clutter.', body: 'Classes, personal plans, tasks, notes, and exams stay together in one calm workspace.', points: [['NOW', 'See what matters today'], ['WEEK', 'Plan classes and personal days'], ['OFFLINE', 'Keep working without a connection']], next: 'Show me around' },
  { eyebrow: '1 · Find your way', title: 'Three views. One routine.', body: 'Now is your daily dashboard. Week holds the full schedule and planning tools. Import is where schedules and saved semesters live.', points: [['NOW', 'Current class, urgent work, and tests'], ['WEEK', 'Classes, personal plans, tasks, and notes'], ['IMPORT', 'Scan, verify, save, and restore schedules']] },
  { eyebrow: '2 · Build your week', title: 'Keep school and life separate.', body: 'Switch the Week page between Classes and Personal. Add work to a class, or choose a personal day and week without mixing the two.', points: [['CLASS', 'Assignments tied to a subject'], ['PERSONAL', 'Plans tied to a day'], ['DETAILS', 'Open a class for its complete workspace']] },
  { eyebrow: '3 · Keep the useful stuff', title: 'Tasks and notes live where you need them.', body: 'Attach TXT or PDF notes, read and search them inside Atlas, set due dates and times, and remove anything you no longer need.', points: [['TASKS', 'Due dates, descriptions, and completion'], ['NOTES', 'Built-in TXT and PDF reader'], ['TESTS', 'Upcoming exams on your Now page']] },
  { eyebrow: '4 · Yours by default', title: 'Local first. Cloud when you want it.', body: 'Atlas saves your planner on this device and works offline after setup. An account is optional and only adds multi-device sync.', points: [['LOCAL', 'No account required'], ['SYNC', 'Optional conflict-safe cloud backup'], ['STYLE', 'Light, dark, and custom colors']] },
  { eyebrow: 'You’re ready', title: 'Where would you like to start?', body: 'Import your real schedule now, look around first, or connect an account. You can revisit this tour from Help at any time.', points: [], final: true },
];

export function showFirstOpenTutorial({ force = false } = {}) {
  if (!force && localStorage.getItem(TUTORIAL_KEY) === 'true') return;
  if (!force && document.getElementById('mobile-install-gate')) return;
  document.getElementById('atlas-tutorial')?.remove();
  let index = 0;
  let transitioning = false;
  const screen = document.createElement('div');
  screen.className = 'tutorial-screen';
  screen.id = 'atlas-tutorial';

  const finishTutorial = ({ openAccount = false, route = '' } = {}) => {
    localStorage.setItem(TUTORIAL_KEY, 'true');
    screen.classList.add('is-leaving');
    window.setTimeout(() => {
      screen.remove();
      if (openAccount) document.querySelector('[data-open-profile]')?.click();
      else if (route) window.location.hash = `#/${route}`;
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320);
  };

  const render = async (direction = 0) => {
    if (transitioning) return;
    transitioning = true;
    const previous = screen.querySelector('.tutorial-card');
    if (previous && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await previous.animate([{ opacity: 1, transform: 'translateX(0) scale(1)' }, { opacity: 0, transform: `translateX(${direction < 0 ? '18px' : '-18px'}) scale(0.985)` }], { duration: 160, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
    }
    const step = tutorialSteps[index];
    screen.dataset.direction = direction < 0 ? 'back' : 'forward';
    screen.innerHTML = `
      <section class="atlas-card tutorial-card" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <div class="tutorial-progress" aria-label="Tutorial step ${index + 1} of ${tutorialSteps.length}">${tutorialSteps.map((_, stepIndex) => `<span class="${stepIndex <= index ? 'is-active' : ''}"></span>`).join('')}</div>
        <div class="tutorial-topline"><p class="eyebrow">${step.eyebrow}</p><button class="tutorial-skip" id="tutorial-skip" type="button">Skip tour</button></div>
        <h1 id="tutorial-title">${step.title}</h1>
        <p>${step.body}</p>
        ${step.points.length ? `<div class="tutorial-feature-list">${step.points.map(([label, copy]) => `<div><span>${label}</span><strong>${copy}</strong></div>`).join('')}</div>` : ''}
        <div class="tutorial-actions">
          ${index ? '<button class="secondary-action" id="tutorial-back" type="button">Back</button>' : '<span></span>'}
          ${step.final ? '<div class="tutorial-start-actions"><button class="secondary-action" id="tutorial-explore" type="button">Explore Atlas</button><button class="secondary-action" id="tutorial-create-account" type="button">Set up sync</button><button class="primary-action" id="tutorial-import" type="button">Import schedule</button></div>' : `<button class="primary-action" id="tutorial-next" type="button">${step.next || 'Continue'}</button>`}
        </div>
      </section>`;
    transitioning = false;
    screen.querySelector('#tutorial-back')?.addEventListener('click', () => { index -= 1; render(-1); });
    screen.querySelector('#tutorial-next')?.addEventListener('click', () => { index += 1; render(1); });
    screen.querySelector('#tutorial-skip')?.addEventListener('click', () => finishTutorial());
    screen.querySelector('#tutorial-create-account')?.addEventListener('click', () => finishTutorial({ openAccount: true }));
    screen.querySelector('#tutorial-import')?.addEventListener('click', () => finishTutorial({ route: 'import' }));
    screen.querySelector('#tutorial-explore')?.addEventListener('click', () => finishTutorial({ route: 'home' }));
    requestAnimationFrame(() => screen.querySelector('#tutorial-skip, [role="dialog"]')?.focus({ preventScroll: true }));
  };

  render();
  document.body.append(screen);
  containDialogFocus(screen, { onEscape: () => finishTutorial() });
}
