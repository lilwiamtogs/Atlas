import { loadTasks } from './services/tasks.js';
import { loadNotes } from './services/notes.js?v=37';
import { loadArchives } from './services/scheduleArchives.js';
import { loadExams } from './services/exams.js';
import { loadNotificationSettings } from './services/notifications.js';
import { loadAutoSaveSettings } from './services/autosave.js';

const state = {
  schedule: { semester: '', classes: [] },
  tasks: loadTasks(),
  notes: loadNotes(),
  archives: loadArchives(),
  exams: loadExams(),
  notificationSettings: loadNotificationSettings(),
  autoSaveSettings: loadAutoSaveSettings(),
  scheduleSource: 'Not loaded',
  scheduleError: '',
  currentView: 'home',
  theme: localStorage.getItem('atlas.theme') === 'light' ? 'light' : 'dark',
  timeOverride: localStorage.getItem('atlas.timeOverride') || '',
};

const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener(state));
}

export default {
  get() {
    return state;
  },

  set(patch) {
    Object.assign(state, patch);
    notify();
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
