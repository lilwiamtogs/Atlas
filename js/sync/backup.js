import Store from '../store.js';
import { getSupabaseClient } from '../cloud/client.js';
import { createCloudSnapshot, DOCUMENT_SCHEMA_VERSION } from './snapshot.js';
import { ensureSyncMetadata, saveSyncMetadata } from './metadata.js';

function setStatus(state, values = {}) {
  Store.set({
    syncStatus: {
      state,
      lastSyncedAt: Store.get().syncStatus?.lastSyncedAt || '',
      error: '',
      ...values,
    },
  });
}

export async function backUpNow() {
  if (!navigator.onLine) {
    setStatus('offline', { error: 'Connect to the internet before backing up.' });
    throw new Error('Connect to the internet before backing up.');
  }

  setStatus('syncing');
  try {
    const client = await getSupabaseClient();
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    const user = sessionData.session?.user;
    if (!user) throw new Error('Sign in before backing up Atlas.');

    const metadata = ensureSyncMetadata(user.id);
    const { data: remote, error: readError } = await client
      .from('atlas_documents')
      .select('revision, updated_by')
      .eq('user_id', user.id)
      .maybeSingle();
    if (readError) throw readError;
    if (remote && metadata.revision !== remote.revision) {
      throw new Error('A different cloud backup already exists. Atlas left both copies unchanged. Conflict merging comes in Phase 3.');
    }

    const payload = await createCloudSnapshot(Store.get(), user.id, client);
    const now = new Date().toISOString();
    const nextRevision = (remote?.revision || 0) + 1;
    let writeError;

    if (remote) {
      const result = await client
        .from('atlas_documents')
        .update({
          schema_version: DOCUMENT_SCHEMA_VERSION,
          revision: nextRevision,
          payload,
          updated_at: now,
          updated_by: metadata.deviceId,
        })
        .eq('user_id', user.id)
        .eq('revision', remote.revision)
        .select('revision')
        .maybeSingle();
      writeError = result.error;
      if (!writeError && !result.data) throw new Error('The cloud backup changed while Atlas was saving. Nothing local was replaced.');
    } else {
      const result = await client.from('atlas_documents').insert({
        user_id: user.id,
        schema_version: DOCUMENT_SCHEMA_VERSION,
        revision: nextRevision,
        payload,
        updated_at: now,
        updated_by: metadata.deviceId,
      });
      writeError = result.error;
    }
    if (writeError) throw writeError;

    saveSyncMetadata({ ...metadata, revision: nextRevision, lastSyncedAt: now });
    setStatus('synced', { lastSyncedAt: now });
  } catch (error) {
    setStatus(navigator.onLine ? 'error' : 'offline', { error: error.message });
    throw error;
  }
}
