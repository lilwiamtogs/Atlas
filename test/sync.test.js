import test from 'node:test';
import assert from 'node:assert/strict';

import { classifySnapshots } from '../js/sync/classify.js';
import { mergeCloudSnapshots } from '../js/sync/merge.js';

const snapshot = (tasks = []) => ({
  schemaVersion: 1,
  schedule: { course: '', yearLevel: '', semester: '', classes: [] },
  tasks,
  notes: [],
  exams: [],
  archives: [],
  personalization: {},
  notificationSettings: {},
  autoSaveSettings: {},
});

test('classifies identical snapshots as current', () => {
  const value = snapshot();
  assert.equal(classifySnapshots(value, structuredClone(value), structuredClone(value)).state, 'current');
});

test('merges independent record additions without conflict', () => {
  const base = snapshot();
  const local = snapshot([{ id: 'local', title: 'Local' }]);
  const remote = snapshot([{ id: 'remote', title: 'Remote' }]);
  const result = mergeCloudSnapshots(base, local, remote);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(result.snapshot.tasks.map(({ id }) => id), ['local', 'remote']);
});

test('reports a conflict when both devices edit the same record', () => {
  const base = snapshot([{ id: 'one', title: 'Original' }]);
  const local = snapshot([{ id: 'one', title: 'Local edit' }]);
  const remote = snapshot([{ id: 'one', title: 'Remote edit' }]);
  const result = mergeCloudSnapshots(base, local, remote);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].path, 'tasks.one');
});

test('requires review when two copies have no common base', () => {
  assert.equal(classifySnapshots(null, snapshot([{ id: 'a' }]), snapshot([{ id: 'b' }])).state, 'missing-base');
});
