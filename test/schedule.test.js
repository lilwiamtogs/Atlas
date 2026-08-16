import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSchedule } from '../js/services/schedule.js';
import { parseScheduleText } from '../js/services/scheduleParser.js';

test('normalizeSchedule sorts classes and rejects duplicate IDs', () => {
  const schedule = normalizeSchedule({
    semester: 'First semester',
    classes: [
      { id: 'tue', code: 'SCI102', title: 'Science', day: 2, start: '10:00', end: '11:00', room: '2' },
      { id: 'mon', code: 'MAT101', title: 'Math', day: 1, start: '08:00', end: '09:00', room: '1' },
    ],
  });
  assert.deepEqual(schedule.classes.map(({ id }) => id), ['mon', 'tue']);

  assert.throws(() => normalizeSchedule({
    classes: [
      { id: 'same', code: 'A', title: 'A', day: 1, start: '08:00', end: '09:00', room: '' },
      { id: 'same', code: 'B', title: 'B', day: 2, start: '08:00', end: '09:00', room: '' },
    ],
  }), /unique ID/);
});

test('normalizeSchedule rejects invalid and reversed time ranges', () => {
  assert.throws(() => normalizeSchedule({
    classes: [{ id: 'bad', code: 'BAD', title: 'Bad', day: 1, start: '10:00', end: '09:00', room: '' }],
  }), /invalid time range/);
});

test('schedule parser extracts a simple recurring class line', () => {
  const parsed = parseScheduleText('First Semester 2026-2027\nMonday\nMATH101 Engineering Mathematics 8:00 AM - 9:30 AM S307');
  assert.equal(parsed.documentType, 'classes');
  assert.equal(parsed.classes.length, 1);
  assert.deepEqual(
    (({ code, day, start, end, room }) => ({ code, day, start, end, room }))(parsed.classes[0]),
    { code: 'MATH101', day: 1, start: '08:00', end: '09:30', room: 'S307' },
  );
});
