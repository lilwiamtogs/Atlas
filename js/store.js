import { loadTasks } from './services/tasks.js';
import { loadNotes } from './services/notes.js';
import { loadArchives } from './services/scheduleArchives.js';
import { loadExams } from './services/exams.js';
import { loadNotificationSettings } from './services/notifications.js';
import { loadAutoSaveSettings } from './services/autosave.js';
import { loadSyncMetadata } from './sync/metadata.js';
import { applyPersonalization, loadPersonalization } from './services/personalization.js';
import { getStorageIssues, reportStorageIssue } from './services/storage.js';
import { runLocalDataMigrations } from './services/dataMigrations.js';
import { prepareSharedFiles } from './services/sharedFiles.js';

runLocalDataMigrations();
try {
  await prepareSharedFiles();
} catch (error) {
  reportStorageIssue('atlas.sharedFiles', error);
}
const syncMetadata = loadSyncMetadata();
const personalization = applyPersonalization(loadPersonalization());
const PLANNER_KEYS = new Set(['schedule', 'tasks', 'notes', 'archives', 'exams', 'notificationSettings', 'autoSaveSettings', 'personalization']);

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
  storageIssues: getStorageIssues(),
  plannerRevision: 0,
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
    const plannerChanged = Object.keys(patch).some((key) => PLANNER_KEYS.has(key) && patch[key] !== state[key]);
    Object.assign(state, patch);
    if (plannerChanged) state.plannerRevision += 1;
    notify();
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
