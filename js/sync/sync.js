import Store from '../store.js';
import { getSupabaseClient } from '../cloud/client.js';
import { applyLocalSnapshot, rollBackLastSync } from './apply.js';
import { inspectCloudSync } from './inspect.js';
import { saveSyncMetadata } from './metadata.js';
import { hydrateCloudSnapshot, readCloudDocument } from './remote.js';
import { createCloudSnapshot, DOCUMENT_SCHEMA_VERSION } from './snapshot.js';

let pendingReview = null;
let autoSyncStarted = false;
let autoSyncTimer = 0;
let autoSyncRunning = false;
let autoSyncQueued = false;
const REVIEW_SNOOZE_KEY = 'atlas.syncReviewSnoozedUntil';

function reviewSnoozed() {
  return Date.now() < Number(sessionStorage.getItem(REVIEW_SNOOZE_KEY) || 0);
}

function setStatus(state, values = {}) {
  Store.set({ syncStatus: { state, lastSyncedAt: Store.get().syncStatus?.lastSyncedAt || '', error: '', ...values } });
}

function summaryFor(result) {
  const labels = {
    current: 'This device and the cloud already match.',
    'local-only': 'This device has changes ready for the cloud.',
    'remote-only': 'The cloud has changes ready for this device.',
    mergeable: 'Changes from both copies can be combined safely.',
    conflicted: 'Some items were changed differently and need your decision.',
    'missing-base': 'Atlas cannot prove how these two unfamiliar copies should be combined.',
  };
  return labels[result.state] || 'Atlas finished checking both copies.';
}

function changeList(base, next) {
  if (!base) return [{ type: 'replace', label: 'Complete Atlas copy' }];
  const changes = [];
  const collections = [['classes', base.schedule?.classes, next.schedule?.classes], ['tasks', base.tasks, next.tasks], ['notes', base.notes, next.notes], ['exams', base.exams, next.exams], ['archives', base.archives, next.archives]];
  collections.forEach(([label, beforeItems = [], afterItems = []]) => {
    const before = new Map(beforeItems.map((item) => [String(item.id), item]));
    const after = new Map(afterItems.map((item) => [String(item.id), item]));
    after.forEach((item, id) => changes.push({ type: before.has(id) ? (JSON.stringify(before.get(id)) === JSON.stringify(item) ? '' : 'update') : 'add', label, item: item.title || item.name || item.code || id }));
    before.forEach((item, id) => { if (!after.has(id)) changes.push({ type: 'delete', label, item: item.title || item.name || item.code || id }); });
  });
  if (JSON.stringify(base.personalization || {}) !== JSON.stringify(next.personalization || {})) {
    changes.push({ type: 'update', label: 'personalization', item: next.personalization?.themeName || 'Atlas theme' });
  }
  return changes.filter((change) => change.type);
}

function reviewFrom(result) {
  return {
    state: result.state,
    message: summaryFor(result),
    conflicts: result.conflicts.map((conflict, index) => ({ ...conflict, id: String(index) })),
    remoteUpdatedAt: result.remote?.updatedAt || '',
    changes: changeList(result.metadata.baseSnapshot, result.merged || result.local),
  };
}

function chooseConflict(snapshot, conflict, choice) {
  const selected = choice === 'remote' ? conflict.remote : conflict.local;
  if (conflict.path === '$') return selected;
  const parts = conflict.path.split('.');
  if (['personalization', 'notificationSettings', 'autoSaveSettings'].includes(parts[0])) {
    snapshot[parts[0]] = selected;
    return snapshot;
  }
  if (parts[0] === 'schedule' && parts[1] !== 'classes') {
    snapshot.schedule[parts[1]] = selected;
    return snapshot;
  }
  const collection = parts[0] === 'schedule' ? snapshot.schedule.classes : snapshot[parts[0]];
  const id = parts[0] === 'schedule' ? parts[2] : parts[1];
  const index = collection.findIndex((item) => String(item.id) === id);
  if (selected === undefined) {
    if (index >= 0) collection.splice(index, 1);
  } else if (index >= 0) collection[index] = selected;
  else collection.push(selected);
  return snapshot;
}

