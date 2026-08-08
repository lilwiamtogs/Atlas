import Atlas from './atlas.js?v=43';
import { isInstalledApp, isMobileWeb, showFirstInstallTutorial, showInstallGate } from './components/onboarding.js?v=30';

let installPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  document.documentElement.classList.add('can-install-atlas');
  if (isMobileWeb()) showInstallGate(true);
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  document.documentElement.classList.remove('can-install-atlas');
  document.getElementById('mobile-install-gate')?.remove();
});

document.addEventListener('click', async (event) => {
  if (!event.target.closest('#install-app, #install-gate-button, #settings-install-app') || !installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  document.documentElement.classList.remove('can-install-atlas');
});

window.addEventListener('DOMContentLoaded', async () => {
  if (isMobileWeb()) showInstallGate(Boolean(installPrompt));
  await Atlas.start();
  if (isInstalledApp()) showFirstInstallTutorial();
});

window.addEventListener('load', () => {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch((error) => {
    console.error('Atlas could not enable offline mode.', error);
  });
});
