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

const { getStorageIssues, readStoredJson, writeStoredJson } = await import('../js/services/storage.js');

test('preserves malformed JSON and records a storage issue', () => {
  localStorage.setItem('atlas.tasks', '{broken');
  assert.deepEqual(readStoredJson('atlas.tasks', []), []);
  assert.equal(localStorage.getItem('atlas.recovery.corrupt.tasks'), '{broken');
  assert.equal(getStorageIssues()[0].key, 'atlas.tasks');
});

test('a valid write clears the recorded issue', () => {
  writeStoredJson('atlas.tasks', [{ id: 'safe' }]);
  assert.equal(getStorageIssues().length, 0);
  assert.equal(localStorage.getItem('atlas.tasks'), '[{"id":"safe"}]');
});
