import Store from '../store.js';
import { getSupabaseClient } from '../cloud/client.js';
import { ensureSyncMetadata } from './metadata.js';
import { mergeCloudSnapshots, snapshotsEqual } from './merge.js';
import { readCloudDocument } from './remote.js';
import { createComparableSnapshot } from './snapshot.js';

export function classifySnapshots(base, local, remote) {
  if (!remote) return { state: 'local-only', merged: local, conflicts: [] };
  if (snapshotsEqual(local, remote)) return { state: 'current', merged: local, conflicts: [] };
  if (!base) return {
    state: 'missing-base',
    merged: null,
    conflicts: [{ path: '$', reason: 'missing-common-base', base: null, local, remote }],
  };

  const localChanged = !snapshotsEqual(local, base);
  const remoteChanged = !snapshotsEqual(remote, base);
  if (localChanged && !remoteChanged) return { state: 'local-only', merged: local, conflicts: [] };
  if (!localChanged && remoteChanged) return { state: 'remote-only', merged: remote, conflicts: [] };

  const result = mergeCloudSnapshots(base, local, remote);
  return {
    state: result.conflicts.length ? 'conflicted' : 'mergeable',
    merged: result.snapshot,
    conflicts: result.conflicts,
  };
}

export async function inspectCloudSync() {
  if (!navigator.onLine) throw new Error('Connect to the internet before syncing Atlas.');
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const user = data.session?.user;
  if (!user) throw new Error('Sign in before syncing Atlas.');

  const metadata = ensureSyncMetadata(user.id);
  const [local, document] = await Promise.all([
    createComparableSnapshot(Store.get(), user.id),
    readCloudDocument(client, user.id),
  ]);
  const classification = classifySnapshots(metadata.baseSnapshot, local, document?.payload || null);
  return { ...classification, local, remote: document, metadata };
}
