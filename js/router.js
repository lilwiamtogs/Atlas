import Home from './views/home.js';
import Schedule from './views/schedule.js';
import ImportSchedule from './views/importSchedule.js';
import ClassDetail from './views/classDetail.js';
import DeveloperTools from './components/developerTools.js';
import AppShell from './components/appShell.js';
import Store from './store.js';
import { requestNotificationAccess, saveNotificationSettings } from './services/notifications.js';
import { disableAutoSave, enableAutoSave } from './services/autosave.js';
import { formatClock, getNow, minutesFromTime } from './utils/time.js';
import enhanceSelects from './components/selectEnhancer.js';
import enhanceDatePickers from './components/datePicker.js';
import enhanceTimePickers from './components/timePicker.js';
import { helpTopics } from './components/helpPanel.js';
import { showFirstOpenTutorial } from './components/onboarding.js';
import { closeOverlay, openOverlay } from './utils/animations.js';
import { applyPersonalization, savePersonalization } from './services/personalization.js';

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

function elementIdentity(element) {
  if (!(element instanceof HTMLElement)) return '';
  if (element.id) return `#${CSS.escape(element.id)}`;
  const dataAttribute = [...element.attributes].find((attribute) => attribute.name.startsWith('data-') && attribute.value);
  if (dataAttribute) return `[${dataAttribute.name}="${CSS.escape(dataAttribute.value)}"]`;
  if (element.getAttribute('name')) return `[name="${CSS.escape(element.getAttribute('name'))}"]`;
  return '';
}

function captureUiContinuity(app) {
  return {
    focus: app.contains(document.activeElement) ? elementIdentity(document.activeElement) : '',
    overlayScroll: new Map([...app.querySelectorAll('[id] > [aria-modal="true"], [id][aria-modal="true"]')]
      .map((panel) => [panel.closest('[id]')?.id || panel.id, panel.scrollTop])),
  };
}

