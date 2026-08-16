import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

class TestFileReader extends EventTarget {
  result = null;
  error = null;
  async readAsDataURL(blob) {
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
      this.result = `data:${blob.type};base64,${btoa(binary)}`;
      this.dispatchEvent(new Event('load'));
    } catch (error) {
      this.error = error;
      this.dispatchEvent(new Event('error'));
    }
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.FileReader = TestFileReader;

const { prepareSharedFiles } = await import('../js/services/sharedFiles.js');
const { loadNotes, saveNotes } = await import('../js/services/notes.js');

test('migrates duplicate PDFs to one hash reference and hydrates them for the UI', async () => {
  const content = 'data:application/pdf;base64,JVBERi0xLjQ=';
  const note = {
    id: 'note-1', classId: 'class-1', name: 'Reviewer', fileName: 'reviewer.pdf',
    content, mimeType: 'application/pdf', createdAt: '2026-08-17T00:00:00.000Z',
  };
  localStorage.setItem('atlas.notes', JSON.stringify([note]));
  localStorage.setItem('atlas.scheduleArchives', JSON.stringify([{
    id: 'archive-1', name: 'Semester', savedAt: '2026-08-17T00:00:00.000Z',
    schedule: { semester: 'One', classes: [] },
    plannerData: { tasks: [], notes: [{ ...note, id: 'archived-note' }], exams: [] },
  }]));

  const result = await prepareSharedFiles();
  assert.equal(result.migrated, true);

  const storedNotes = JSON.parse(localStorage.getItem('atlas.notes'));
  const storedArchives = JSON.parse(localStorage.getItem('atlas.scheduleArchives'));
  assert.equal(storedNotes[0].content, undefined);
  assert.equal(storedArchives[0].plannerData.notes[0].content, undefined);
  assert.equal(storedNotes[0].fileRef.hash, storedArchives[0].plannerData.notes[0].fileRef.hash);

  const hydrated = loadNotes();
  assert.equal(hydrated[0].content, content);
  saveNotes(hydrated);
  assert.equal(JSON.parse(localStorage.getItem('atlas.notes'))[0].content, undefined);
});
