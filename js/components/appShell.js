import Atmosphere from './atmosphere.js';
import DeveloperTools from './developerTools.js';
import HelpPanel from './helpPanel.js';
import InstallButton from './installButton.js';
import Navbar from './navbar.js';
import ProfilePanel, { SyncReviewPanel } from './profilePanel.js';
import SettingsPanel from './settingsPanel.js';
import ThemeToggle from './themeToggle.js';
import Icon from './icon.js';
import { escapeHtml } from '../utils/html.js';

function mobileProfileControl(state) {
  const account = state.account || {};
  const signedIn = account.status === 'signed-in' && account.user;
  const syncState = state.syncStatus?.state || 'disabled';
  return `<button class="mobile-profile-button is-${syncState}" data-open-profile type="button" aria-label="${signedIn ? 'Open profile and cloud sync' : 'Sign up or log in'}">
    ${Icon('user')}
    <span class="mobile-profile-status" aria-hidden="true"></span>
  </button>`;
}

function storageWarning(state) {
  if (!state.storageIssues?.length) return '';
  return `<div class="storage-warning" role="alert"><strong>Cloud sync paused to protect your data.</strong><span>Atlas found unreadable saved data on this device and kept a recovery copy. Reload after repairing or restoring the affected data.</span><small>${state.storageIssues.map((issue) => escapeHtml(issue.key)).join(' · ')}</small></div>`;
}

export default function AppShell({
  state,
  now,
  route,
  routeMarkup,
  pageClass = '',
  settingsOpen = false,
  settingsMessage = '',
  profileOpen = false,
  helpOpen = false,
  syncReviewOpen = false,
}) {
  return `
    <main id="main-content" class="app-main route-${route} ${pageClass}" tabindex="-1">${storageWarning(state)}${Atmosphere(route)}${routeMarkup}</main>
    <div class="app-controls">
      ${InstallButton()}
      ${ThemeToggle(state.personalization)}
      <button class="desktop-settings-button" data-open-settings type="button" aria-label="Open settings">
        ${Icon('settings')}
      </button>
    </div>
    <div class="nav-dock">
      ${mobileProfileControl(state)}
      ${Navbar(route === 'class' ? 'schedule' : route)}
      <button class="global-help-button" data-open-help type="button" aria-label="Open Atlas help">${Icon('help')}</button>
    </div>
    ${DeveloperTools.render(state, now, route)}
    ${settingsOpen ? SettingsPanel(state, settingsMessage) : ''}
    ${profileOpen ? ProfilePanel(state) : ''}
    ${helpOpen ? HelpPanel() : ''}
    ${syncReviewOpen ? SyncReviewPanel() : ''}`;
}
