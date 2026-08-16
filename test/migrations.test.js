import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

globalThis.localStorage = new MemoryStorage();

const { LOCAL_DATA_VERSION, runLocalDataMigrations } = await import('../js/services/dataMigrations.js');
const { getStorageIssues } = await import('../js/services/storage.js');

test('initial migration versions existing data and keeps a recovery snapshot', () => {
  localStorage.setItem('atlas.tasks', '[{"id":"existing"}]');
  const result = runLocalDataMigrations();
  assert.equal(result.migrated, true);
  assert.equal(result.version, LOCAL_DATA_VERSION);
  assert.equal(localStorage.getItem('atlas.dataVersion'), String(LOCAL_DATA_VERSION));

  const backup = JSON.parse(localStorage.getItem('atlas.recovery.preMigration'));
  assert.equal(backup.fromVersion, 0);
  assert.equal(backup.values['atlas.tasks'], '[{"id":"existing"}]');
});

test('migration is idempotent once the current version is installed', () => {
  const originalBackup = localStorage.getItem('atlas.recovery.preMigration');
  const result = runLocalDataMigrations();
  assert.equal(result.migrated, false);
  assert.equal(localStorage.getItem('atlas.recovery.preMigration'), originalBackup);
});

test('newer data is not downgraded or rewritten', () => {
  localStorage.setItem('atlas.dataVersion', String(LOCAL_DATA_VERSION + 1));
  const result = runLocalDataMigrations();
  assert.equal(result.migrated, false);
  assert.equal(result.version, LOCAL_DATA_VERSION + 1);
  assert.equal(getStorageIssues().some(({ key }) => key === 'atlas.dataVersion'), true);
});
