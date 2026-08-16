import Store from '../store.js';
import { saveImportedSchedule } from '../services/schedule.js';
import { saveTasks } from '../services/tasks.js';
import { saveNotes } from '../services/notes.js';
import { saveExams } from '../services/exams.js';
import { saveArchives } from '../services/scheduleArchives.js';
import { loadTasks } from '../services/tasks.js';
import { loadNotes } from '../services/notes.js';
import { loadExams } from '../services/exams.js';
import { loadArchives } from '../services/scheduleArchives.js';
import { loadPersonalization, savePersonalization } from '../services/personalization.js';
import { loadNotificationSettings, saveNotificationSettings } from '../services/notifications.js';
import { loadAutoSaveSettings, saveAutoSaveSettings } from '../services/autosave.js';

const RECOVERY_KEY = 'atlas.syncRecovery';
const LOCAL_KEYS = ['atlas.schedule', 'atlas.tasks', 'atlas.notes', 'atlas.exams', 'atlas.scheduleArchives', 'atlas.personalization', 'atlas.notifications', 'atlas.autosave'];

function captureLocalValues() {
  return Object.fromEntries(LOCAL_KEYS.map((key) => [key, localStorage.getItem(key)]));
}

function restoreLocalValues(values) {
  LOCAL_KEYS.forEach((key) => {
    if (values[key] === null || values[key] === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, values[key]);
  });
}

export function applyLocalSnapshot(snapshot) {
  const previous = captureLocalValues();
  localStorage.setItem(RECOVERY_KEY, JSON.stringify({ createdAt: new Date().toISOString(), values: previous }));
  try {
    const schedule = saveImportedSchedule(snapshot.schedule);
    const tasks = saveTasks(snapshot.tasks || []);
    const notes = saveNotes(snapshot.notes || []);
    const exams = saveExams(snapshot.exams || []);
    const archives = saveArchives(snapshot.archives || []);
    const personalization = savePersonalization(snapshot.personalization || {});
    const notificationSettings = saveNotificationSettings(snapshot.notificationSettings?.enabled === true);
    const autoSaveSettings = saveAutoSaveSettings(snapshot.autoSaveSettings || {});
    Store.set({ schedule, tasks, notes, exams, archives, personalization, notificationSettings, autoSaveSettings, scheduleSource: 'Cloud sync · saved on this device', scheduleError: '' });
    return { schedule, tasks, notes, exams, archives, personalization, notificationSettings, autoSaveSettings };
  } catch (error) {
    restoreLocalValues(previous);
    throw new Error(`Atlas restored your previous local data because syncing could not be completed: ${error.message}`);
  }
}

export function rollBackLastSync() {
  const recovery = JSON.parse(localStorage.getItem(RECOVERY_KEY) || 'null');
  if (!recovery?.values) return;
  restoreLocalValues(recovery.values);
  const schedule = recovery.values['atlas.schedule'] ? JSON.parse(recovery.values['atlas.schedule']) : Store.get().schedule;
  Store.set({ schedule, tasks: loadTasks(), notes: loadNotes(), exams: loadExams(), archives: loadArchives(), personalization: savePersonalization(loadPersonalization()), notificationSettings: loadNotificationSettings(), autoSaveSettings: loadAutoSaveSettings() });
}
