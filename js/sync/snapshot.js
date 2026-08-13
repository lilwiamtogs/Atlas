const DOCUMENT_SCHEMA_VERSION = 1;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function dataUrlBlob(value) {
  const match = String(value || '').match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error('A PDF note could not be prepared for backup.');
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}

export async function sha256(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function cloudNote(note, userId, client, uploadedPaths, upload) {
  const copy = clone(note);
  if (copy.mimeType !== 'application/pdf') return copy;

  const blob = dataUrlBlob(copy.content);
  const hash = await sha256(blob);
  const path = `${userId}/${hash}.pdf`;
  if (upload && !uploadedPaths.has(path)) {
    const { error } = await client.storage
      .from('atlas-note-files')
      .upload(path, blob, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
    uploadedPaths.add(path);
  }
  delete copy.content;
  copy.cloudFile = { path, hash, size: blob.size };
  return copy;
}

async function cloudNotes(notes, userId, client, uploadedPaths, upload) {
  return Promise.all((notes || []).map((note) => cloudNote(note, userId, client, uploadedPaths, upload)));
}

async function buildCloudSnapshot(state, userId, client, upload) {
  const uploadedPaths = new Set();
  const archives = [];
  for (const archive of state.archives || []) {
    const copy = clone(archive);
    if (copy.plannerData?.notes) {
      copy.plannerData.notes = await cloudNotes(copy.plannerData.notes, userId, client, uploadedPaths, upload);
    }
    archives.push(copy);
  }

  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    schedule: clone(state.schedule || { semester: '', classes: [] }),
    tasks: clone(state.tasks || []),
    notes: await cloudNotes(state.notes || [], userId, client, uploadedPaths, upload),
    exams: clone(state.exams || []),
    archives,
    personalization: clone(state.personalization || {}),
    notificationSettings: clone(state.notificationSettings || {}),
    autoSaveSettings: clone(state.autoSaveSettings || {}),
  };
}

export function createComparableSnapshot(state, userId) {
  return buildCloudSnapshot(state, userId, null, false);
}

export function createCloudSnapshot(state, userId, client) {
  return buildCloudSnapshot(state, userId, client, true);
}

export { DOCUMENT_SCHEMA_VERSION };
