import Home from './views/home.js?v=61';
import Schedule from './views/schedule.js?v=78';
import ImportSchedule from './views/importSchedule.js?v=69';
import ClassDetail from './views/classDetail.js?v=56';
import Navbar from './components/navbar.js?v=3';
import DeveloperTools from './components/developerTools.js';
import ThemeToggle from './components/themeToggle.js?v=2';
import InstallButton from './components/installButton.js';
import SettingsPanel from './components/settingsPanel.js?v=10';
import ProfilePanel, { SyncReviewPanel } from './components/profilePanel.js?v=10';
import Store from './store.js';
import { requestNotificationAccess, saveNotificationSettings } from './services/notifications.js';
import { disableAutoSave, enableAutoSave } from './services/autosave.js';
import { formatClock, getNow, minutesFromTime } from './utils/time.js';
import enhanceSelects from './components/selectEnhancer.js?v=43';
import enhanceDatePickers from './components/datePicker.js?v=3';
import enhanceTimePickers from './components/timePicker.js?v=2';
import Atmosphere from './components/atmosphere.js?v=5';
import HelpPanel, { helpTopics } from './components/helpPanel.js?v=4';
import { showFirstOpenTutorial } from './components/onboarding.js?v=38';
import { closeOverlay, openOverlay } from './utils/animations.js?v=9';
import { applyPersonalization, savePersonalization } from './services/personalization.js?v=2';

const routes = { home: Home, schedule: Schedule, import: ImportSchedule, class: ClassDetail };
let transitioning = false;
let settingsOpen = false;
let profileOpen = false;
let settingsMessage = '';
let helpOpen = false;
let pendingHelpTarget = null;
let suppressPageAnimation = false;
let shouldAnimatePage = true;
let suppressNextStoreRender = false;
let previousStoreSnapshot = { ...Store.get() };
let syncReviewOpen = false;
const atmosphereLayouts = new Map();

function hasOpenTransientUI() {
  return Boolean(document.querySelector([
    '#home-task-confirm',
    '.atlas-time-panel:not([hidden])',
    '.atlas-color-panel:not([hidden])',
    '[data-atlas-calendar]:not([hidden])',
    '[data-atlas-select].is-open',
    '.image-source-screen',
    '.note-upload-screen',
  ].join(',')));
}

function layoutKey(element, index) {
  const label = element.querySelector(':scope > .eyebrow')?.textContent?.trim();
  return `${element.matches('.path-section') ? 'section' : element.className}:${label || index}`;
}

function captureLayout(main) {
  if (!main) return null;
  const elements = [...main.querySelectorAll(':scope > .path-section:not(.hero-path-section), :scope > .class-profile-card, :scope > .class-master-directory')];
  return {
    scrollY: window.scrollY,
    positions: new Map(elements.map((element, index) => [layoutKey(element, index), element.getBoundingClientRect()])),
  };
}