function restoreUiContinuity(app, continuity) {
  continuity.overlayScroll.forEach((scrollTop, id) => {
    const overlay = document.getElementById(id);
    const panel = overlay?.matches('[aria-modal="true"]') ? overlay : overlay?.querySelector('[aria-modal="true"]');
    if (panel) panel.scrollTop = scrollTop;
  });
  if (!continuity.focus) return;
  app.querySelector(continuity.focus)?.focus({ preventScroll: true });
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

function focusRouteContent() {
  requestAnimationFrame(() => document.getElementById('main-content')?.focus({ preventScroll: true }));
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
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const colorPanel = document.querySelector('.atlas-color-panel:not([hidden])');
      if (colorPanel) {
        event.preventDefault();
        colorPanel.hidden = true;
        const trigger = colorPanel.closest('[data-color-control]')?.querySelector('[data-color-trigger]');
        trigger?.setAttribute('aria-expanded', 'false');
        trigger?.focus();
        return;
      }
      if (document.querySelector('.atlas-time-panel:not([hidden]), [data-atlas-calendar]:not([hidden]), [data-atlas-select].is-open')) return;
      const visibleOverlay = [...document.querySelectorAll('.is-visible:not(.is-closing)')].at(-1);
      const closeButton = visibleOverlay?.querySelector('[data-overlay-close]');
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
      focusRouteContent();
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
    document.addEventListener('pointerdown', (event) => {
      if (event.target.closest('[data-color-control]')) return;
      document.querySelectorAll('.atlas-color-panel:not([hidden])').forEach((panel) => {
        panel.hidden = true;
        panel.closest('[data-color-control]')?.querySelector('[data-color-trigger]')?.setAttribute('aria-expanded', 'false');
      });
    });
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
    focusRouteContent();
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
    focusRouteContent();
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
        await wait(430);
        this.commitRoute(route);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        overlay.classList.add('is-revealing');
        await wait(430);
        overlay.remove();
        document.documentElement.classList.remove('is-page-transitioning');
        transitioning = false;
        drawAtmosphere();
        return;
      }

      const overlay = createPageTransition();
      document.documentElement.classList.add('is-page-transitioning');
      requestAnimationFrame(() => overlay.classList.add('is-covering'));
      await wait(370);
      this.commitRoute(route);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await wait(20);
      overlay.classList.add('is-revealing');
      await wait(370);
      overlay.remove();
      document.documentElement.classList.remove('is-page-transitioning');
      transitioning = false;
      drawAtmosphere();
    }
  },

  render() {
    const app = document.getElementById('app');
    const continuity = captureUiContinuity(app);
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
    app.innerHTML = AppShell({
      state,
      now,
      route,
      routeMarkup: routes[route].render(state, now, context),
      pageClass: shouldAnimatePage && !suppressPageAnimation && !transitioning ? 'page-enter-active' : '',
      settingsOpen,
      settingsMessage,
      profileOpen,
      helpOpen,
      syncReviewOpen,
    });

    app.querySelectorAll('#main-content > .confirm-screen, #main-content > .image-source-screen, #main-content > .note-upload-screen').forEach((overlay) => {
      app.append(overlay);
    });

    enhanceSelects(app);
    enhanceDatePickers(app);
    enhanceTimePickers(app);

    app.querySelectorAll('#settings-screen, #profile-screen, #help-screen, #sync-review-screen, .confirm-screen, .image-source-screen, .note-upload-screen')
      .forEach((overlay) => {
        if (previouslyOpenOverlays.has(overlay.id)) openOverlay(overlay, 0);
        else openOverlay(overlay);
      });
    restoreUiContinuity(app, continuity);

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
        const { requestSignIn } = await import('./cloud/auth.js');
        await requestSignIn(String(data.get('email') || '').trim());
      } catch (error) {
        Store.set({ account: { ...Store.get().account, error: error.message, message: '' } });
      }
    });
    document.getElementById('google-sign-in')?.addEventListener('click', async () => {
      suppressPageAnimation = true;
      try {
        const { requestGoogleSignIn } = await import('./cloud/auth.js');
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
        const { signOut } = await import('./cloud/auth.js');
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
        const { updateDisplayName } = await import('./cloud/auth.js');
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
      app.querySelectorAll('.atlas-color-panel:not([hidden])').forEach((other) => {
        if (other === panel) return;
        other.hidden = true;
        other.closest('[data-color-control]')?.querySelector('[data-color-trigger]')?.setAttribute('aria-expanded', 'false');
      });
      panel.hidden = !panel.hidden;
      button.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) panel.querySelector('input:not([type="hidden"])')?.focus();
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
    app.querySelectorAll('.atlas-color-done').forEach((button) => button.addEventListener('click', () => {
      const panel = button.closest('.atlas-color-panel');
      panel.hidden = true;
      const trigger = panel.closest('[data-color-control]')?.querySelector('[data-color-trigger]');
      trigger?.setAttribute('aria-expanded', 'false');
      trigger?.focus();
    }));
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
      syncReviewOpen = false;
      this.render();
    };
    document.getElementById('cancel-sync-review')?.addEventListener('click', cancelSyncReview);
    document.querySelector('[data-cancel-sync-review]')?.addEventListener('click', cancelSyncReview);
    document.getElementById('confirm-safe-sync')?.addEventListener('click', async () => {
      try {
        const { confirmSyncReview } = await import('./sync/sync.js');
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
        const { confirmSyncReview } = await import('./sync/sync.js');
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
        const disclosure = target.closest('details');
        if (disclosure) disclosure.open = true;
        target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
        target.classList.add('help-target-highlight');
        const focusTarget = target.matches('button, input, select, textarea, [tabindex]') ? target : target.querySelector('button, input, select, textarea, [tabindex]');
        focusTarget?.focus({ preventScroll: true });
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
