import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {TeacherPointLedgerEntry} from '../points-types';
import {comparePointHistory, parsePointHistoryCursor, pointHistoryBoundary, pointHistoryCursor} from './points-history';

const row = {createdAt: '2026-10-19T01:00:00.000Z', studentId: 's2', id: 'entry2'} as TeacherPointLedgerEntry;
test('history cursor is scoped to the authorized class and selected student', () => {
  const cursor = pointHistoryCursor('class1', '', row);
  assert.deepEqual(parsePointHistoryCursor(cursor, 'class1', ''), row);
  assert.equal(parsePointHistoryCursor(null, 'class1', ''), null);
  for (const [value, cls, student] of [[cursor, 'class2', ''], [cursor, 'class1', 's1'], ['!!!', 'class1', ''], ['a'.repeat(2049), 'class1', ''], [Buffer.from(JSON.stringify({classId: 'class1', studentFilter: '', createdAt: 'bad'})).toString('base64url'), 'class1', '']]) {
    assert.throws(() => parsePointHistoryCursor(value, cls, student), (e: any) => e.code === 'INVALID_CURSOR');
  }
});

test('merged history pagination preserves equal-time rows across students without gaps or duplicates', () => {
  const rows = ['s1', 's2', 's3'].flatMap(studentId => Array.from({length: 55}, (_, i) => ({...row, studentId, id: `entry${String(i).padStart(3, '0')}`, createdAt: i < 50 ? row.createdAt : '2026-10-18T01:00:00.000Z'})));
  const expected = [...rows].sort(comparePointHistory), seen: TeacherPointLedgerEntry[] = [];
  let cursor: typeof row | null = null;
  do {
    const position: TeacherPointLedgerEntry | null = cursor;
    const pages: TeacherPointLedgerEntry[] = ['s1', 's2', 's3'].flatMap(studentId => {
      const boundary = position ? pointHistoryBoundary(position, studentId) : null;
      return rows.filter(item => {
        if (item.studentId !== studentId || !position || !boundary) return item.studentId === studentId;
        if (item.createdAt !== position.createdAt) return item.createdAt < position.createdAt;
        return boundary.inclusive || (boundary.values.length === 2 && item.id < position.id);
      }).sort(comparePointHistory).slice(0, 41);
    }).sort(comparePointHistory);
    const page = pages.slice(0, 40);
    seen.push(...page); cursor = pages.length > 40 ? page.at(-1)! : null;
  } while (cursor);
  assert.deepEqual(seen, expected);
  assert.equal(new Set(seen.map(item => `${item.studentId}:${item.id}`)).size, rows.length);
});
