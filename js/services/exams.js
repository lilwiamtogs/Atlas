import { readStoredJson, writeStoredJson } from './storage.js';

const EXAMS_KEY = 'atlas.exams';

function normalizeExam(exam) {
  if (!exam?.id || !exam.classId || !exam.title || !/^\d{4}-\d{2}-\d{2}$/.test(exam.date || '')) {
    throw new Error('A test is missing its class, title, or date.');
  }

  return {
    id: String(exam.id),
    classId: String(exam.classId),
    title: String(exam.title).trim(),
    date: exam.date,
    createdAt: String(exam.createdAt || new Date().toISOString()),
  };
}

export function loadExams() {
  return readStoredJson(EXAMS_KEY, [], (saved) => {
    if (!Array.isArray(saved)) throw new Error('Saved tests are not a list.');
    return saved.map(normalizeExam).sort((a, b) => a.date.localeCompare(b.date));
  });
}

export function saveExams(exams) {
  const normalized = exams.map(normalizeExam).sort((a, b) => a.date.localeCompare(b.date));
  return writeStoredJson(EXAMS_KEY, normalized);
}

export function createExam({ classId, title, date }) {
  return normalizeExam({
    id: globalThis.crypto?.randomUUID?.() || `exam-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    classId,
    title,
    date,
    createdAt: new Date().toISOString(),
  });
}
