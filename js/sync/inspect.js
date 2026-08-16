import Store from '../store.js';
import { getSupabaseClient } from '../cloud/client.js';
import { ensureSyncMetadata } from './metadata.js';
import { readCloudDocument } from './remote.js';
import { createComparableSnapshot } from './snapshot.js';
import { getStorageIssues } from '../services/storage.js';
import { classifySnapshots } from './classify.js';

export { classifySnapshots } from './classify.js';

export async function inspectCloudSync() {
  const storageIssues = getStorageIssues();
  if (storageIssues.length) {
    throw new Error('Atlas found unreadable saved data on this device and paused cloud sync to protect your cloud copy.');
  }
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
