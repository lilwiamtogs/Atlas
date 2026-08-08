const TUTORIAL_KEY = 'atlas.tutorialComplete';

export function isInstalledApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isMobileWeb() {
  const compact = window.matchMedia('(max-width: 619px)').matches;
  const touchFirst = window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return compact && touchFirst && !isInstalledApp();
}

export function showInstallGate(canPrompt = false) {
  if (!isMobileWeb()) return null;
  const existing = document.getElementById('mobile-install-gate');
  if (existing) {
    const button = existing.querySelector('#install-gate-button');
    if (button && canPrompt) {
      button.disabled = false;
      button.textContent = 'Install Atlas';
    }
    return existing;
  }
  const appleDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const gate = document.createElement('div');
  gate.className = 'install-gate';
  gate.id = 'mobile-install-gate';
  gate.innerHTML = `
    <section class="install-gate-card" role="dialog" aria-modal="true" aria-labelledby="install-gate-title">
      <img src="assets/icons/atlas-192.png" alt="" aria-hidden="true">
      <p class="eyebrow">Atlas for mobile</p>
      <h1 id="install-gate-title">Install Atlas to continue</h1>
      <p>Atlas works offline and feels at home on your phone once it is installed.</p>
      ${appleDevice ? '' : `<button class="primary-action" id="install-gate-button" type="button" ${canPrompt ? '' : 'disabled'}>${canPrompt ? 'Install Atlas' : 'Preparing installer…'}</button>`}
      <div class="manual-install-steps">
          <strong>${appleDevice ? 'On iPhone or iPad' : 'Install from your browser'}</strong>
          <span>${appleDevice ? 'Tap Share, then choose “Add to Home Screen.”' : 'Open the browser menu and choose “Install app” or “Add to Home screen.”'}</span>
      </div>
      <p class="install-gate-hint">Already installed? Open Atlas from your home screen.</p>
    </section>`;
  document.body.append(gate);
  return gate;
}

const tutorialSteps = [
  {
    eyebrow: 'Welcome',
    title: 'Atlas keeps your semester in one place.',
    body: 'Your weekly classes, assignments, notes, and exams stay together and are saved on this device.',
  },
  {
    eyebrow: 'Step 1 · Import',
    title: 'Start with your schedule.',
    body: 'Open Import and choose a PNG or JPG screenshot of the full schedule table. Use a straight, clear image where the class code, subject, day, time, and room are readable.',
  },
  {
    eyebrow: 'Step 2 · Verify',
    title: 'Check every class before saving.',
    body: 'Atlas presents one detected class at a time. Correct any OCR mistakes, then fill in your course, year level, and semester so saved schedules have useful names.',
  },
  {
    eyebrow: 'Step 3 · Plan',
    title: 'Build out each class.',
    body: 'Use Week to add assignments and TXT notes. Open a class card for its full page, where you can edit class details, read notes, and add tests or exams.',
  },
  {
    eyebrow: 'Step 4 · Stay ready',
    title: 'Turn on the helpers you want.',
    body: 'Settings contains reminders, light and dark mode, and optional autosave. Autosave becomes available after Current Data is complete.',
  },
];

export function showFirstInstallTutorial() {
  if (!isInstalledApp() || localStorage.getItem(TUTORIAL_KEY) === 'true') return;
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
          <button class="primary-action" id="tutorial-next" type="button">${index === tutorialSteps.length - 1 ? 'Go to Import' : 'Next'}</button>
        </div>
      </section>`;
    document.getElementById('tutorial-back')?.addEventListener('click', () => { index -= 1; render(); });
    document.getElementById('tutorial-next').addEventListener('click', () => {
      if (index < tutorialSteps.length - 1) {
        index += 1;
        render();
        return;
      }
      localStorage.setItem(TUTORIAL_KEY, 'true');
      screen.classList.add('is-leaving');
      window.setTimeout(() => {
        screen.remove();
        window.location.hash = '#/import';
      }, 220);
    });
  };

  render();
  document.body.append(screen);
}