async function writeResolved(result, cloudSnapshot) {
  const client = await getSupabaseClient();
  const latest = await readCloudDocument(client, result.metadata.userId);
  if ((latest?.revision || 0) !== (result.remote?.revision || 0)) {
    throw new Error('The cloud changed while you were reviewing. Atlas left both copies unchanged; check again.');
  }
  const payload = await createCloudSnapshot(Store.get(), result.metadata.userId, client);
  const now = new Date().toISOString();
  const revision = (latest?.revision || 0) + 1;
  let response;
  if (latest) {
    response = await client.from('atlas_documents').update({
      schema_version: DOCUMENT_SCHEMA_VERSION, revision, payload, updated_at: now, updated_by: result.metadata.deviceId,
    }).eq('user_id', result.metadata.userId).eq('revision', latest.revision).select('revision').maybeSingle();
    if (!response.error && !response.data) throw new Error('The cloud changed before Atlas finished saving.');
  } else {
    response = await client.from('atlas_documents').insert({
      user_id: result.metadata.userId, schema_version: DOCUMENT_SCHEMA_VERSION, revision, payload, updated_at: now, updated_by: result.metadata.deviceId,
    });
  }
  if (response.error) throw response.error;
  saveSyncMetadata({ ...result.metadata, revision, lastSyncedAt: now, baseSnapshot: payload });
  setStatus('synced', { lastSyncedAt: now });
}

async function applyAndWrite(result, cloudSnapshot) {
  const client = await getSupabaseClient();
  // Upload any new local PDFs before hydrating a merge that references them.
  await createCloudSnapshot(Store.get(), result.metadata.userId, client);
  const localSnapshot = await hydrateCloudSnapshot(cloudSnapshot, client, result.metadata.userId);
  applyLocalSnapshot(localSnapshot);
  try {
    await writeResolved(result, cloudSnapshot);
  } catch (error) {
    rollBackLastSync();
    throw error;
  }
}

function snapshotIsEmpty(snapshot) {
  return !(snapshot.schedule?.classes?.length
    || snapshot.tasks?.length
    || snapshot.notes?.length
    || snapshot.exams?.length
    || snapshot.archives?.length);
}

function localCopyIsFresh(snapshot) {
  const hasPersonalData = snapshot.tasks?.length
    || snapshot.notes?.length
    || snapshot.exams?.length
    || snapshot.archives?.length;
  return !hasPersonalData && !localStorage.getItem('atlas.schedule');
}

async function applyRemoteOnly(result) {
  const client = await getSupabaseClient();
  const localSnapshot = await hydrateCloudSnapshot(result.remote.payload, client, result.metadata.userId);
  applyLocalSnapshot(localSnapshot);
  const now = new Date().toISOString();
  saveSyncMetadata({
    ...result.metadata,
    revision: result.remote.revision,
    lastSyncedAt: now,
    baseSnapshot: result.remote.payload,
  });
  setStatus('synced', { lastSyncedAt: now });
}