function animateLayoutChange(main, previous) {
  if (!main || !previous || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const elements = [...main.querySelectorAll(':scope > .path-section:not(.hero-path-section), :scope > .class-profile-card, :scope > .class-master-directory')];
  elements.forEach((element, index) => {
    const before = previous.positions.get(layoutKey(element, index));
    if (!before) return;
    const after = element.getBoundingClientRect();
    const deltaY = before.top - after.top;
    if (Math.abs(deltaY) < 1 || Math.abs(deltaY) > window.innerHeight * 1.5) return;
    element.animate(
      [{ transform: `translateY(${deltaY}px)` }, { transform: 'translateY(0)' }],
      { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' },
    );
  });
}

function drawAtmosphere() {
  const plates = [...document.querySelectorAll('#main-content .cosmic-plate:not(.is-drawing)')];
  plates.forEach((plate, index) => {
    plate.style.setProperty('--atmosphere-delay', `${index * 110}ms`);
  });
  // Commit the hidden SVGs before switching their CSS state. Two frames are
  // intentional: the first inserts/layouts them, the second begins the fade.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    plates.forEach((plate) => {
      if (plate.isConnected) plate.classList.add('is-drawing');
    });
  }));
}

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
  animateAtmosphere() {
    const plates = [...document.querySelectorAll('#main-content .cosmic-plate')];
    plates.forEach((plate) => {
      plate.classList.remove('is-drawing', 'is-settled');
      plate.style.removeProperty('--atmosphere-delay');
    });
    drawAtmosphere();
  },

  init() {
    window.addEventListener('atlas:sync-review', () => {
      suppressPageAnimation = true;
      syncReviewOpen = true;
      // Never replace an editor or picker while the user is in the middle of it.
      // The queued review will appear on the next intentional render instead.
      if (hasOpenTransientUI()) return;
      this.render();
    });
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
    Store.subscribe((state) => {
      const changedKeys = Object.keys(state).filter((key) => state[key] !== previousStoreSnapshot[key]);
      previousStoreSnapshot = { ...state };
      if (suppressNextStoreRender) {
        suppressNextStoreRender = false;
        return;
      }
      const backgroundAccountUpdate = changedKeys.length && changedKeys.every((key) => key === 'syncStatus' || key === 'account');
      if (backgroundAccountUpdate && (settingsOpen || profileOpen || helpOpen || hasOpenTransientUI())) return;
      this.render();
    });
    this.render();
  },

  getRoute() {
    const path = this.getRoutePath();
    const route = path.split('/')[0];
    return routes[route] ? route : 'home';
  },

  getRoutePath() {
    return window.location.hash.replace('#/', '') || Store.get().personalization?.openingPage || 'home';
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
        // The final mobile panel is delayed, so wait until every panel fully
        // covers the viewport before replacing the route underneath it.
        await wait(590);
        this.commitRoute(route);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        overlay.classList.add('is-revealing');
        await wait(590);
        overlay.remove();
        document.documentElement.classList.remove('is-page-transitioning');
        transitioning = false;
        drawAtmosphere();
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
      drawAtmosphere();
    }
  },

  render() {
    const app = document.getElementById('app');
    const previousRoute = app.querySelector('#main-content')?.className.match(/route-([^\s]+)/)?.[1];
    const previousLayout = previousRoute === this.getRoute() && !shouldAnimatePage
      ? captureLayout(app.querySelector('#main-content'))
      : null;
    const previouslyOpenOverlays = new Set([...app.querySelectorAll('#settings-screen, #profile-screen, #help-screen, #sync-review-screen')].map((item) => item.id));
    const route = this.getRoute();
    const animateAtmosphere = shouldAnimatePage;
    const routePath = this.getRoutePath();
    const state = Store.get();
    applyPersonalization(state.personalization);
    const now = getNow(state.timeOverride);
    const routeParts = routePath.split('/');
    const context = route === 'class'
      ? {
          classId: decodeURIComponent(routeParts[1] || ''),
          noteId: routeParts[2] === 'note' ? decodeURIComponent(routeParts[3] || '') : '',
        }
      : {};
    const atmosphereMarkup = Atmosphere(route);

    Store.get().currentView = route;
    app.innerHTML = `
      <main id="main-content" class="app-main route-${route} ${shouldAnimatePage && !suppressPageAnimation && !transitioning ? 'page-enter-active' : ''}">${atmosphereMarkup}${routes[route].render(state, now, context)}</main>
      <div class="app-controls">
        ${InstallButton()}
        ${ThemeToggle(state.personalization)}
        <button class="desktop-settings-button" data-open-settings type="button" aria-label="Open settings">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"></path></svg>
        </button>
      </div>
      <div class="nav-dock">
        ${mobileProfileControl(state)}
        ${Navbar(route === 'class' ? 'schedule' : route)}
        <button class="global-help-button" data-open-help type="button" aria-label="Open Atlas help">?</button>
      </div>
      ${DeveloperTools.render(state, now, route)}
      ${settingsOpen ? SettingsPanel(state, settingsMessage) : ''}
      ${profileOpen ? ProfilePanel(state) : ''}
      ${helpOpen ? HelpPanel() : ''}
      ${syncReviewOpen ? SyncReviewPanel() : ''}`;

    app.querySelectorAll('#main-content > .confirm-screen, #main-content > .image-source-screen, #main-content > .note-upload-screen').forEach((overlay) => {
      app.append(overlay);
    });

    enhanceSelects(app);
    enhanceDatePickers(app);
    enhanceTimePickers(app);

    app.querySelectorAll('#settings-screen, #profile-screen, #help-screen, #sync-review-screen, .confirm-screen, .image-source-screen, .note-upload-screen')
      .forEach((overlay) => {
        if (previouslyOpenOverlays.has(overlay.id)) overlay.classList.add('is-visible');
        else openOverlay(overlay);
      });

    const atmosphere = app.querySelector('.atlas-atmosphere');
    if (atmosphere) {
      const main = app.querySelector('#main-content');
      const anchors = [main.querySelector(':scope > .page-header'), ...main.querySelectorAll('.path-section')].filter(Boolean);
      const plates = [...atmosphere.querySelectorAll('.cosmic-plate')];
      const labels = [...atmosphere.querySelectorAll('.coordinate-label')];
      const anchorFor = (index, count) => anchors[Math.round(index * Math.max(0, anchors.length - 1) / Math.max(1, count - 1))];
      const savedLayout = atmosphereLayouts.get(route);
      plates.forEach((plate, index) => {
        const anchor = anchorFor(index, plates.length);
        if (!anchor) return;
        const top = savedLayout?.plates?.[index] ?? (anchor.offsetTop + (index ? 110 : 42));
        plate.style.top = `${top}px`;
        main.append(plate);
      });
      const labelsPerAnchor = new Map();
      labels.forEach((label, index) => {
        const anchor = anchorFor(index, labels.length);
        if (!anchor) return;
        const anchorCount = labelsPerAnchor.get(anchor) || 0;
        labelsPerAnchor.set(anchor, anchorCount + 1);
        const top = savedLayout?.labels?.[index] ?? (anchor.offsetTop + 24 + anchorCount * 24);
        label.style.top = `${top}px`;
        main.append(label);
      });
      if (!savedLayout) atmosphereLayouts.set(route, {
        plates: plates.map((plate) => Number.parseFloat(plate.style.top)),
        labels: labels.map((label) => Number.parseFloat(label.style.top)),
      });
      atmosphere.remove();
    }

    const atmospherePlates = [...app.querySelectorAll('.cosmic-plate')];
    if (!animateAtmosphere) {
      atmospherePlates.forEach((plate) => plate.classList.add('is-drawing', 'is-settled'));
    } else if (!transitioning && !document.documentElement.classList.contains('atlas-welcoming')) {
      // Commit the hidden start frame, then draw immediately. Visibility
      // observers caused first entrances to wait until unrelated layout work.
      drawAtmosphere();
    }

    app.querySelectorAll('[data-route]').forEach((button) => {
      button.addEventListener('click', () => this.go(button.dataset.route));
    });

    app.querySelector('[data-theme-switch]')?.addEventListener('click', (event) => {
      Store.set({ personalization: savePersonalization({ ...state.personalization, activeThemeId: event.currentTarget.dataset.themeSwitch }) });
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
    app.querySelectorAll('[data-theme-preset]').forEach((button) => button.addEventListener('click', () => {
      suppressPageAnimation = true;
      suppressNextStoreRender = true;
      app.querySelectorAll('[data-theme-preset]').forEach((item) => item.classList.toggle('is-active', item === button));
      Store.set({ personalization: savePersonalization({ ...state.personalization, activeThemeId: button.dataset.themePreset }) });
    }));
    app.querySelectorAll('.settings-pill').forEach((pill) => pill.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      const rect = pill.getBoundingClientRect();
      const buttons = pill.querySelectorAll('button');
      buttons[event.clientX < rect.left + rect.width / 2 ? 0 : 1]?.click();
    }));
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
      applyPersonalization(Store.get().personalization);
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
        const { requestSignIn } = await import('./cloud/auth.js?v=2');
        await requestSignIn(String(data.get('email') || '').trim());
      } catch (error) {
        Store.set({ account: { ...Store.get().account, error: error.message, message: '' } });
      }
    });
    document.getElementById('google-sign-in')?.addEventListener('click', async () => {
      suppressPageAnimation = true;
      try {
        const { requestGoogleSignIn } = await import('./cloud/auth.js?v=2');
        await requestGoogleSignIn();
      } catch (error) {
        Store.set({ account: { ...Store.get().account, error: error.message, message: '' } });
      }
    });
    document.getElementById('show-email-sign-in')?.addEventListener('click', (event) => {
      event.currentTarget.hidden = true;
      const emailOption = document.getElementById('account-email-option');
      emailOption?.removeAttribute('hidden');
      document.getElementById('atlas-account-email')?.focus();
    });
    document.getElementById('sign-out-atlas')?.addEventListener('click', async () => {
      suppressPageAnimation = true;
      try {
        const { signOut } = await import('./cloud/auth.js?v=2');
        await signOut();
        window.location.reload();
      } catch (error) {
        Store.set({ account: { ...Store.get().account, error: error.message, message: '' } });
      }
    });
    document.getElementById('profile-name-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      suppressPageAnimation = true;
      try {
        const data = new FormData(event.currentTarget);
        const { updateDisplayName } = await import('./cloud/auth.js?v=2');
        await updateDisplayName(data.get('displayName'));
      } catch (error) {
        Store.set({ account: { ...Store.get().account, error: error.message, message: '' } });
      }
    });
    const previewProfileColors = (form) => {
      const preview = { id: 'preview', name: '', mode: 'custom', colors: Object.fromEntries(['accent', 'highlight', 'background', 'transition1', 'transition2', 'transition3'].map((name) => [name, form.elements[name].value])) };
      applyPersonalization({ ...state.personalization, activeThemeId: 'preview', savedThemes: [...(state.personalization.savedThemes || []), preview] });
    };
    app.querySelectorAll('[data-color-trigger]').forEach((button) => button.addEventListener('click', () => {
      const panel = button.closest('[data-color-control]').querySelector('.atlas-color-panel');
      app.querySelectorAll('.atlas-color-panel:not([hidden])').forEach((other) => { if (other !== panel) other.hidden = true; });
      panel.hidden = !panel.hidden;
    }));
    app.querySelectorAll('[data-color-value]').forEach((button) => button.addEventListener('click', () => {
      const control = button.closest('[data-color-control]');
      const input = control.querySelector('input[name]');
      input.value = button.dataset.colorValue;
      control.querySelector('[data-color-hex]').value = input.value;
      control.querySelector('[data-color-trigger]').style.setProperty('--color-preview', input.value);
      previewProfileColors(input.form);
    }));
    app.querySelectorAll('[data-color-hex]').forEach((input) => input.addEventListener('input', () => {
      if (!/^#[0-9a-f]{6}$/i.test(input.value)) return;
      const control = input.closest('[data-color-control]');
      const valueInput = control.querySelector('input[name]');
      valueInput.value = input.value.toLowerCase();
      control.querySelector('[data-color-trigger]').style.setProperty('--color-preview', valueInput.value);
      previewProfileColors(valueInput.form);
    }));
    app.querySelectorAll('[data-color-wheel]').forEach((input) => input.addEventListener('input', () => {
      const control = input.closest('[data-color-control]');
      const valueInput = control.querySelector('input[name]');
      valueInput.value = input.value.toLowerCase();
      control.querySelector('[data-color-hex]').value = valueInput.value;
      control.querySelector('[data-color-trigger]').style.setProperty('--color-preview', valueInput.value);
      previewProfileColors(valueInput.form);
    }));
    app.querySelectorAll('.atlas-color-done').forEach((button) => button.addEventListener('click', () => { button.closest('.atlas-color-panel').hidden = true; }));
    document.getElementById('profile-theme-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const savedTheme = { id: `custom-${Date.now()}`, name: String(data.get('themeName') || '').trim(), mode: 'custom', colors: Object.fromEntries(['accent', 'highlight', 'background', 'transition1', 'transition2', 'transition3'].map((name) => [name, data.get(name)])) };
      Store.set({ personalization: savePersonalization({
        ...state.personalization,
        activeThemeId: savedTheme.id,
        savedThemes: [...(state.personalization.savedThemes || []), savedTheme],
        draftColors: savedTheme.colors,
      }) });
    });
    app.querySelectorAll('[data-saved-theme]').forEach((button) => button.addEventListener('click', () => {
      suppressNextStoreRender = true;
      app.querySelectorAll('[data-saved-theme]').forEach((item) => item.classList.toggle('is-active', item === button));
      Store.set({ personalization: savePersonalization({ ...state.personalization, activeThemeId: button.dataset.savedTheme }) });
    }));
    app.querySelectorAll('[data-focus-mode]').forEach((button) => button.addEventListener('click', () => {
      suppressPageAnimation = true;
      suppressNextStoreRender = true;
      app.querySelectorAll('[data-focus-mode]').forEach((item) => item.classList.toggle('is-active', item === button));
      Store.set({ personalization: savePersonalization({ ...state.personalization, focusMode: button.dataset.focusMode === 'true' }) });
    }));
    app.querySelectorAll('[data-opening-page]').forEach((button) => button.addEventListener('click', () => {
      suppressPageAnimation = true;
      suppressNextStoreRender = true;
      const openingPage = button.dataset.openingPage === 'schedule' ? 'schedule' : 'home';
      app.querySelectorAll('[data-opening-page]').forEach((item) => item.classList.toggle('is-active', item === button));
      Store.set({ personalization: savePersonalization({ ...state.personalization, openingPage }) });
    }));
    document.getElementById('sync-atlas-now')?.addEventListener('click', async () => {
      suppressPageAnimation = true;
      try {
        const { checkSyncNow } = await import('./sync/sync.js?v=5');
        await checkSyncNow();
        this.render();
      } catch (error) {
        console.error('Atlas sync check failed.', error);
      }
    });
    const cancelSyncReview = async () => {
      await closeOverlay(document.getElementById('sync-review-screen'));
      const { cancelSyncReview } = await import('./sync/sync.js?v=5');
      cancelSyncReview();
      syncReviewOpen = false;
      this.render();
    };
    document.getElementById('cancel-sync-review')?.addEventListener('click', cancelSyncReview);
    document.querySelector('[data-cancel-sync-review]')?.addEventListener('click', cancelSyncReview);
    document.getElementById('confirm-safe-sync')?.addEventListener('click', async () => {
      try {
        const { confirmSyncReview } = await import('./sync/sync.js?v=5');
        await closeOverlay(document.getElementById('sync-review-screen'));
        syncReviewOpen = false;
        await confirmSyncReview();
        this.render();
      } catch (error) {
        console.error('Atlas sync failed.', error);
      }
    });
    document.querySelectorAll('#sync-review-form input[value="local"]').forEach((input) => { input.checked = true; });
    document.getElementById('sync-review-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const choices = {};
      new FormData(event.currentTarget).forEach((value, key) => { choices[key.replace('conflict-', '')] = value; });
      try {
        const { confirmSyncReview } = await import('./sync/sync.js?v=5');
        await closeOverlay(document.getElementById('sync-review-screen'));
        syncReviewOpen = false;
        await confirmSyncReview(choices);
        this.render();
      } catch (error) {
        console.error('Atlas conflict resolution failed.', error);
      }
    });

    routes[route].bind?.(this, state, now, context);
    animateLayoutChange(app.querySelector('#main-content'), previousLayout);
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
    document.querySelectorAll('[data-countdown-start]').forEach((element) => {
      const now = getNow(Store.get().timeOverride);
      const seconds = Math.max(0, minutesFromTime(element.dataset.countdownStart) * 60 - (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()));
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      element.textContent = `${hours ? `${hours}h ` : ''}${String(minutes).padStart(hours ? 2 : 1, '0')}m ${String(seconds % 60).padStart(2, '0')}s`;
    });
  },
};

export default Router;
