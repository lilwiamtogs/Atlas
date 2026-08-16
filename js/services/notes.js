import { readStoredJson, writeStoredJson } from './storage.js';
import { hydrateStoredPdf, serializePdfNote, storeSharedPdf } from './sharedFiles.js';

const NOTES_KEY = 'atlas.notes';
export const MAX_NOTE_BYTES = 500 * 1024;
export const MAX_PDF_BYTES = 2 * 1024 * 1024;

function normalizeNote(note) {
  const hydrated = hydrateStoredPdf(note);
  if (!hydrated?.id || !hydrated.classId || !hydrated.name || typeof hydrated.content !== 'string') {
    throw new Error('A note is missing its class, name, or text content.');
  }

  return {
    id: String(hydrated.id),
    classId: String(hydrated.classId),
    name: String(hydrated.name).trim(),
    fileName: String(hydrated.fileName || ''),
    content: hydrated.content,
    mimeType: String(hydrated.mimeType || 'text/plain'),
    createdAt: String(hydrated.createdAt || new Date().toISOString()),
    ...(hydrated.fileRef?.hash ? { fileRef: hydrated.fileRef } : {}),
  };
}

export function loadNotes() {
  return readStoredJson(NOTES_KEY, [], (saved) => {
    if (!Array.isArray(saved)) throw new Error('Saved notes are not a list.');
    return saved.map(normalizeNote);
  });
}

export function saveNotes(notes) {
  const normalized = notes.map(normalizeNote).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  writeStoredJson(NOTES_KEY, normalized.map(serializePdfNote));
  return normalized;
}

export function createNote({ classId, name, fileName, content, mimeType = 'text/plain' }) {
  return normalizeNote({
    id: globalThis.crypto?.randomUUID?.() || `note-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    classId,
    name,
    fileName,
    content,
    mimeType,
    createdAt: new Date().toISOString(),
  });
}

export async function readNoteFile(file) {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isText = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt');
  if (!isPdf && !isText) throw new Error('Choose a TXT or PDF file.');
  if (isPdf && file.size > MAX_PDF_BYTES) throw new Error('PDF notes must be 2 MB or smaller.');
  if (isText && file.size > MAX_NOTE_BYTES) throw new Error('TXT notes must be 500 KB or smaller.');
  if (isText) return { content: await file.text(), mimeType: 'text/plain' };

  const pdfBlob = file.type === 'application/pdf' ? file : file.slice(0, file.size, 'application/pdf');
  const content = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result), { once: true });
    reader.addEventListener('error', () => reject(new Error('Atlas could not read that PDF.')), { once: true });
    reader.readAsDataURL(pdfBlob);
  });
  const fileRef = await storeSharedPdf(pdfBlob);
  return { content, mimeType: 'application/pdf', ...(fileRef ? { fileRef } : {}) };
}
