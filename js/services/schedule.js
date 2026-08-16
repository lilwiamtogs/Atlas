import { readStoredJson, writeStoredJson } from './storage.js';

const SCHEDULE_URL = './data/defaultSchedule.json';
const IMPORTED_SCHEDULE_KEY = 'atlas.schedule';

function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeClass(item, index) {
  const required = ['id', 'code', 'title', 'day', 'start', 'end', 'room'];
  const missing = required.filter((key) => item?.[key] === undefined);

  if (missing.length) {
    throw new Error(`Class ${index + 1} is missing: ${missing.join(', ')}`);
  }

  if (!Number.isInteger(item.day) || item.day < 0 || item.day > 6) {
    throw new Error(`Class ${item.id} has an invalid day.`);
  }

  if (!isTime(item.start) || !isTime(item.end) || item.start >= item.end) {
    throw new Error(`Class ${item.id} has an invalid time range.`);
  }

  return {
    id: String(item.id),
    code: String(item.code),
    title: String(item.title),
    day: item.day,
    start: item.start,
    end: item.end,
    room: String(item.room),
    instructor: String(item.instructor || ''),
  };
}

export function normalizeSchedule(data) {
  if (!data || !Array.isArray(data.classes)) {
    throw new Error('Schedule data must contain a classes array.');
  }

  const classes = data.classes.map(normalizeClass).sort((a, b) =>
    a.day - b.day || a.start.localeCompare(b.start)
  );
  const ids = new Set(classes.map((item) => item.id));
  if (ids.size !== classes.length) throw new Error('Every class entry needs a unique ID.');

  return {
    course: String(data.course || ''),
    yearLevel: String(data.yearLevel || ''),
    semester: String(data.semester || ''),
    classes,
  };
}

function readImportedSchedule() {
  return readStoredJson(IMPORTED_SCHEDULE_KEY, null, normalizeSchedule);
}

export async function loadSchedule() {
  const imported = readImportedSchedule();
  if (imported) {
    return { schedule: normalizeSchedule(imported), source: 'Imported image · saved on this device' };
  }

  const response = await fetch(SCHEDULE_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Schedule request failed (${response.status}).`);

  const data = await response.json();
  return { schedule: normalizeSchedule(data), source: SCHEDULE_URL.replace('./', '') };
}

export const scheduleSource = 'data/defaultSchedule.json';

export function saveImportedSchedule(data) {
  const schedule = normalizeSchedule(data);
  return writeStoredJson(IMPORTED_SCHEDULE_KEY, schedule);
}

export function removeImportedSchedule() {
  localStorage.removeItem(IMPORTED_SCHEDULE_KEY);
}
