import { DOCUMENT_SCHEMA_VERSION } from './snapshot.js';

export async function readCloudDocument(client, userId) {
  const { data, error } = await client
    .from('atlas_documents')
    .select('schema_version, revision, payload, updated_at, updated_by')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.schema_version !== DOCUMENT_SCHEMA_VERSION) {
    throw new Error(`This cloud backup uses unsupported schema version ${data.schema_version}.`);
  }
  if (!Number.isSafeInteger(data.revision) || data.revision < 1 || !data.payload || typeof data.payload !== 'object') {
    throw new Error('The cloud backup metadata is invalid. Atlas left local data unchanged.');
  }
  return {
    schemaVersion: data.schema_version,
    revision: data.revision,
    payload: data.payload,
    updatedAt: String(data.updated_at || ''),
    updatedBy: String(data.updated_by || ''),
  };
}
