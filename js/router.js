import Home from './views/home.js?v=47';
import Schedule from './views/schedule.js?v=68';
import ImportSchedule from './views/importSchedule.js?v=65';
import ClassDetail from './views/classDetail.js?v=48';
import Navbar from './components/navbar.js?v=3';
import DeveloperTools from './components/developerTools.js';
import ThemeToggle from './components/themeToggle.js';
import InstallButton from './components/installButton.js';
import SettingsPanel from './components/settingsPanel.js?v=6';
import ProfilePanel from './components/profilePanel.js?v=3';
import Store from './store.js';
import { requestNotificationAccess, saveNotificationSettings } from './services/notifications.js';
import { disableAutoSave, enableAutoSave } from './services/autosave.js';
import { formatClock, getNow } from './utils/time.js';
import enhanceSelects from './components/selectEnhancer.js?v=43';
import enhanceDatePickers from './components/datePicker.js';
import Atmosphere from './components/atmosphere.js?v=4';
import HelpPanel, { helpTopics } from './components/helpPanel.js?v=4';
import { showFirstOpenTutorial } from './components/onboarding.js?v=35';
import { closeOverlay } from './utils/animations.js?v=2';

const routes = { home: Home, schedule: Schedule, import: ImportSchedule, class: ClassDetail };
let transitioning = false;
let settingsOpen = false;
let profileOpen = false;
let settingsMessage = '';
let helpOpen = false;
let pendingHelpTarget = null;
let suppressPageAnimation = false;
let shouldAnimatePage = true;

