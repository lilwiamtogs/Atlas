const DATABASE_NAME = 'atlas-files';
const DATABASE_VERSION = 1;
const FILE_STORE = 'files';
const MIGRATION_KEY = 'atlas.sharedFilesVersion';
const preparedContent = new Map();
let databasePromise;

function openDatabase() {
  if (!('indexedDB' in globalThis)) return Promise.resolve(null);
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener('upgradeneeded', () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FILE_STORE)) database.createObjectStore(FILE_STORE, { keyPath: 'hash' });
    });
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error || new Error('Atlas could not open shared file storage.')), { once: true });
  });
  return databasePromise;
}

function requestResult(request, message) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error || new Error(message)), { once: true });
  });
}

function transactionDone(transaction, message) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error || new Error(message)), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error || new Error(message)), { once: true });
  });
}

function blobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')), { once: true });
    reader.addEventListener('error', () => reject(new Error('Atlas could not prepare a shared PDF.')), { once: true });
    reader.readAsDataURL(blob);
  });
}

function dataUrlBlob(value) {
  const match = String(value || '').match(/^data:(application\/pdf);base64,(.+)$/s);
  if (!match) throw new Error('A saved PDF has an invalid format.');
  const binary = atob(match[2]);
  return new Blob([Uint8Array.from(binary, (character) => character.charCodeAt(0))], { type: match[1] });
}

async function sha256(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function storeSharedPdf(blob) {
  if (blob.type !== 'application/pdf') throw new Error('Only PDF files can use shared file storage.');
  const database = await openDatabase();
  if (!database) return null;
  const hash = await sha256(blob);
  const transaction = database.transaction(FILE_STORE, 'readwrite');
  await requestResult(transaction.objectStore(FILE_STORE).put({ hash, blob, size: blob.size, mimeType: blob.type }), 'Atlas could not save a shared PDF.');
  await transactionDone(transaction, 'Atlas could not finish saving a shared PDF.');
  const content = await blobDataUrl(blob);
  preparedContent.set(hash, content);
  return { hash, size: blob.size, mimeType: blob.type };
}

export async function getSharedPdfBlob(fileRef) {
  if (!fileRef?.hash) return null;
  const database = await openDatabase();
  if (!database) return null;
  const record = await requestResult(database.transaction(FILE_STORE).objectStore(FILE_STORE).get(fileRef.hash), 'Atlas could not read a shared PDF.');
  return record?.blob || null;
}

export function hydrateStoredPdf(note) {
  if (note?.mimeType !== 'application/pdf' || typeof note.content === 'string') return note;
  const content = preparedContent.get(note.fileRef?.hash);
  if (!content) throw new Error(`The shared PDF for ${note?.name || 'a note'} is unavailable.`);
  return { ...note, content };
}

export function serializePdfNote(note) {
  if (note?.mimeType !== 'application/pdf' || !note.fileRef?.hash) return note;
  const copy = { ...note };
  delete copy.content;
  return copy;
}

async function prepareNote(note) {
  if (note?.mimeType !== 'application/pdf') return note;
  if (note.fileRef?.hash) {
    const blob = await getSharedPdfBlob(note.fileRef);
    if (!blob) throw new Error(`The shared PDF for ${note.name || 'a note'} is missing.`);
    preparedContent.set(note.fileRef.hash, await blobDataUrl(blob));
    return serializePdfNote(note);
  }
  if (typeof note.content !== 'string') throw new Error(`The PDF ${note.name || ''} has no saved content.`);
  const fileRef = await storeSharedPdf(dataUrlBlob(note.content));
  if (!fileRef) return note;
  return serializePdfNote({ ...note, fileRef });
}

async function prepareNotes(notes = []) {
  return Promise.all(notes.map(prepareNote));
}

export async function prepareSharedFiles() {
  if (!('indexedDB' in globalThis)) return { migrated: false, supported: false };
  const previousVersion = localStorage.getItem(MIGRATION_KEY);
  const rawNotes = localStorage.getItem('atlas.notes');
  const rawArchives = localStorage.getItem('atlas.scheduleArchives');
  const notes = rawNotes ? JSON.parse(rawNotes) : [];
  const archives = rawArchives ? JSON.parse(rawArchives) : [];
  if (!Array.isArray(notes) || !Array.isArray(archives)) return { migrated: false, supported: true };

  const preparedNotes = await prepareNotes(notes);
  const preparedArchives = [];
  for (const archive of archives) {
    const copy = structuredClone(archive);
    if (copy.plannerData?.notes) copy.plannerData.notes = await prepareNotes(copy.plannerData.notes);
    preparedArchives.push(copy);
  }
  localStorage.setItem('atlas.notes', JSON.stringify(preparedNotes));
  localStorage.setItem('atlas.scheduleArchives', JSON.stringify(preparedArchives));
  localStorage.setItem(MIGRATION_KEY, String(DATABASE_VERSION));
  return { migrated: previousVersion !== String(DATABASE_VERSION), supported: true };
}
