import { escapeHtml } from '../utils/html.js';
import { hasCompleteScheduleData } from '../services/autosave.js';

export default function SettingsPanel(state, message = '') {
  const supported = typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
  const permission = supported ? Notification.permission : 'unsupported';
  const enabled = Boolean(state.notificationSettings?.enabled && permission === 'granted');
  const autoSaveEnabled = Boolean(state.autoSaveSettings?.enabled);
  const canAutoSave = hasCompleteScheduleData(state.schedule);
  const installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const canInstall = document.documentElement.classList.contains('can-install-atlas');
  const appleDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const account = state.account || { status: 'signed-out' };
  const signedIn = account.status === 'signed-in' && account.user;
  const syncLabels = {
    ready: 'Ready to sync',
    syncing: 'Syncing',
    synced: 'Synced',
    offline: 'Offline',
    error: 'Sync error',
    disabled: 'Cloud sync off',
  };
  const syncLabel = syncLabels[state.syncStatus?.state] || 'Cloud sync off';
  const lastSynced = state.syncStatus?.lastSyncedAt
    ? new Date(state.syncStatus.lastSyncedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '';
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
          <button class="settings-close" id="close-settings" type="button" aria-label="Close settings">×</button>
        </header>

        <div class="settings-section settings-appearance">
          <div class="settings-section-copy">
            <strong>Appearance</strong>
            <span>Use Atlas in light or dark mode.</span>
          </div>
          <button class="settings-theme-toggle" id="settings-theme-toggle" type="button" aria-label="Switch to ${state.theme === 'dark' ? 'light' : 'dark'} mode">
            <span>${state.theme === 'dark' ? 'Dark' : 'Light'}</span>
            <span class="theme-toggle-track"><span class="theme-toggle-thumb"></span></span>
          </button>
        </div>

        <div class="settings-section settings-account">
          <div class="account-settings-heading">
            <div>
              <strong>${signedIn ? escapeHtml(account.user.email || 'Atlas account') : 'Atlas account'}</strong>
              <span>${signedIn ? 'Your account is connected. Backups are optional and always start from local data.' : 'Optional cloud backup and syncing across devices.'}</span>
            </div>
            <span class="sync-status is-${escapeHtml(state.syncStatus?.state || 'disabled')}"><span aria-hidden="true"></span>${escapeHtml(syncLabel)}</span>
          </div>
          ${signedIn ? `
            <div class="account-actions">
              <button class="primary-action account-action" id="backup-atlas-now" type="button" ${state.syncStatus?.state === 'syncing' || account.status === 'offline' ? 'disabled' : ''}>${state.syncStatus?.state === 'syncing' ? 'Backing up…' : 'Back up now'}</button>
              <button class="secondary-action account-action" id="sign-out-atlas" type="button">Sign out</button>
            </div>
          ` : `
            <form class="account-sign-in-form" id="atlas-sign-in-form">
              <label for="atlas-account-email">Email address</label>
              <div>
                <input id="atlas-account-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required ${account.status === 'loading' ? 'disabled' : ''}>
                <button class="primary-action" type="submit" ${account.status === 'loading' || account.status === 'offline' ? 'disabled' : ''}>${account.status === 'loading' ? 'Connecting…' : 'Email me a sign-in link'}</button>
              </div>
            </form>
          `}
          ${account.status === 'offline' ? '<p class="account-message">Atlas is offline. Your local planner still works normally.</p>' : ''}
          ${account.message ? `<p class="account-message" role="status">${escapeHtml(account.message)}</p>` : ''}
          ${account.error ? `<p class="account-message is-error" role="alert">${escapeHtml(account.error)}</p>` : ''}
          ${state.syncStatus?.error ? `<p class="account-message is-error" role="alert">${escapeHtml(state.syncStatus.error)}</p>` : ''}
          ${lastSynced ? `<p class="account-message">Last backed up ${escapeHtml(lastSynced)}</p>` : ''}
          <p class="account-local-note">Signing in never removes or replaces data saved on this device.</p>
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

        <div class="settings-section settings-autosave">
          <div class="notification-settings-heading">
            <div>
              <strong>${autoSaveEnabled ? 'Autosave enabled' : 'Schedule autosave'}</strong>
              <span>${canAutoSave ? 'Keeps one saved semester updated after task and note changes.' : 'Complete Current Data on the Import page first.'}</span>
            </div>
            <button class="${autoSaveEnabled ? 'secondary-action' : 'primary-action'}" id="${autoSaveEnabled ? 'disable-autosave' : 'enable-autosave'}" type="button" ${canAutoSave || autoSaveEnabled ? '' : 'disabled'}>${autoSaveEnabled ? 'Turn off' : 'Enable'}</button>
          </div>
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
