import { readStoredJson, writeStoredJson } from './storage.js';

const EXAMS_KEY = 'atlas.exams';
export const EXAM_TYPES = ['Prelims', 'Midterms', 'Finals'];

export function subjectInitials(subject = {}) {
  const code = String(subject.code || '').trim().toUpperCase().replace(/\s+/g, '');
  if (code) return code;
  const initials = String(subject.title || '')
    .trim()
    .split(/\s+/)
    .filter((word) => !/^(and|of|the|to|in|for)$/i.test(word))
    .map((word) => word.match(/[A-Za-z0-9]/)?.[0] || '')
    .join('')
    .toUpperCase();
  return initials || 'CLASS';
}

export function examTitle(examType, subject) {
  if (!EXAM_TYPES.includes(examType)) throw new Error('Choose Prelims, Midterms, or Finals.');
  return `${examType} · ${subjectInitials(subject)}`;
}

function normalizeExam(exam) {
  if (!exam?.id || !exam.classId || !exam.title || !/^\d{4}-\d{2}-\d{2}$/.test(exam.date || '')) {
    throw new Error('A test is missing its class, title, or date.');
  }

  return {
    id: String(exam.id),
    classId: String(exam.classId),
    title: String(exam.title).trim(),
    examType: EXAM_TYPES.includes(exam.examType) ? exam.examType : '',
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

export function createExam({ classId, title, examType, subject, date }) {
  return normalizeExam({
    id: globalThis.crypto?.randomUUID?.() || `exam-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    classId,
    title: examType ? examTitle(examType, subject) : title,
    examType,
    date,
    createdAt: new Date().toISOString(),
  });
}
