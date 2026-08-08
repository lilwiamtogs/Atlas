import { normalizeSchedule } from './schedule.js';

const ARCHIVES_KEY = 'atlas.scheduleArchives';

function normalizeArchive(entry) {
  if (!entry?.id || !entry.name || !entry.schedule) {
    throw new Error('This saved schedule is incomplete.');
  }

  const plannerData = entry.plannerData && typeof entry.plannerData === 'object' ? {
    tasks: Array.isArray(entry.plannerData.tasks) ? entry.plannerData.tasks : [],
    notes: Array.isArray(entry.plannerData.notes) ? entry.plannerData.notes : [],
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
  try {
    const saved = JSON.parse(localStorage.getItem(ARCHIVES_KEY) || '[]');
    return Array.isArray(saved)
      ? saved.map(normalizeArchive).sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      : [];
  } catch {
    return [];
  }
}

export function saveArchives(archives) {
  const normalized = archives.map(normalizeArchive).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  localStorage.setItem(ARCHIVES_KEY, JSON.stringify(normalized));
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
