import Atlas from './atlas.js?v=153';
import { isMobileWeb, markInstallKnown, showFirstOpenTutorial, showInstallGate } from './components/onboarding.js?v=37';

let installPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  document.documentElement.classList.add('can-install-atlas');
  if (isMobileWeb()) showInstallGate(true);
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  markInstallKnown();
  document.documentElement.classList.remove('can-install-atlas');
  if (isMobileWeb()) showInstallGate(false);
});

document.addEventListener('click', async (event) => {
  if (!event.target.closest('#install-app, #install-gate-button, #settings-install-app') || !installPrompt) return;
  await installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  installPrompt = null;
  document.documentElement.classList.remove('can-install-atlas');
  if (choice.outcome === 'accepted') {
    markInstallKnown();
    if (isMobileWeb()) showInstallGate(false);
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  if (isMobileWeb()) showInstallGate(Boolean(installPrompt));
  await Atlas.start();
  showFirstOpenTutorial();
});

window.addEventListener('load', () => {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((registration) => {
    window.setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
  }).catch((error) => console.error('Atlas could not enable offline mode.', error));
});
