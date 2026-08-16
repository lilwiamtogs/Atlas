import test from 'node:test';
import assert from 'node:assert/strict';

import { getClassState, minutesFromTime } from '../js/utils/time.js';

test('minutesFromTime converts a 24-hour time', () => {
  assert.equal(minutesFromTime('13:45'), 825);
});

test('getClassState finds the current class and next future class', () => {
  const classes = [
    { id: 'current', day: 1, start: '09:00', end: '10:00' },
    { id: 'next', day: 1, start: '11:00', end: '12:00' },
  ];
  const result = getClassState(classes, new Date(2026, 7, 17, 9, 30));
  assert.equal(result.current.id, 'current');
  assert.equal(result.next.id, 'next');
});

test('getClassState rolls next occurrence into the following week', () => {
  const classes = [{ id: 'weekly', day: 1, start: '09:00', end: '10:00' }];
  const result = getClassState(classes, new Date(2026, 7, 17, 10, 0));
  assert.equal(result.current, null);
  assert.equal(result.next.id, 'weekly');
});
