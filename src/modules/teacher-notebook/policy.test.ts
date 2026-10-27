import assert from 'node:assert/strict';
import {accessConfig, entryInput, findMentions, mentionQuery, monthRange, notebookAllowed, notebookDate, recentAuthentication, reportCsv, reportRange, unlockToken, verifyUnlock, UNLOCK_SECONDS} from './policy';

const roster = [
  {id: 'c1', name: '3-1', students: [{id: 's1', name: '김민준', number: 1}, {id: 's2', name: '김민준호', number: 2}, {id: 's3', name: '이서연', number: 3}]},
  {id: 'c2', name: '3-2', students: [{id: 's9', name: '이서연', number: 4}, {id: 's8', name: '박지우', number: 5}]},
];

assert.equal(notebookDate('2026-10-27'), '2026-10-27');
assert.throws(() => notebookDate('2026-02-30'));
assert.throws(() => notebookDate('26-10-27'));
assert.deepEqual(monthRange('2026-02'), {from: '2026-02-01', to: '2026-02-28'});
assert.deepEqual(monthRange('2028-02'), {from: '2028-02-01', to: '2028-02-29'});
assert.throws(() => monthRange('2026-13'));
assert.throws(() => reportRange('2026-10-02', '2026-10-01'));
assert.throws(() => reportRange('2025-01-01', '2026-10-01'));

const entry = entryInput({date: '2026-10-27', body: ' 발표 적극적\r\n', students: [{classId: 'c1', studentId: 's1'}, {classId: 'c1', studentId: 's1'}], tags: ['life', 'learning', 'life']});
assert.equal(entry.body, '발표 적극적');
assert.equal(entry.students.length, 1, 'duplicate students collapse');
assert.deepEqual(entry.tags, ['learning', 'life'], 'tags keep catalog order');
assert.equal(entry.sensitive, false);
assert.equal(entryInput({date: '2026-10-27', body: '병원 다녀옴', tags: ['health']}).sensitive, true, 'health is always sensitive');
assert.equal(entryInput({date: '2026-10-27', body: '메모', sensitive: true}).sensitive, true);
assert.throws(() => entryInput({date: '2026-10-27', body: '   '}));
assert.throws(() => entryInput({date: '2026-10-27', body: 'x'.repeat(4001)}));
assert.throws(() => entryInput({date: '2026-10-27', body: 'x', tags: ['secret']}));
assert.throws(() => entryInput({date: '2026-10-27', body: 'x', students: [{classId: 'c/1', studentId: 's1'}]}));

const mentions = findMentions('@김민준 발표 좋음. @김민준호가 도움. @박지우랑 놀이, @이서연 결석, 메일 a@b.com', roster);
assert.deepEqual(mentions.found, [{classId: 'c1', studentId: 's1'}, {classId: 'c1', studentId: 's2'}, {classId: 'c2', studentId: 's8'}]);
assert.deepEqual(mentions.ambiguous, ['이서연'], 'same name in two classes is left to the teacher');
assert.deepEqual(findMentions('@김민준이 오늘', roster).found, [{classId: 'c1', studentId: 's1'}], 'a particle may follow the name');
assert.deepEqual(findMentions('@김민준씨', roster).found, [], 'other text glued to the name does not match');

assert.deepEqual(mentionQuery('오늘 @김민', 7), {start: 3, query: '김민'});
assert.equal(mentionQuery('오늘 @김민 발표', 10), null, 'a space ends the mention');
assert.equal(mentionQuery('mail a@b', 8), null, 'an email address is not a mention');

assert.deepEqual(accessConfig(undefined), {mode: 'off', teacherUids: []});
assert.equal(notebookAllowed(accessConfig(undefined), 't1', 'teacher'), false, 'off by default');
assert.equal(notebookAllowed(accessConfig(undefined), 'a1', 'superadmin'), true);
assert.equal(notebookAllowed(accessConfig({mode: 'allowlist', teacherUids: ['t1']}), 't1', 'teacher'), true);
assert.equal(notebookAllowed(accessConfig({mode: 'allowlist', teacherUids: ['t1']}), 't2', 'teacher'), false);
assert.equal(notebookAllowed(accessConfig({mode: 'all'}), 't2', 'student'), false);
assert.equal(notebookAllowed(accessConfig({mode: 'all'}), 'a1', 'admin', 'true'), false, 'kill switch wins');

const key = Buffer.alloc(32, 7), other = Buffer.alloc(32, 8), at = 1_800_000_000;
const token = unlockToken(key, 'teacher1', at);
assert.equal(verifyUnlock(key, token.value, 'teacher1', at + 10), at + UNLOCK_SECONDS);
assert.equal(verifyUnlock(key, token.value, 'teacher2', at + 10), null, 'bound to the teacher');
assert.equal(verifyUnlock(other, token.value, 'teacher1', at + 10), null, 'signed by the server key');
assert.equal(verifyUnlock(key, token.value, 'teacher1', at + UNLOCK_SECONDS), null, 'expires');
assert.equal(verifyUnlock(key, token.value.replace(String(at + UNLOCK_SECONDS), String(at + UNLOCK_SECONDS + 999)), 'teacher1', at), null, 'expiry cannot be extended');
assert.equal(verifyUnlock(key, undefined, 'teacher1', at), null);
assert.equal(recentAuthentication(at - 200, at), true);
assert.equal(recentAuthentication(at - 400, at), false);
assert.equal(recentAuthentication('x', at), false);

const csv = reportCsv([{id: 'e1', date: '2026-10-27', body: '=SUM(A1) "따옴표"', students: [{classId: 'c1', studentId: 's1'}], tags: ['learning'], sensitive: false, createdAt: '', updatedAt: ''}], new Map([['c1_s1', '김민준']]), {learning: '학습'});
assert.ok(csv.startsWith('﻿'));
assert.ok(csv.includes(`"'=SUM(A1) ""따옴표"""`), 'formulas are neutralized and quotes escaped');
assert.ok(csv.includes('"김민준"'));
console.log('teacher notebook policy tests passed');
