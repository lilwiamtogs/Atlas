import assert from 'node:assert/strict';
import test from 'node:test';

import { createExam, examLabel, examTitle, subjectInitials, updateExam } from '../js/services/exams.js';

test('exam labels combine the type with the subject code', () => {
  assert.equal(examTitle('Midterms', { code: 'MATH 101' }), 'Midterms · MATH');
  assert.equal(examTitle('Prelims', { code: 'GE-JPL 1' }), 'Prelims · GEJPL');
});

test('subject initials fall back to meaningful title words', () => {
  assert.equal(subjectInitials({ title: 'Science, Technology and Society' }), 'STS');
});

test('createExam stores its type and generated label', () => {
  const exam = createExam({ classId: 'math', examType: 'Finals', subject: { code: 'MATH101' }, date: '2026-12-10' });
  assert.equal(exam.examType, 'Finals');
  assert.equal(exam.title, 'Finals · MATH');
});

test('structured saved exams display with current subject initials', () => {
  assert.equal(examLabel({ examType: 'Finals', title: 'Finals · ITCL101' }, { code: 'ITCL 101' }), 'Finals · ITCL');
  assert.equal(examLabel({ title: 'Departmental quiz' }, { code: 'ITCL 101' }), 'Departmental quiz');
});

test('createExam rejects unknown exam types', () => {
  assert.throws(() => createExam({ classId: 'math', examType: 'Quiz', subject: { code: 'MATH101' }, date: '2026-12-10' }), /Choose Prelims/);
});

test('updateExam preserves identity while changing its structured fields', () => {
  const original = createExam({ classId: 'math', examType: 'Prelims', subject: { code: 'MATH101' }, date: '2026-09-01' });
  const updated = updateExam(original, { classId: 'itc', examType: 'Midterms', subject: { code: 'ITC 201' }, date: '2026-10-15' });
  assert.equal(updated.id, original.id);
  assert.equal(updated.createdAt, original.createdAt);
  assert.equal(updated.classId, 'itc');
  assert.equal(updated.title, 'Midterms · ITC');
  assert.equal(updated.date, '2026-10-15');
});
