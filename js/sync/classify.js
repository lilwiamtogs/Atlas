import { mergeCloudSnapshots, snapshotsEqual } from './merge.js';

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
