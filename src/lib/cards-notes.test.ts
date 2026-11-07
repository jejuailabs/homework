import assert from 'node:assert/strict';
import {NOTE_STUDENT_PER_HOUR, notePreview, noteRate, noteText, sortThreads} from './cards-notes';

assert.equal(noteText('  안녕하세요\r\n\r\n\r\n\r\n선생님  '), '안녕하세요\n\n선생님', 'trimmed, blank lines squeezed');
assert.equal(noteText('   '), null); assert.equal(noteText(3), null);
assert.equal(noteText('가'.repeat(500))?.length, 500); assert.equal(noteText('가'.repeat(501)), null, '500 characters at most');
assert.equal(notePreview('첫 줄\n둘째 줄'), '첫 줄 둘째 줄');
assert.equal([...notePreview('가'.repeat(80))].length, 60);
const now = 10 * 3600_000;
const nine = Array.from({length: NOTE_STUDENT_PER_HOUR - 1}, (_, index) => now - index * 1000);
assert.equal(noteRate(nine, now).allowed, true);
assert.equal(noteRate([...nine, now - 5000], now).allowed, false, 'ten in the last hour is the limit');
assert.deepEqual(noteRate([now - 3600_001, now - 10, 'x', now + 5000], now).kept, [now - 10], 'older than an hour, broken or future stamps are dropped');
const threads = [{studentId: 'a', name: 'A', number: 3, lastAt: '2026-11-01', lastFrom: 'teacher' as const, preview: '', unread: 0}, {studentId: 'b', name: 'B', number: 1, lastAt: null, lastFrom: null, preview: '', unread: 0}, {studentId: 'c', name: 'C', number: 2, lastAt: '2026-10-01', lastFrom: 'student' as const, preview: '', unread: 2}];
assert.deepEqual(sortThreads(threads).map(thread => thread.studentId), ['c', 'a', 'b'], 'unread first, then the latest, then by number');
console.log('cards notes tests ok');
