import { archiveNameFor, createArchive, saveArchives } from './scheduleArchives.js';
import { readStoredJson, writeStoredJson } from './storage.js';

const AUTOSAVE_KEY = 'atlas.autosave';

export function loadAutoSaveSettings() {
  return readStoredJson(AUTOSAVE_KEY, { enabled: false, archiveId: '' }, (saved) => {
    return { enabled: saved.enabled === true, archiveId: String(saved.archiveId || '') };
  });
}

export function saveAutoSaveSettings(settings) {
  const normalized = { enabled: settings.enabled === true, archiveId: String(settings.archiveId || '') };
  return writeStoredJson(AUTOSAVE_KEY, normalized);
}

export function hasCompleteScheduleData(schedule) {
  return Boolean(schedule?.course?.trim() && schedule?.yearLevel?.trim() && schedule?.semester?.trim() && schedule?.classes?.length);
}

export function plannerSnapshot(state) {
  return {
    tasks: state.tasks || [],
    notes: state.notes || [],
    exams: state.exams || [],
  };
}

export function updateAutoSave(state, patch = {}) {
  const settings = state.autoSaveSettings || loadAutoSaveSettings();
  if (!settings.enabled || !settings.archiveId || !hasCompleteScheduleData(state.schedule)) return null;

  const snapshotState = { ...state, ...patch };
  const existing = (snapshotState.archives || []).find((entry) => entry.id === settings.archiveId);
  const archive = existing
    ? {
        ...existing,
        name: archiveNameFor(snapshotState.schedule),
        savedAt: new Date().toISOString(),
        schedule: snapshotState.schedule,
        plannerData: plannerSnapshot(snapshotState),
      }
    : {
        ...createArchive(archiveNameFor(snapshotState.schedule), snapshotState.schedule),
        id: settings.archiveId,
        plannerData: plannerSnapshot(snapshotState),
      };
  return saveArchives([archive, ...(snapshotState.archives || []).filter((entry) => entry.id !== archive.id)]);
}

export function withAutoSave(state, patch) {
  const archives = updateAutoSave(state, patch);
  return archives ? { ...patch, archives } : patch;
}

export function enableAutoSave(state) {
  if (!hasCompleteScheduleData(state.schedule)) {
    throw new Error('Complete Course, Year level, and Semester / term in Current data first.');
  }
  const existingId = state.autoSaveSettings?.archiveId;
  const archiveId = existingId || globalThis.crypto?.randomUUID?.() || `autosave-${Date.now()}`;
  const autoSaveSettings = saveAutoSaveSettings({ enabled: true, archiveId });
  const archives = updateAutoSave({ ...state, autoSaveSettings });
  return { autoSaveSettings, archives };
}

export function disableAutoSave(state) {
  return saveAutoSaveSettings({ enabled: false, archiveId: state.autoSaveSettings?.archiveId || '' });
}
