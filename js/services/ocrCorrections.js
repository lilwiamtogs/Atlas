const STORAGE_KEY = 'atlas.ocrCorrections.v1';
const FIELDS = ['code', 'title', 'room'];

function normalized(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}

function save(corrections) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(corrections)); } catch { /* Learning is optional. */ }
}

export function applyLearnedOcrCorrections(draft) {
  const corrections = load();
  return {
    ...draft,
    classes: (draft.classes || []).map((item) => {
      const next = { ...item };
      FIELDS.forEach((field) => {
        const key = `${field}:${normalized(item[field]).toLowerCase()}`;
        const learned = corrections[key];
        if (learned?.count >= 2 && learned.value) {
          next[field] = learned.value;
          next.uncertainFields = (next.uncertainFields || []).filter((uncertainField) => uncertainField !== field);
        }
      });
      return next;
    }),
  };
}

export function learnOcrCorrections(originalClasses = [], editedClasses = []) {
  const corrections = load();
  editedClasses.forEach((edited, index) => {
    const original = originalClasses[index];
    if (!original) return;
    FIELDS.forEach((field) => {
      const before = normalized(original[field]);
      const after = normalized(edited[field]);
      if (!before || !after || before.toLowerCase() === after.toLowerCase()) return;
      const key = `${field}:${before.toLowerCase()}`;
      const current = corrections[key];
      corrections[key] = current?.value === after
        ? { value: after, count: Math.min(20, current.count + 1) }
        : { value: after, count: 1 };
    });
  });
  save(corrections);
}
