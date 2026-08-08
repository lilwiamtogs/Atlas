import Router from './router.js?v=61';
import Store from './store.js';
import { loadSchedule, scheduleSource } from './services/schedule.js';
import { hideWelcomeScreen, showWelcomeScreen } from './components/welcomeScreen.js?v=43';
import { checkReminders } from './services/notifications.js';

let renderedMinute = -1;

export default {
  async start() {
    const installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const welcomeScreen = showWelcomeScreen({ fromSplash: installed });
    const minimumWelcomeTime = new Promise((resolve) => window.setTimeout(resolve, installed ? 1800 : 1700));
    Router.init();

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

    await minimumWelcomeTime;
    await hideWelcomeScreen(welcomeScreen);
    checkReminders(Store.get(), new Date()).catch((error) => console.error('Atlas reminder check failed.', error));

    setInterval(() => {
      Router.updateClock();
      const minute = new Date().getMinutes();
      if (!Store.get().timeOverride && renderedMinute !== minute) {
        renderedMinute = minute;
        Router.render();
        checkReminders(Store.get(), new Date()).catch((error) => console.error('Atlas reminder check failed.', error));
      }
    }, 1000);
  },
};
