import Home from './views/home.js?v=47';
import Schedule from './views/schedule.js?v=65';
import ImportSchedule from './views/importSchedule.js?v=62';
import ClassDetail from './views/classDetail.js?v=44';
import Navbar from './components/navbar.js';
import DeveloperTools from './components/developerTools.js';
import ThemeToggle from './components/themeToggle.js';
import InstallButton from './components/installButton.js';
import SettingsPanel from './components/settingsPanel.js';
import Store from './store.js';
import { requestNotificationAccess, saveNotificationSettings } from './services/notifications.js';
import { disableAutoSave, enableAutoSave } from './services/autosave.js';
import { formatClock, getNow } from './utils/time.js';
import enhanceSelects from './components/selectEnhancer.js?v=43';
import enhanceDatePickers from './components/datePicker.js';
import Atmosphere from './components/atmosphere.js?v=4';
import HelpPanel, { helpTopics } from './components/helpPanel.js?v=4';
import { showFirstOpenTutorial } from './components/onboarding.js?v=33';

const routes = { home: Home, schedule: Schedule, import: ImportSchedule, class: ClassDetail };
let transitioning = false;
let settingsOpen = false;
let settingsMessage = '';
let helpOpen = false;
let pendingHelpTarget = null;
let suppressPageAnimation = false;
let shouldAnimatePage = true;
const atmosphereLayouts = new Map();

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
    window.addEventListener('hashchange', () => {
      settingsOpen = false;
      helpOpen = false;
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      shouldAnimatePage = true;
      this.render();
    });
    document.getElementById('app')?.addEventListener('click', (event) => {
      if (!event.target.closest('#replay-tutorial')) return;
      event.preventDefault();
      event.stopPropagation();
      helpOpen = false;
      document.getElementById('help-screen')?.remove();
      document.getElementById('mobile-install-gate')?.remove();
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
        window.location.hash = `#/${route}`;
        transitioning = false;
        return;
      }

      if (compactScreen) {
        const overlay = createPageTransition();
        overlay.classList.add('is-mobile');
        requestAnimationFrame(() => overlay.classList.add('is-covering'));
        await wait(280);
        window.location.hash = `#/${route}`;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        overlay.classList.add('is-revealing');
        await wait(280);
        overlay.remove();
        transitioning = false;
        return;
      }

      const overlay = createPageTransition();
      requestAnimationFrame(() => overlay.classList.add('is-covering'));
      await wait(650);
      window.location.hash = `#/${route}`;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await wait(120);
      overlay.classList.add('is-revealing');
      await wait(650);
      overlay.remove();
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
      </div>
      ${DeveloperTools.render(state, now, route)}
      ${settingsOpen ? SettingsPanel(state, settingsMessage) : ''}
      ${helpOpen ? HelpPanel() : ''}`;

    app.querySelectorAll('#main-content > .confirm-screen, #main-content > .image-source-screen, #main-content > .note-upload-screen').forEach((overlay) => {
      app.append(overlay);
    });

    enhanceSelects(app);
    enhanceDatePickers(app);

    const openingOverlay = app.querySelector('#settings-screen, #help-screen');
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
      const savedAtmosphereLayout = atmosphereLayouts.get(route);
      const plateTops = [];
      plates.forEach((plate, index) => {
        const anchor = anchorFor(index, plates.length);
        if (!anchor) return;
        const top = savedAtmosphereLayout?.plates?.[index] ?? anchor.offsetTop + (index ? 110 : 42);
        plateTops.push(top);
        plate.style.top = `${top}px`;
        main.append(plate);
      });
      const labelsPerAnchor = new Map();
      const labelTops = [];
      labels.forEach((label, index) => {
        const anchor = anchorFor(index, labels.length);
        if (!anchor) return;
        const anchorCount = labelsPerAnchor.get(anchor) || 0;
        labelsPerAnchor.set(anchor, anchorCount + 1);
        const top = savedAtmosphereLayout?.labels?.[index] ?? anchor.offsetTop + 24 + anchorCount * 24;
        labelTops.push(top);
        label.style.top = `${top}px`;
        main.append(label);
      });
      if (!savedAtmosphereLayout) atmosphereLayouts.set(route, { plates: plateTops, labels: labelTops });
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
      settingsOpen = true;
      settingsMessage = '';
      this.render();
    }));
    app.querySelector('[data-open-help]')?.addEventListener('click', () => {
      suppressPageAnimation = true;
      helpOpen = true;
      this.render();
    });
    const closeHelp = () => {
      helpOpen = false;
      const screen = document.getElementById('help-screen');
      if (!screen) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        screen.remove();
        return;
      }
      screen.classList.add('is-closing');
      window.setTimeout(() => screen.remove(), 190);
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
    app.querySelectorAll('[data-help-action]').forEach((button) => button.addEventListener('click', () => {
      const topic = helpTopics[Number(button.dataset.helpAction)];
      pendingHelpTarget = topic.target;
      closeHelp();
      if (topic.settings) {
        settingsOpen = true;
        this.render();
      } else {
        this.go(topic.route);
      }
    }));
    const closeSettings = () => {
      const screen = document.getElementById('settings-screen');
      settingsOpen = false;
      if (!screen) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        screen.remove();
        return;
      }
      screen.classList.add('is-closing');
      window.setTimeout(() => screen.remove(), 190);
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
    document.getElementById('backup-atlas-now')?.addEventListener('click', async () => {
      suppressPageAnimation = true;
      try {
        const { backUpNow } = await import('./sync/backup.js');
        await backUpNow();
      } catch (error) {
        console.error('Atlas backup failed.', error);
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
