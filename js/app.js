import Atlas from './atlas.js?v=91';
import { isMobileWeb, markInstallKnown, showFirstOpenTutorial, showInstallGate } from './components/onboarding.js?v=33';

let installPrompt = null;

function showUpdateNotice(registration) {
  if (document.getElementById('atlas-update-notice')) return;
  const notice = document.createElement('aside');
  notice.className = 'update-notice';
  notice.id = 'atlas-update-notice';
  notice.setAttribute('role', 'status');
  notice.innerHTML = `
    <div><strong>Atlas has an update.</strong><span>Your saved planner data will stay on this device.</span></div>
    <button class="primary-action" id="apply-atlas-update" type="button">Update</button>
    <button class="update-later" id="dismiss-atlas-update" type="button">Later</button>`;
  document.body.append(notice);
  notice.querySelector('#dismiss-atlas-update')?.addEventListener('click', () => {
    notice.classList.add('is-dismissing');
    window.setTimeout(() => notice.remove(), 260);
  });
  notice.querySelector('#apply-atlas-update')?.addEventListener('click', () => {
    if (notice.classList.contains('is-updating')) return;
    notice.classList.add('is-updating');
    notice.querySelector('strong').textContent = 'Updating Atlas…';
    notice.querySelector('span').textContent = 'Finishing the update without changing your saved planner data.';
    notice.querySelector('#apply-atlas-update').disabled = true;
    notice.querySelector('#dismiss-atlas-update').disabled = true;
    if (!registration.waiting) {
      window.setTimeout(() => window.location.reload(), 650);
      return;
    }
    sessionStorage.setItem('atlas.updateRequested', 'true');
    window.setTimeout(() => registration.waiting?.postMessage({ type: 'SKIP_WAITING' }), 450);
  });
}

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
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate || sessionStorage.getItem('atlas.updateRequested') !== 'true') return;
    reloadingForUpdate = true;
    sessionStorage.removeItem('atlas.updateRequested');
    window.location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((registration) => {
    if (registration.waiting && navigator.serviceWorker.controller) showUpdateNotice(registration);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateNotice(registration);
      });
    });
    window.setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
  }).catch((error) => console.error('Atlas could not enable offline mode.', error));
});
