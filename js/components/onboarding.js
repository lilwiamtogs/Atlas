const TUTORIAL_KEY = 'atlas.tutorialComplete.v2';
const INSTALL_KEY = 'atlas.installKnown';

export function isInstalledApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
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
  document.getElementById('mobile-install-gate')?.remove();
  const installKnown = localStorage.getItem(INSTALL_KEY) === 'true';
  const appleDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const gate = document.createElement('div');
  gate.className = 'install-gate';
  gate.id = 'mobile-install-gate';
  gate.innerHTML = `
    <section class="install-gate-card" role="dialog" aria-modal="true" aria-labelledby="install-gate-title">
      <img src="assets/icons/atlas-192.png" alt="" aria-hidden="true">
      <p class="eyebrow">Atlas for mobile</p>
      <h1 id="install-gate-title">${installKnown ? 'Atlas is installed.' : 'Install Atlas to continue'}</h1>
      <p>${installKnown ? 'The installation is complete. This browser tab is not the installed app.' : 'Atlas works offline and feels at home on your phone once it is installed.'}</p>
      ${!installKnown && !appleDevice ? `<button class="primary-action" id="install-gate-button" type="button" ${canPrompt ? '' : 'disabled'}>${canPrompt ? 'Install Atlas' : 'Preparing installer…'}</button>` : ''}
      <div class="manual-install-steps ${installKnown ? 'is-installed' : ''}">
        <strong>${installKnown ? 'Open the installed Atlas' : appleDevice ? 'On iPhone or iPad' : 'Install from your browser'}</strong>
        <span>${installKnown ? 'Return to your home screen and open Atlas from its app icon.' : appleDevice ? 'Tap Share, then choose “Add to Home Screen.”' : 'Open the browser menu and choose “Install app” or “Add to Home screen.”'}</span>
      </div>
      <p class="install-gate-hint">${installKnown ? 'You can safely close this browser tab.' : 'Already installed? Open Atlas from your home screen.'}</p>
    </section>`;
  document.body.append(gate);
  return gate;
}

const tutorialSteps = [
  { eyebrow: 'Welcome', title: 'Atlas keeps your semester in one place.', body: 'Your weekly classes, assignments, notes, and exams stay together and are saved on this device.' },
  { eyebrow: 'Step 1 · Import', title: 'Start with your schedule.', body: 'Open Import and choose a PNG or JPG screenshot of the full schedule. Atlas can read many college table and timetable layouts.' },
  { eyebrow: 'Step 2 · Verify', title: 'Check every class before saving.', body: 'Atlas presents detected classes for review. Correct any OCR mistakes, then add your course, year level, and semester.' },
  { eyebrow: 'Step 3 · Plan', title: 'Build out each class.', body: 'Use Week to add assignments and notes. Expand a class card for details, or open its class page to edit it and manage files.' },
  { eyebrow: 'Step 4 · Stay ready', title: 'Use the helpers you want.', body: 'Tests live on Now. Reminders, appearance, and optional schedule autosave live in Settings. The ? button can guide you back to any feature.' },
];

export function showFirstOpenTutorial({ force = false } = {}) {
  if (!force && localStorage.getItem(TUTORIAL_KEY) === 'true') return;
  if (!force && document.getElementById('mobile-install-gate')) return;
  document.getElementById('atlas-tutorial')?.remove();
  let index = 0;
  const screen = document.createElement('div');
  screen.className = 'tutorial-screen';
  screen.id = 'atlas-tutorial';

  const render = () => {
    const step = tutorialSteps[index];
    screen.innerHTML = `
      <section class="tutorial-card" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <div class="tutorial-progress" aria-label="Tutorial step ${index + 1} of ${tutorialSteps.length}">
          ${tutorialSteps.map((_, stepIndex) => `<span class="${stepIndex <= index ? 'is-active' : ''}"></span>`).join('')}
        </div>
        <p class="eyebrow">${step.eyebrow}</p>
        <h1 id="tutorial-title">${step.title}</h1>
        <p>${step.body}</p>
        <div class="tutorial-actions">
          ${index ? '<button class="secondary-action" id="tutorial-back" type="button">Back</button>' : '<span></span>'}
          <button class="primary-action" id="tutorial-next" type="button">${index === tutorialSteps.length - 1 ? 'Try schedule import' : 'Next'}</button>
        </div>
      </section>`;
    screen.querySelector('#tutorial-back')?.addEventListener('click', () => { index -= 1; render(); });
    screen.querySelector('#tutorial-next')?.addEventListener('click', () => {
      if (index < tutorialSteps.length - 1) { index += 1; render(); return; }
      localStorage.setItem(TUTORIAL_KEY, 'true');
      screen.classList.add('is-leaving');
      window.setTimeout(() => { screen.remove(); window.location.hash = '#/import'; }, 220);
    });
  };

  render();
  document.body.append(screen);
}
