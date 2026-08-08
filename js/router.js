import Home from './views/home.js?v=38';
import Schedule from './views/schedule.js?v=43';
import ImportSchedule from './views/importSchedule.js?v=38';
import ClassDetail from './views/classDetail.js?v=42';
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

const routes = { home: Home, schedule: Schedule, import: ImportSchedule, class: ClassDetail };
let transitioning = false;
let settingsOpen = false;
let settingsMessage = '';
let suppressPageAnimation = false;
let shouldAnimatePage = true;

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
    const installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (installed && localStorage.getItem('atlas.tutorialComplete') === 'true' && localStorage.getItem('atlas.settingsIntroduced') !== 'true') {
      settingsOpen = true;
      localStorage.setItem('atlas.settingsIntroduced', 'true');
    }
    window.addEventListener('hashchange', () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      shouldAnimatePage = true;
      this.render();
    });
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
      if (reduceMotion) {
        window.location.hash = `#/${route}`;
        transitioning = false;
        return;
      }

      const overlay = createPageTransition();
      requestAnimationFrame(() => overlay.classList.add('is-covering'));
      await wait(430);
      window.location.hash = `#/${route}`;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      overlay.classList.add('is-revealing');
      await wait(430);
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

    document.documentElement.dataset.theme = state.theme;

    Store.get().currentView = route;
    app.innerHTML = `
      <main id="main-content" class="app-main route-${route} ${shouldAnimatePage && !suppressPageAnimation ? 'page-enter-active' : ''}">${routes[route].render(state, now, context)}</main>
      <div class="app-controls">
        ${InstallButton()}
        ${ThemeToggle(state.theme)}
        <button class="desktop-settings-button" data-open-settings type="button" aria-label="Open settings">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"></path></svg>
        </button>
      </div>
      ${Navbar(route === 'class' ? 'schedule' : route)}
      ${DeveloperTools.render(state, now, route)}
      ${settingsOpen ? SettingsPanel(state, settingsMessage) : ''}`;

    app.querySelectorAll('#main-content > .confirm-screen, #main-content > .image-source-screen').forEach((overlay) => {
      app.append(overlay);
    });

    enhanceSelects(app);

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

    routes[route].bind?.(this, state, now, context);
    DeveloperTools.bind(this);
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
