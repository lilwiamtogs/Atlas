import { readStoredJson, writeStoredJson } from './storage.js';

const EXAMS_KEY = 'atlas.exams';
export const EXAM_TYPES = ['Prelims', 'Midterms', 'Finals'];

export function subjectInitials(subject = {}) {
  const initials = String(subject.title || '')
    .trim()
    .split(/\s+/)
    .filter((word) => !/^(and|of|the|in|for)$/i.test(word))
    .map((word) => word.match(/[A-Za-z0-9]/)?.[0] || '')
    .join('')
    .toUpperCase();
  if (initials) return initials;
  const code = (String(subject.code || '').match(/[A-Za-z]+/g) || []).join('').toUpperCase();
  return code || 'CLASS';
}

export function examTitle(examType, subject) {
  if (!EXAM_TYPES.includes(examType)) throw new Error('Choose Prelims, Midterms, or Finals.');
  return `${examType} · ${subjectInitials(subject)}`;
}

export function examLabel(exam, subject) {
  return exam?.examType ? examTitle(exam.examType, subject) : String(exam?.title || 'Exam');
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

export function updateExam(exam, { classId, examType, subject, date }) {
  return normalizeExam({
    ...exam,
    classId,
    title: examTitle(examType, subject),
    examType,
    date,
  });
}
