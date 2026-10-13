import assert from 'node:assert/strict';
import test from 'node:test';
import {assignmentInPeriod, schoolYearAt} from './teacher-dashboard-period';

test('school year changes on March 1 at midnight in Seoul, not UTC', () => {
  assert.equal(schoolYearAt(Date.parse('2027-01-01T00:00:00+09:00')), 2026);
  assert.equal(schoolYearAt(Date.parse('2027-02-28T14:59:59.999Z')), 2026);
  assert.equal(schoolYearAt(Date.parse('2027-02-28T15:00:00.000Z')), 2027);
});

test('first and second semesters include their start and exclude the next start', () => {
  assert.equal(assignmentInPeriod('2026-02-28T14:59:59.999Z', 'year', 2026), false);
  assert.equal(assignmentInPeriod('2026-02-28T15:00:00.000Z', 'first', 2026), true);
  assert.equal(assignmentInPeriod('2026-07-31T14:59:59.999Z', 'first', 2026), true);
  assert.equal(assignmentInPeriod('2026-07-31T15:00:00.000Z', 'first', 2026), false);
  assert.equal(assignmentInPeriod('2026-07-31T15:00:00.000Z', 'second', 2026), true);
  assert.equal(assignmentInPeriod('2027-02-28T14:59:59.999Z', 'second', 2026), true);
  assert.equal(assignmentInPeriod('2027-02-28T15:00:00.000Z', 'second', 2026), false);
  assert.equal(assignmentInPeriod('2027-02-28T15:00:00.000Z', 'year', 2026), false);
});

test('unknown legacy creation dates remain visible in all time but never fabricate a period', () => {
  assert.equal(assignmentInPeriod(null, 'all', 2026), true);
  assert.equal(assignmentInPeriod('bad-date', 'all', 2026), true);
  for (const period of ['year', 'first', 'second'] as const) {
    assert.equal(assignmentInPeriod(null, period, 2026), false);
    assert.equal(assignmentInPeriod('bad-date', period, 2026), false);
  }
});
