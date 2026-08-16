import { reportStorageIssue } from './storage.js';

export const LOCAL_DATA_VERSION = 1;
const VERSION_KEY = 'atlas.dataVersion';
const MIGRATION_BACKUP_KEY = 'atlas.recovery.preMigration';
const PLANNER_KEYS = [
  'atlas.schedule',
  'atlas.tasks',
  'atlas.notes',
  'atlas.exams',
  'atlas.scheduleArchives',
  'atlas.personalization',
  'atlas.notifications',
  'atlas.autosave',
  'atlas.sync',
];

const migrations = {
  // Version 1 records the existing v0.4 data contract. Current normalizers
  // already accept the legacy shapes, so no record rewrite is needed.
  1() {},
};

function savedVersion() {
  const raw = localStorage.getItem(VERSION_KEY);
  if (raw === null) return 0;
  const version = Number(raw);
  if (!Number.isSafeInteger(version) || version < 0) throw new Error('The local data version is invalid.');
  return version;
}

function capturePlannerData() {
  return Object.fromEntries(PLANNER_KEYS.map((key) => [key, localStorage.getItem(key)]));
}

export function runLocalDataMigrations() {
  let version;
  try {
    version = savedVersion();
  } catch (error) {
    reportStorageIssue(VERSION_KEY, error);
    return { version: 0, migrated: false };
  }

  if (version > LOCAL_DATA_VERSION) {
    reportStorageIssue(VERSION_KEY, new Error('This Atlas data was created by a newer app version.'));
    return { version, migrated: false };
  }
  if (version === LOCAL_DATA_VERSION) return { version, migrated: false };

  const backup = { createdAt: new Date().toISOString(), fromVersion: version, values: capturePlannerData() };
  try {
    localStorage.setItem(MIGRATION_BACKUP_KEY, JSON.stringify(backup));
    for (let next = version + 1; next <= LOCAL_DATA_VERSION; next += 1) {
      const migrate = migrations[next];
      if (!migrate) throw new Error(`Atlas is missing local data migration ${next}.`);
      migrate();
      localStorage.setItem(VERSION_KEY, String(next));
    }
    return { version: LOCAL_DATA_VERSION, migrated: true };
  } catch (error) {
    reportStorageIssue(VERSION_KEY, error, MIGRATION_BACKUP_KEY);
    return { version, migrated: false };
  }
}
