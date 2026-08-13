import { DOCUMENT_SCHEMA_VERSION, sha256 } from './snapshot.js';

function blobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result), { once: true });
    reader.addEventListener('error', () => reject(new Error('A cloud PDF could not be restored.')), { once: true });
    reader.readAsDataURL(blob);
  });
}

async function hydrateNote(note, client, userId) {
  const copy = structuredClone(note);
  if (copy.mimeType !== 'application/pdf') return copy;
  if (typeof copy.content === 'string' && copy.content.startsWith('data:application/pdf')) return copy;
  const file = copy.cloudFile;
  if (!file?.path || !file.hash || file.path !== `${userId}/${file.hash}.pdf`) {
    throw new Error('A cloud PDF reference is invalid. Atlas left local data unchanged.');
  }
  const { data: blob, error } = await client.storage.from('atlas-note-files').download(file.path);
  if (error) throw error;
  if (await sha256(blob) !== file.hash) {
    throw new Error('A cloud PDF failed its safety check. Atlas left local data unchanged.');
  }
  copy.content = await blobDataUrl(blob);
  delete copy.cloudFile;
  return copy;
}

async function hydrateNotes(notes, client, userId) {
  return Promise.all((notes || []).map((note) => hydrateNote(note, client, userId)));
}

export async function hydrateCloudSnapshot(snapshot, client, userId) {
  const copy = structuredClone(snapshot);
  copy.notes = await hydrateNotes(copy.notes, client, userId);
  for (const archive of copy.archives || []) {
    if (archive.plannerData?.notes) {
      archive.plannerData.notes = await hydrateNotes(archive.plannerData.notes, client, userId);
    }
  }
  return copy;
}

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
  const revision = Number(data.revision);
  if (!Number.isSafeInteger(revision) || revision < 1 || !data.payload || typeof data.payload !== 'object') {
    throw new Error('The cloud backup metadata is invalid. Atlas left local data unchanged.');
  }
  return {
    schemaVersion: data.schema_version,
    revision,
    payload: data.payload,
    updatedAt: String(data.updated_at || ''),
    updatedBy: String(data.updated_by || ''),
  };
}
