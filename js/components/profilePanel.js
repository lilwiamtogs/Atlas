import { escapeHtml } from '../utils/html.js';
import { getPendingSyncReview } from '../sync/sync.js?v=2';

const syncLabels = { ready: 'Ready to sync', checking: 'Checking', review: 'Review needed', syncing: 'Syncing', synced: 'Synced', offline: 'Offline', error: 'Sync error', disabled: 'Cloud sync off' };

function compactValue(value) {
  if (value === undefined) return 'Deleted';
  if (value === null) return 'None';
  if (typeof value !== 'object') return String(value);
  return value.title || value.name || value.code || JSON.stringify(value).slice(0, 90);
}

function syncReviewPanel() {
  const review = getPendingSyncReview();
  if (!review) return '';
  return `<div class="sync-review-screen" id="sync-review-screen" role="dialog" aria-modal="true" aria-labelledby="sync-review-title"><section class="sync-review-card">
    <header class="sync-review-heading"><div><p class="eyebrow">Cloud sync</p><h2 id="sync-review-title">Review changes</h2></div><button class="settings-close" id="cancel-sync-review" type="button" aria-label="Cancel sync">×</button></header>
    <p class="sync-review-message">${escapeHtml(review.message)}</p>
    ${review.changes.length ? `<div class="sync-change-list">${review.changes.map((change) => `<p><strong>${escapeHtml(change.type)}</strong><span>${escapeHtml(change.label)}${change.item ? ` · ${escapeHtml(change.item)}` : ''}</span></p>`).join('')}</div>` : ''}
    ${review.conflicts.length ? `<form id="sync-review-form"><div class="sync-conflict-list">${review.conflicts.map((conflict) => `<fieldset class="sync-conflict"><legend>${escapeHtml(conflict.path === '$' ? 'Complete Atlas copy' : conflict.path)}</legend><label><input type="radio" name="conflict-${conflict.id}" value="local" required><span><strong>This device</strong><small>${escapeHtml(compactValue(conflict.local))}</small></span></label><label><input type="radio" name="conflict-${conflict.id}" value="remote" required><span><strong>Cloud</strong><small>${escapeHtml(compactValue(conflict.remote))}</small></span></label></fieldset>`).join('')}</div><div class="sync-review-actions"><button class="secondary-action" data-cancel-sync-review type="button">Not now</button><button class="primary-action" type="submit">Use selected versions</button></div></form>` : `<div class="sync-review-actions"><button class="secondary-action" data-cancel-sync-review type="button">Not now</button><button class="primary-action" id="confirm-safe-sync" type="button">Sync these changes</button></div>`}
  </section></div>`;
}

export default function ProfilePanel(state) {
  const account = state.account || { status: 'signed-out' };
  const signedIn = account.status === 'signed-in' && account.user;
  const syncState = state.syncStatus?.state || 'disabled';
  const syncLabel = syncLabels[syncState] || 'Cloud sync off';
  const lastSynced = state.syncStatus?.lastSyncedAt ? new Date(state.syncStatus.lastSyncedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
  return `<div class="profile-screen" id="profile-screen"><section class="profile-panel" role="dialog" aria-modal="true" aria-labelledby="profile-title">
    <header class="settings-header"><div><p class="eyebrow">Atlas cloud</p><h2 id="profile-title">Profile</h2></div><button class="settings-close" id="close-profile" type="button" aria-label="Close profile">×</button></header>
    <div class="settings-section settings-account"><div class="account-settings-heading"><div><strong>${signedIn ? escapeHtml(account.user.email || 'Atlas account') : 'Sign up or log in'}</strong><span>${signedIn ? 'You are logged in. Atlas can safely sync this device with your cloud copy.' : 'Enter your email. Atlas will create an account or log you in with a secure email link.'}</span></div><span class="sync-status is-${escapeHtml(syncState)}"><span aria-hidden="true"></span>${escapeHtml(syncLabel)}</span></div>
    ${signedIn ? `<div class="account-actions"><button class="primary-action account-action" id="sync-atlas-now" type="button" ${['checking', 'syncing'].includes(syncState) ? 'disabled' : ''}>${syncState === 'checking' ? 'Checking…' : syncState === 'syncing' ? 'Syncing…' : 'Sync now'}</button><button class="secondary-action account-action" id="sign-out-atlas" type="button">Sign out</button></div>` : `<div class="account-login-options"><button class="google-sign-in" id="google-sign-in" type="button" ${account.status === 'loading' || account.status === 'offline' ? 'disabled' : ''}><span aria-hidden="true">G</span>Continue with Google</button><button class="account-email-toggle" id="show-email-sign-in" type="button">Use email instead</button><div class="account-email-option" id="account-email-option" hidden><div class="account-login-divider"><span>email sign in</span></div><form class="account-sign-in-form" id="atlas-sign-in-form"><label for="atlas-account-email">Email magic link</label><div><input id="atlas-account-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required ${account.status === 'loading' ? 'disabled' : ''}><button class="primary-action" type="submit" ${account.status === 'loading' || account.status === 'offline' ? 'disabled' : ''}>${account.status === 'loading' ? 'Connecting…' : 'Continue with email'}</button></div></form></div></div>`}
    ${signedIn ? `<form class="profile-name-form" id="profile-name-form"><label for="profile-display-name">Display name</label><div><input id="profile-display-name" name="displayName" maxlength="40" value="${escapeHtml(account.user.user_metadata?.display_name || account.user.user_metadata?.full_name || account.user.user_metadata?.name || '')}" placeholder="What should Atlas call you?"><button class="secondary-action" type="submit">Save name</button></div></form>` : ''}
    ${account.status === 'offline' ? '<p class="account-message">Atlas is offline. Your local planner still works normally.</p>' : ''}${account.message ? `<p class="account-message" role="status">${escapeHtml(account.message)}</p>` : ''}${account.error ? `<p class="account-message is-error" role="alert">${escapeHtml(account.error)}</p>` : ''}${state.syncStatus?.error ? `<p class="account-message is-error" role="alert">${escapeHtml(state.syncStatus.error)}</p>` : ''}
    ${signedIn ? `<p class="account-message account-sync-summary"><strong>${escapeHtml(syncLabel)}</strong><span>${lastSynced ? `Last synced ${escapeHtml(lastSynced)}` : 'This account has not synced on this device yet.'}</span></p>` : ''}<p class="account-local-note">Signing in never removes or replaces data saved on this device.</p></div>
    <div class="settings-section profile-preferences"><div class="settings-section-copy"><strong>App settings</strong><span>Schedule import, help, reminders, appearance, and installation.</span></div><button class="secondary-action" id="profile-open-settings" type="button">Open settings</button></div>
  </section>${syncReviewPanel()}</div>`;
}
