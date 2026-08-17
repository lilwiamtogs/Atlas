import assert from 'node:assert/strict';
import test from 'node:test';

import { createExam, examLabel, examTitle, subjectInitials } from '../js/services/exams.js';

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
