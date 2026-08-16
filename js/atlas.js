import Router from './router.js';
import Store from './store.js';
import { loadSchedule, scheduleSource } from './services/schedule.js';
import { hideWelcomeScreen, showWelcomeScreen } from './components/welcomeScreen.js';
import { checkReminders } from './services/notifications.js';
import { initializeAuth } from './cloud/auth.js';

let renderedMinute = -1;

export default {
  async start() {
    const installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const welcomeScreen = showWelcomeScreen({ fromSplash: installed });
    const compactScreen = window.matchMedia('(max-width: 619px), (pointer: coarse)').matches;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const minimumWelcomeTime = new Promise((resolve) => window.setTimeout(resolve, reduceMotion ? 0 : compactScreen ? 1250 : installed ? 1400 : 1200));
    Router.init();
    const authReady = initializeAuth(Store).catch((error) => {
      console.error('Atlas account setup failed.', error);
      Store.set({
        account: { status: navigator.onLine ? 'error' : 'offline', user: null, message: '', error: 'Cloud sign-in is temporarily unavailable.' },
        syncStatus: { state: navigator.onLine ? 'error' : 'offline', lastSyncedAt: '', error: error.message },
      });
    });

    try {
      const result = await loadSchedule();
      Store.set({ schedule: result.schedule, scheduleSource: result.source, scheduleError: '' });
    } catch (error) {
      console.error('Atlas could not load its schedule.', error);
      Store.set({
        scheduleError: error.message,
        scheduleSource: scheduleSource,
      });
    }

    await authReady;
    import('./sync/sync.js')
      .then(({ startAutomaticSync }) => startAutomaticSync())
      .catch((error) => console.error('Atlas automatic sync setup failed.', error));

    await minimumWelcomeTime;
    await hideWelcomeScreen(welcomeScreen);
    Router.animateAtmosphere();
    checkReminders(Store.get(), new Date()).catch((error) => console.error('Atlas reminder check failed.', error));
    renderedMinute = new Date().getMinutes();

    setInterval(() => {
      Router.updateClock();
      const minute = new Date().getMinutes();
      if (!Store.get().timeOverride && renderedMinute !== minute) {
        renderedMinute = minute;
        checkReminders(Store.get(), new Date()).catch((error) => console.error('Atlas reminder check failed.', error));
      }
    }, 1000);
  },
};
