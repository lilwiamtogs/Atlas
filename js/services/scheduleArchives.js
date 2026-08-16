import { normalizeSchedule } from './schedule.js';
import { readStoredJson, writeStoredJson } from './storage.js';
import { hydrateStoredPdf, serializePdfNote } from './sharedFiles.js';

const ARCHIVES_KEY = 'atlas.scheduleArchives';

function normalizeArchive(entry) {
  if (!entry?.id || !entry.name || !entry.schedule) {
    throw new Error('This saved schedule is incomplete.');
  }

  const plannerData = entry.plannerData && typeof entry.plannerData === 'object' ? {
    tasks: Array.isArray(entry.plannerData.tasks) ? entry.plannerData.tasks : [],
    notes: Array.isArray(entry.plannerData.notes) ? entry.plannerData.notes.map(hydrateStoredPdf) : [],
    exams: Array.isArray(entry.plannerData.exams) ? entry.plannerData.exams : [],
  } : null;

  return {
    id: String(entry.id),
    name: String(entry.name).trim(),
    savedAt: String(entry.savedAt || new Date().toISOString()),
    schedule: normalizeSchedule(entry.schedule),
    ...(plannerData ? { plannerData } : {}),
  };
}

export function loadArchives() {
  return readStoredJson(ARCHIVES_KEY, [], (saved) => {
    if (!Array.isArray(saved)) throw new Error('Saved schedules are not a list.');
    return saved.map(normalizeArchive).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  });
}

export function saveArchives(archives) {
  const normalized = archives.map(normalizeArchive).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  const stored = normalized.map((archive) => ({
    ...archive,
    ...(archive.plannerData ? {
      plannerData: {
        ...archive.plannerData,
        notes: archive.plannerData.notes.map(serializePdfNote),
      },
    } : {}),
  }));
  writeStoredJson(ARCHIVES_KEY, stored);
  return normalized;
}

export function createArchive(name, schedule) {
  return normalizeArchive({
    id: globalThis.crypto?.randomUUID?.() || `schedule-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    savedAt: new Date().toISOString(),
    schedule,
  });
}

export function archiveNameFor(schedule) {
  return [schedule.course, schedule.yearLevel, schedule.semester]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ') || 'Saved Atlas schedule';
}

export function readArchiveFile(data, fallbackName = 'Imported schedule') {
  const schedule = data?.schedule || data;
  const name = String(data?.name || fallbackName).replace(/\.json$/i, '').trim();
  return normalizeArchive({
    ...createArchive(name, schedule),
    ...(data?.plannerData ? { plannerData: data.plannerData } : {}),
  });
}
