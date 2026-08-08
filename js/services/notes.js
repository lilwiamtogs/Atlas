const NOTES_KEY = 'atlas.notes';
export const MAX_NOTE_BYTES = 500 * 1024;
export const MAX_PDF_BYTES = 2 * 1024 * 1024;

function normalizeNote(note) {
  if (!note?.id || !note.classId || !note.name || typeof note.content !== 'string') {
    throw new Error('A note is missing its class, name, or text content.');
  }

  return {
    id: String(note.id),
    classId: String(note.classId),
    name: String(note.name).trim(),
    fileName: String(note.fileName || ''),
    content: note.content,
    mimeType: String(note.mimeType || 'text/plain'),
    createdAt: String(note.createdAt || new Date().toISOString()),
  };
}

export function loadNotes() {
  try {
    const saved = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]');
    return Array.isArray(saved) ? saved.map(normalizeNote) : [];
  } catch {
    return [];
  }
}

export function saveNotes(notes) {
  const normalized = notes.map(normalizeNote).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  localStorage.setItem(NOTES_KEY, JSON.stringify(normalized));
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

  const content = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result), { once: true });
    reader.addEventListener('error', () => reject(new Error('Atlas could not read that PDF.')), { once: true });
    reader.readAsDataURL(file);
  });
  return { content, mimeType: 'application/pdf' };
}
