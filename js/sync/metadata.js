import { readStoredJson, writeStoredJson } from '../services/storage.js';

const SYNC_METADATA_KEY = 'atlas.sync';

function createDeviceId() {
  return globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function loadSyncMetadata() {
  return readStoredJson(SYNC_METADATA_KEY, {
    deviceId: createDeviceId(), userId: '', revision: 0, lastSyncedAt: '', baseSnapshot: null,
  }, (saved) => {
    return {
      deviceId: String(saved.deviceId || createDeviceId()),
      userId: String(saved.userId || ''),
      revision: Number.isSafeInteger(saved.revision) && saved.revision >= 0 ? saved.revision : 0,
      lastSyncedAt: String(saved.lastSyncedAt || ''),
      baseSnapshot: saved.baseSnapshot && typeof saved.baseSnapshot === 'object' ? saved.baseSnapshot : null,
    };
  });
}

export function saveSyncMetadata(metadata) {
  const normalized = {
    deviceId: String(metadata.deviceId || createDeviceId()),
    userId: String(metadata.userId || ''),
    revision: Number.isSafeInteger(metadata.revision) && metadata.revision >= 0 ? metadata.revision : 0,
    lastSyncedAt: String(metadata.lastSyncedAt || ''),
    baseSnapshot: metadata.baseSnapshot && typeof metadata.baseSnapshot === 'object' ? metadata.baseSnapshot : null,
  };
  return writeStoredJson(SYNC_METADATA_KEY, normalized);
}

export function ensureSyncMetadata(userId) {
  const metadata = loadSyncMetadata();
  if (metadata.userId && metadata.userId !== userId) {
    return saveSyncMetadata({ deviceId: metadata.deviceId, userId, revision: 0, lastSyncedAt: '', baseSnapshot: null });
  }
  return saveSyncMetadata({ ...metadata, userId });
}