function accountStatusControl(state) {
  const account = state.account || {};
  const signedIn = account.status === 'signed-in' && account.user;
  const syncState = state.syncStatus?.state || 'disabled';
  const labels = { ready: 'Ready to sync', checking: 'Checking', review: 'Review needed', syncing: 'Syncing', synced: 'Synced', offline: 'Offline', error: 'Sync error', disabled: 'Not synced' };
  const lastSync = state.syncStatus?.lastSyncedAt
    ? new Date(state.syncStatus.lastSyncedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
    : 'Never synced';
  return `<button class="account-status-control is-${syncState}" data-open-profile type="button" aria-label="${signedIn ? `${labels[syncState] || 'Account'}. Last sync: ${lastSync}` : 'Sign up or log in'}">
    <span class="account-status-dot" aria-hidden="true"></span><span><strong>${signedIn ? 'Signed in' : 'Sign up / log in'}</strong><small>${signedIn ? `${labels[syncState] || 'Cloud sync'} · ${lastSync}` : 'Cloud sync'}</small></span>
  </button>`;
}

function mobileProfileControl(state) {
  const account = state.account || {};
  const signedIn = account.status === 'signed-in' && account.user;
  const syncState = state.syncStatus?.state || 'disabled';
  return `<button class="mobile-profile-button is-${syncState}" data-open-profile type="button" aria-label="${signedIn ? 'Open profile and cloud sync' : 'Sign up or log in'}">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.25"></circle><path d="M5.5 19c.7-3.3 3.1-5.2 6.5-5.2s5.8 1.9 6.5 5.2"></path></svg>
    <span class="mobile-profile-status" aria-hidden="true"></span>
  </button>`;
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function createPageTransition() {
  const overlay = document.createElement('div');
  overlay.className = 'page-transition';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = '<span></span><span></span><span></span>';
  document.body.append(overlay);
  return overlay;
}

const Router = {
  init() {
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const closeButton = document.querySelector('#cancel-sync-review, #close-profile, #close-settings, #close-help, #close-image-source-picker, #cancel-note-delete, #cancel-schedule-replacement');
      if (closeButton) {
        event.preventDefault();
        closeButton.click();
      }
    });
    window.addEventListener('hashchange', () => {
      settingsOpen = false;
      profileOpen = false;
      helpOpen = false;
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      shouldAnimatePage = true;
      this.render();
    });
    document.getElementById('app')?.addEventListener('click', async (event) => {
      if (!event.target.closest('#replay-tutorial')) return;
      event.preventDefault();
      event.stopPropagation();
      helpOpen = false;
      const helpScreen = document.getElementById('help-screen');
      const installGate = document.getElementById('mobile-install-gate');
      await Promise.all([closeOverlay(helpScreen), closeOverlay(installGate)]);
      helpScreen?.remove();
      installGate?.remove();
      window.setTimeout(() => showFirstOpenTutorial({ force: true }), 0);
    }, true);
    Store.subscribe(() => this.render());
    this.render();
  },

  getRoute() {
    const path = this.getRoutePath();
    const route = path.split('/')[0];
    return routes[route] ? route : 'home';
  },

  getRoutePath() {
    return window.location.hash.replace('#/', '') || 'home';
  },

  commitRoute(route) {
    settingsOpen = false;
    profileOpen = false;
    helpOpen = false;
    shouldAnimatePage = true;
    window.history.pushState(null, '', `#/${route}`);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    this.render();
  },

  async go(route) {
    const routeName = route.split('/')[0];
    if (!routes[routeName]) return;
    if (this.getRoutePath() === route) this.render();
    else {
      if (transitioning) return;
      transitioning = true;

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const compactScreen = window.matchMedia('(max-width: 619px)').matches;
      if (reduceMotion) {
        this.commitRoute(route);
        transitioning = false;
        return;
      }

      if (compactScreen) {
        const overlay = createPageTransition();
        overlay.classList.add('is-mobile');
        document.documentElement.classList.add('is-page-transitioning');
        requestAnimationFrame(() => overlay.classList.add('is-covering'));
        await wait(460);
        this.commitRoute(route);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        overlay.classList.add('is-revealing');
        await wait(460);
        overlay.remove();
        document.documentElement.classList.remove('is-page-transitioning');
        transitioning = false;
        return;
      }

      const overlay = createPageTransition();
      document.documentElement.classList.add('is-page-transitioning');
      requestAnimationFrame(() => overlay.classList.add('is-covering'));
      await wait(460);
      this.commitRoute(route);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await wait(20);
      overlay.classList.add('is-revealing');
      await wait(460);
      overlay.remove();
      document.documentElement.classList.remove('is-page-transitioning');
      transitioning = false;
    }
  },

  render() {
    const app = document.getElementById('app');
    const route = this.getRoute();
    const routePath = this.getRoutePath();
    const state = Store.get();
    const now = getNow(state.timeOverride);
    const routeParts = routePath.split('/');
    const context = route === 'class'
      ? {
          classId: decodeURIComponent(routeParts[1] || ''),
          noteId: routeParts[2] === 'note' ? decodeURIComponent(routeParts[3] || '') : '',
        }
      : {};
    const lightweightMobile = window.matchMedia('(max-width: 619px), (pointer: coarse)').matches;
    const atmosphereMarkup = Atmosphere(route);

    document.documentElement.dataset.theme = state.theme;

    Store.get().currentView = route;
    app.innerHTML = `
      <main id="main-content" class="app-main route-${route} ${shouldAnimatePage && !suppressPageAnimation ? 'page-enter-active' : ''}">${atmosphereMarkup}${routes[route].render(state, now, context)}</main>
      <div class="app-controls">
        ${InstallButton()}
        ${ThemeToggle(state.theme)}
        <button class="desktop-settings-button" data-open-settings type="button" aria-label="Open settings">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"></path></svg>
        </button>
      </div>
      <div class="nav-dock">
        ${Navbar(route === 'class' ? 'schedule' : route)}
        <button class="global-help-button" data-open-help type="button" aria-label="Open Atlas help">?</button>
        ${mobileProfileControl(state)}
      </div>
      ${DeveloperTools.render(state, now, route)}
      ${settingsOpen ? SettingsPanel(state, settingsMessage) : ''}
      ${profileOpen ? ProfilePanel(state) : ''}
      ${helpOpen ? HelpPanel() : ''}`;

    app.querySelectorAll('#main-content > .confirm-screen, #main-content > .image-source-screen, #main-content > .note-upload-screen').forEach((overlay) => {
      app.append(overlay);
    });

    enhanceSelects(app);
    enhanceDatePickers(app);

    const openingOverlay = app.querySelector('#settings-screen, #profile-screen, #help-screen');
    if (openingOverlay) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (openingOverlay.isConnected) openingOverlay.classList.add('is-visible');
      }));
    }

    const atmosphere = app.querySelector('.atlas-atmosphere');
    if (atmosphere) {
      const main = app.querySelector('#main-content');
      const anchors = [main.querySelector(':scope > .page-header'), ...main.querySelectorAll('.path-section')].filter(Boolean);
      const plates = [...atmosphere.querySelectorAll('.cosmic-plate')];
      const labels = [...atmosphere.querySelectorAll('.coordinate-label')];
      const anchorFor = (index, count) => anchors[Math.round(index * Math.max(0, anchors.length - 1) / Math.max(1, count - 1))];
      plates.forEach((plate, index) => {
        const anchor = anchorFor(index, plates.length);
        if (!anchor) return;
        const top = anchor.offsetTop + (index ? 110 : 42);
        plate.style.top = `${top}px`;
        main.append(plate);
      });
      const labelsPerAnchor = new Map();
      labels.forEach((label, index) => {
        const anchor = anchorFor(index, labels.length);
        if (!anchor) return;
        const anchorCount = labelsPerAnchor.get(anchor) || 0;
        labelsPerAnchor.set(anchor, anchorCount + 1);
        const top = anchor.offsetTop + 24 + anchorCount * 24;
        label.style.top = `${top}px`;
        main.append(label);
      });
      atmosphere.remove();
    }

    const atmospherePlates = [...app.querySelectorAll('.cosmic-plate')];
    if (lightweightMobile) {
      atmospherePlates.forEach((plate) => plate.classList.add('is-drawing'));
    } else if ('IntersectionObserver' in window) {
      let remainingAtmospherePlates = atmospherePlates.length;
      const atmosphereObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-drawing');
          observer.unobserve(entry.target);
          remainingAtmospherePlates -= 1;
          if (remainingAtmospherePlates === 0) observer.disconnect();
        });
      }, { rootMargin: '12% 0px', threshold: 0.03 });
      atmospherePlates.forEach((plate) => atmosphereObserver.observe(plate));
    } else {
      atmospherePlates.forEach((plate) => plate.classList.add('is-drawing'));
    }

    app.querySelectorAll('[data-route]').forEach((button) => {
      button.addEventListener('click', () => this.go(button.dataset.route));
    });

    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      const theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('atlas.theme', theme);
      Store.set({ theme });
    });

    app.querySelectorAll('[data-open-settings]').forEach((button) => button.addEventListener('click', () => {
      suppressPageAnimation = true;
      profileOpen = false;
      settingsOpen = true;
      settingsMessage = '';
      this.render();
    }));
    app.querySelectorAll('[data-open-profile]').forEach((button) => button.addEventListener('click', () => {
      suppressPageAnimation = true;
      settingsOpen = false;
      profileOpen = true;
      this.render();
    }));
    app.querySelector('[data-open-help]')?.addEventListener('click', () => {
      suppressPageAnimation = true;
      helpOpen = true;
      this.render();
    });
    const closeHelp = async () => {
      helpOpen = false;
      const screen = document.getElementById('help-screen');
      if (!screen) return;
      await closeOverlay(screen);
      screen.remove();
    };
    document.getElementById('close-help')?.addEventListener('click', closeHelp);
    document.getElementById('help-screen')?.addEventListener('click', (event) => {
      if (event.target.id === 'help-screen') closeHelp();
    });
    app.querySelectorAll('.help-topic-summary').forEach((summary) => summary.addEventListener('click', () => {
      const topic = summary.closest('.help-topic');
      const willOpen = !topic.classList.contains('is-open');
      app.querySelectorAll('.help-topic.is-open').forEach((openTopic) => {
        openTopic.classList.remove('is-open');
        openTopic.querySelector('.help-topic-summary')?.setAttribute('aria-expanded', 'false');
      });
      if (willOpen) {
        topic.classList.add('is-open');
        summary.setAttribute('aria-expanded', 'true');
      }
    }));
    app.querySelectorAll('[data-help-action]').forEach((button) => button.addEventListener('click', async () => {
      const topic = helpTopics[Number(button.dataset.helpAction)];
      pendingHelpTarget = topic.target;
      await closeHelp();
      if (topic.settings) {
        settingsOpen = true;
        this.render();
      } else {
        this.go(topic.route);
      }
    }));
    const closeSettings = async () => {
      const screen = document.getElementById('settings-screen');
      settingsOpen = false;
      if (!screen) return;
      await closeOverlay(screen);
      screen.remove();
    };
    document.getElementById('close-settings')?.addEventListener('click', closeSettings);
    document.getElementById('settings-screen')?.addEventListener('click', (event) => {
      if (event.target.id !== 'settings-screen') return;
      closeSettings();
    });
    document.getElementById('settings-theme-toggle')?.addEventListener('click', () => {
      suppressPageAnimation = true;
      const theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('atlas.theme', theme);
      Store.set({ theme });
    });
    document.getElementById('enable-notifications')?.addEventListener('click', async () => {
      try {
        suppressPageAnimation = true;
        settingsMessage = '';
        Store.set({ notificationSettings: await requestNotificationAccess() });
      } catch (error) {
        settingsMessage = error.message;
        this.render();
      }
    });
    document.getElementById('disable-notifications')?.addEventListener('click', () => {
      suppressPageAnimation = true;
      settingsMessage = '';
      Store.set({ notificationSettings: saveNotificationSettings(false) });
    });
    document.getElementById('enable-autosave')?.addEventListener('click', () => {
      try {
        suppressPageAnimation = true;
        settingsMessage = '';
        Store.set(enableAutoSave(state));
      } catch (error) {
        settingsMessage = error.message;
        this.render();
      }
    });
    document.getElementById('disable-autosave')?.addEventListener('click', () => {
      suppressPageAnimation = true;
      Store.set({ autoSaveSettings: disableAutoSave(state) });
    });
    const closeProfile = async () => {
      const screen = document.getElementById('profile-screen');
      profileOpen = false;
      if (!screen) return;
      await closeOverlay(screen);
      screen.remove();
    };
    document.getElementById('close-profile')?.addEventListener('click', closeProfile);
    document.getElementById('profile-screen')?.addEventListener('click', (event) => {
      if (event.target.id === 'profile-screen') closeProfile();
    });
    document.getElementById('profile-open-settings')?.addEventListener('click', async () => {
      await closeProfile();
      suppressPageAnimation = true;
      settingsOpen = true;
      settingsMessage = '';
      this.render();
    });
    document.getElementById('settings-open-import')?.addEventListener('click', async () => {
      await closeSettings();
      this.go('import');
    });
    document.getElementById('settings-open-help')?.addEventListener('click', async () => {
      await closeSettings();
      suppressPageAnimation = true;
      helpOpen = true;
      this.render();
    });
    document.getElementById('atlas-sign-in-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      suppressPageAnimation = true;
      try {
        const data = new FormData(event.currentTarget);
        const { requestSignIn } = await import('./cloud/auth.js');
        await requestSignIn(String(data.get('email') || '').trim());
      } catch (error) {
        Store.set({ account: { ...Store.get().account, error: error.message, message: '' } });
      }
    });
    document.getElementById('sign-out-atlas')?.addEventListener('click', async () => {
      suppressPageAnimation = true;
      try {
        const { signOut } = await import('./cloud/auth.js');
        await signOut();
      } catch (error) {
        Store.set({ account: { ...Store.get().account, error: error.message, message: '' } });
      }
    });
    document.getElementById('profile-name-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      suppressPageAnimation = true;
      try {
        const data = new FormData(event.currentTarget);
        const { updateDisplayName } = await import('./cloud/auth.js');
        await updateDisplayName(data.get('displayName'));
      } catch (error) {
        Store.set({ account: { ...Store.get().account, error: error.message, message: '' } });
      }
    });
    document.getElementById('sync-atlas-now')?.addEventListener('click', async () => {
      suppressPageAnimation = true;
      try {
        const { checkSyncNow } = await import('./sync/sync.js');
        await checkSyncNow();
        this.render();
      } catch (error) {
        console.error('Atlas sync check failed.', error);
      }
    });
    const cancelSyncReview = async () => {
      await closeOverlay(document.getElementById('sync-review-screen'));
      const { cancelSyncReview } = await import('./sync/sync.js');
      cancelSyncReview();
      this.render();
    };
    document.getElementById('cancel-sync-review')?.addEventListener('click', cancelSyncReview);
    document.querySelector('[data-cancel-sync-review]')?.addEventListener('click', cancelSyncReview);
    document.getElementById('confirm-safe-sync')?.addEventListener('click', async () => {
      try {
        const { confirmSyncReview } = await import('./sync/sync.js');
        await confirmSyncReview();
        await closeOverlay(document.getElementById('sync-review-screen'));
        this.render();
      } catch (error) {
        console.error('Atlas sync failed.', error);
      }
    });
    document.getElementById('sync-review-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const choices = {};
      new FormData(event.currentTarget).forEach((value, key) => { choices[key.replace('conflict-', '')] = value; });
      try {
        const { confirmSyncReview } = await import('./sync/sync.js');
        await confirmSyncReview(choices);
        await closeOverlay(document.getElementById('sync-review-screen'));
        this.render();
      } catch (error) {
        console.error('Atlas conflict resolution failed.', error);
      }
    });

    routes[route].bind?.(this, state, now, context);
    DeveloperTools.bind(this);
    if (pendingHelpTarget) {
      const targetSelector = pendingHelpTarget;
      pendingHelpTarget = null;
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        const target = targetSelector.split(',').map((selector) => document.querySelector(selector.trim())).find(Boolean);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('help-target-highlight');
        window.setTimeout(() => target.classList.remove('help-target-highlight'), 4000);
      }));
    }
    this.updateClock();
    shouldAnimatePage = false;
    suppressPageAnimation = false;
  },

  updateClock() {
    const clock = document.getElementById('live-clock');
    if (clock) clock.textContent = formatClock(getNow(Store.get().timeOverride));
  },
};

export default Router;
