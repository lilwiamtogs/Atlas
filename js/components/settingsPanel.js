import { escapeHtml } from '../utils/html.js';
import { hasCompleteScheduleData } from '../services/autosave.js';
import { activeTheme } from '../services/personalization.js';
import Icon from './icon.js';

export default function SettingsPanel(state, message = '') {
  const supported = typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
  const permission = supported ? Notification.permission : 'unsupported';
  const enabled = Boolean(state.notificationSettings?.enabled && permission === 'granted');
  const autoSaveEnabled = Boolean(state.autoSaveSettings?.enabled);
  const canAutoSave = hasCompleteScheduleData(state.schedule);
  const installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const canInstall = document.documentElement.classList.contains('can-install-atlas');
  const appleDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const personalization = state.personalization || {};
  const selectedTheme = activeTheme(personalization);
  const featureRequestLink = `mailto:williamtogonon@gmail.com?subject=${encodeURIComponent('Atlas feature request')}&body=${encodeURIComponent(`Hi William,

Feature name:

What would you like Atlas to do?

Why would this be useful?

Anything else:
`)}`;

  return `
    <div class="settings-screen" id="settings-screen">
      <section class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header class="settings-header">
          <div>
            <p class="eyebrow">Atlas</p>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button class="settings-close" id="close-settings" type="button" aria-label="Close settings">${Icon('close')}</button>
        </header>

        <div class="settings-section settings-focus-mode">
          <div class="settings-section-copy">
            <strong>Focus mode</strong>
            <span>Quiet the background and keep Now centered on what needs attention.</span>
          </div>
          <div class="settings-pill" role="group" aria-label="Focus mode"><button class="${personalization.focusMode ? '' : 'is-active'}" data-focus-mode="false" type="button">Off</button><button class="${personalization.focusMode ? 'is-active' : ''}" data-focus-mode="true" type="button">On</button></div>
        </div>

        <div class="settings-section settings-opening-page">
          <div class="settings-section-copy">
            <strong>Opening page</strong><span>Choose what Atlas shows when opened without a direct link.</span>
          </div>
          <div class="settings-pill" role="group" aria-label="Opening page"><button class="${personalization.openingPage === 'schedule' ? '' : 'is-active'}" data-opening-page="home" type="button">Now</button><button class="${personalization.openingPage === 'schedule' ? 'is-active' : ''}" data-opening-page="schedule" type="button">Week</button></div>
        </div>

        <div class="settings-section settings-appearance">
          <div class="settings-section-copy"><strong>Theme · ${escapeHtml(selectedTheme.name || 'Untitled theme')}</strong><span>Return to an Atlas theme anytime without deleting your saved themes.</span></div>
          <div class="settings-pill settings-theme-pill" role="group" aria-label="Atlas themes"><button class="${personalization.activeThemeId === 'atlas-light' ? 'is-active' : ''}" data-theme-preset="atlas-light" type="button">Light</button><button class="${personalization.activeThemeId === 'atlas-dark' ? 'is-active' : ''}" data-theme-preset="atlas-dark" type="button">Dark</button></div>
        </div>

        <div class="settings-section settings-notifications">
          <div class="notification-settings-heading">
            <div>
              <strong>${enabled ? 'Reminders enabled' : 'Notifications'}</strong>
              <span>${permission === 'denied' ? 'Blocked in browser settings' : 'Class, assignment, workload, and exam alerts'}</span>
            </div>
            <button class="${enabled ? 'secondary-action' : 'primary-action'}" id="${enabled ? 'disable-notifications' : 'enable-notifications'}" type="button" ${supported && permission !== 'denied' ? '' : 'disabled'}>${enabled ? 'Turn off' : 'Enable'}</button>
          </div>
          <ul class="notification-rule-list">
            <li>Classes · 15 minutes before</li>
            <li>Assignments · 14, 7, 3, and 1 day before</li>
            <li>Busy week · 3 or more tasks within 7 days</li>
            <li>Tests & exams · 7 days before</li>
          </ul>
          <p class="notification-limit">Atlas checks reminders while the app is open. Fully closed delivery will require a Web Push server.</p>
          ${message ? `<p class="settings-message" role="status">${escapeHtml(message)}</p>` : ''}
        </div>

        ${state.account?.status === 'signed-in' ? '' : `<div class="settings-section settings-autosave">
          <div class="notification-settings-heading">
            <div>
              <strong>${autoSaveEnabled ? 'Autosave enabled' : 'Schedule autosave'}</strong>
              <span>${canAutoSave ? 'Keeps one saved semester updated after task and note changes.' : 'Complete Current Data on the Import page first.'}</span>
            </div>
            <button class="${autoSaveEnabled ? 'secondary-action' : 'primary-action'}" id="${autoSaveEnabled ? 'disable-autosave' : 'enable-autosave'}" type="button" ${canAutoSave || autoSaveEnabled ? '' : 'disabled'}>${autoSaveEnabled ? 'Turn off' : 'Enable'}</button>
          </div>
        </div>`}

        <div class="settings-section settings-schedule-tools">
          <div class="settings-section-copy">
            <strong>Schedule import</strong>
            <span>Import a new schedule, replace the current one, or manage saved semester copies.</span>
          </div>
          <button class="secondary-action" id="settings-open-import" type="button">Open schedule import</button>
        </div>

        <div class="settings-section settings-help-tools">
          <div class="settings-section-copy">
            <strong>Atlas guide</strong>
            <span>Find quick instructions for tasks, notes, classes, exams, and syncing.</span>
          </div>
          <button class="secondary-action" id="settings-open-help" type="button">Open help</button>
        </div>

        <div class="settings-section settings-install">
          <div class="notification-settings-heading">
            <div>
              <strong>${installed ? 'Atlas is installed' : 'Install Atlas'}</strong>
              <span>${installed ? 'Updates are applied automatically when Atlas is reopened.' : canInstall ? 'Add Atlas to this device for offline access.' : appleDevice ? 'Use Share, then “Add to Home Screen.”' : 'Use your browser menu and choose “Install app.”'}</span>
            </div>
            ${!installed && canInstall ? '<button class="primary-action" id="settings-install-app" type="button">Install</button>' : ''}
          </div>
        </div>

        <div class="settings-section settings-contact">
          <div class="settings-section-copy">
            <strong>Have an idea for Atlas?</strong>
            <span>Send a feature request using a ready-made email template.</span>
          </div>
          <a class="secondary-action settings-email-link" href="${featureRequestLink}">Request a feature <span aria-hidden="true">↗</span></a>
          <span class="settings-email-address">williamtogonon@gmail.com</span>
        </div>
      </section>
    </div>`;
}