async function runAutomaticSync() {
  if (autoSyncRunning) {
    autoSyncQueued = true;
    return;
  }
  if (!navigator.onLine || Store.get().account?.status !== 'signed-in' || pendingReview || reviewSnoozed()) return;
  autoSyncRunning = true;
  setStatus('checking');
  try {
    const inspectedRevision = Store.get().plannerRevision;
    const result = await inspectCloudSync();
    if (Store.get().plannerRevision !== inspectedRevision) {
      autoSyncQueued = true;
      return;
    }
    if (result.state === 'current') {
      const now = new Date().toISOString();
      saveSyncMetadata({ ...result.metadata, revision: result.remote?.revision || 0, lastSyncedAt: now, baseSnapshot: result.local });
      setStatus('synced', { lastSyncedAt: now });
    } else if (result.state === 'local-only') {
      setStatus('syncing');
      await writeResolved(result, result.local);
    } else if (result.state === 'remote-only'
      || (result.state === 'missing-base' && (snapshotIsEmpty(result.local) || localCopyIsFresh(result.local)))) {
      setStatus('syncing');
      await applyRemoteOnly(result);
    } else if (result.state === 'mergeable') {
      setStatus('syncing');
      await applyAndWrite(result, result.merged);
    } else {
      pendingReview = result;
      window.dispatchEvent(new CustomEvent('atlas:sync-review'));
      setStatus('review');
    }
  } catch (error) {
    setStatus(navigator.onLine ? 'error' : 'offline', { error: error.message });
    console.error('Atlas automatic sync failed.', error);
  } finally {
    autoSyncRunning = false;
    if (autoSyncQueued) {
      autoSyncQueued = false;
      queueAutomaticSync(250);
    }
  }
}

export function queueAutomaticSync(delay = 900) {
  window.clearTimeout(autoSyncTimer);
  autoSyncTimer = window.setTimeout(runAutomaticSync, delay);
}

export function startAutomaticSync() {
  if (autoSyncStarted) return;
  autoSyncStarted = true;
  let previousRevision = Store.get().plannerRevision;
  let previousUserId = Store.get().account?.user?.id || '';
  Store.subscribe((state) => {
    const dataChanged = state.plannerRevision !== previousRevision;
    const userId = state.account?.user?.id || '';
    const signedInNow = state.account?.status === 'signed-in' && userId && userId !== previousUserId;
    previousRevision = state.plannerRevision;
    previousUserId = userId;
    if (dataChanged || signedInNow) queueAutomaticSync(dataChanged ? 100 : 250);
  });
  window.addEventListener('online', () => queueAutomaticSync(250));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') queueAutomaticSync(250);
  });
  queueAutomaticSync(100);
}

export function getPendingSyncReview() {
  return pendingReview ? reviewFrom(pendingReview) : null;
}

export function cancelSyncReview() {
  pendingReview = null;
  sessionStorage.setItem(REVIEW_SNOOZE_KEY, String(Date.now() + 5 * 60 * 1000));
  setStatus('ready');
}

export async function checkSyncNow() {
  sessionStorage.removeItem(REVIEW_SNOOZE_KEY);
  setStatus('checking');
  try {
    const result = await inspectCloudSync();
    if (result.state === 'current') {
      const now = new Date().toISOString();
      saveSyncMetadata({ ...result.metadata, revision: result.remote?.revision || 0, lastSyncedAt: now, baseSnapshot: result.local });
      setStatus('synced', { lastSyncedAt: now });
      return { immediate: true, state: 'current' };
    }
    pendingReview = result;
    setStatus('review');
    return { immediate: false, state: result.state };
  } catch (error) {
    setStatus(navigator.onLine ? 'error' : 'offline', { error: error.message });
    throw error;
  }
}

export async function confirmSyncReview(choices = {}) {
  if (!pendingReview) throw new Error('Check cloud sync again before continuing.');
  const result = pendingReview;
  setStatus('syncing');
  try {
    let resolved = structuredClone(result.merged || result.local);
    if (result.state === 'missing-base') {
      const choice = choices['0'];
      if (!choice) throw new Error('Choose which complete copy to keep.');
      resolved = structuredClone(choice === 'remote' ? result.remote.payload : result.local);
    } else {
      result.conflicts.forEach((conflict, index) => {
        const choice = choices[String(index)];
        if (!choice) throw new Error('Choose a version for every conflict.');
        resolved = chooseConflict(resolved, conflict, choice);
      });
    }
    await applyAndWrite(result, resolved);
    pendingReview = null;
  } catch (error) {
    setStatus(navigator.onLine ? 'error' : 'offline', { error: error.message });
    throw error;
  }
}
