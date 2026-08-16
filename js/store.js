import { loadTasks } from './services/tasks.js';
import { loadNotes } from './services/notes.js';
import { loadArchives } from './services/scheduleArchives.js';
import { loadExams } from './services/exams.js';
import { loadNotificationSettings } from './services/notifications.js';
import { loadAutoSaveSettings } from './services/autosave.js';
import { loadSyncMetadata } from './sync/metadata.js';
import { applyPersonalization, loadPersonalization } from './services/personalization.js';

const syncMetadata = loadSyncMetadata();
const personalization = applyPersonalization(loadPersonalization());

const state = {
  schedule: { semester: '', classes: [] },
  tasks: loadTasks(),
  notes: loadNotes(),
  archives: loadArchives(),
  exams: loadExams(),
  notificationSettings: loadNotificationSettings(),
  autoSaveSettings: loadAutoSaveSettings(),
  account: { status: navigator.onLine ? 'loading' : 'offline', user: null, message: '', error: '' },
  syncStatus: { state: navigator.onLine ? (syncMetadata.lastSyncedAt ? 'synced' : 'disabled') : 'offline', lastSyncedAt: syncMetadata.lastSyncedAt, error: '' },
  scheduleSource: 'Not loaded',
  scheduleError: '',
  currentView: 'home',
  theme: localStorage.getItem('atlas.theme') === 'light' ? 'light' : 'dark',
  personalization,
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
