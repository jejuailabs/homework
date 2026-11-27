import assert from 'node:assert/strict';
import {LogInputError, logInput, maskName, summaryMaterial} from './policy';

const today = '2026-11-25';
assert.deepEqual(logInput({studentId: 's1', body: ' 친구를 도와줌 ', kind: 'praise'}, today), {studentId: 's1', date: today, kind: 'praise', body: '친구를 도와줌', attachmentIds: []});
assert.equal(logInput({studentId: 's1', body: 'x', kind: 'weird'}, today).kind, 'note');
assert.equal(logInput({studentId: 's1', attachmentIds: ['abcdefghijkl1234']}, today).body, '', 'a file alone is a record');
assert.throws(() => logInput({studentId: 's1'}, today), LogInputError);
assert.throws(() => logInput({body: 'x'}, today), /학생/);
assert.throws(() => logInput({studentId: 's1', body: 'x', date: '2026-11-26'}, today), /날짜/, 'no future dates');
assert.throws(() => logInput({studentId: 's1', body: 'x', date: '2026-02-30'}, today), /날짜/);
assert.throws(() => logInput({studentId: 's1', body: 'x', attachmentIds: ['../etc']}, today), /파일/);

assert.equal(maskName('김민수가 발표함. 민수는 꼼꼼함.', '김민수'), '이 학생가 발표함. 이 학생는 꼼꼼함.');
assert.equal(maskName('이솔이 도와줌', '이솔'), '이 학생이 도와줌');
const material = summaryMaterial([{date: '2026-03-02', label: '칭찬', text: '김민수 발표'}, {date: '2026-05-01', label: '관찰', text: '모둠 활동\n주도'}], '김민수');
assert.equal(material, '[2026-03-02] (칭찬) 이 학생 발표\n[2026-05-01] (관찰) 모둠 활동 주도');
assert.equal(summaryMaterial([{date: '2026-01-01', label: 'a', text: 'old'}, {date: '2026-02-01', label: 'a', text: 'new'}], '홍길동', 30), '[2026-02-01] (a) new', 'the newest records win the budget');
console.log('student-log policy tests passed');
