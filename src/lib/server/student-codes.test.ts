import assert from 'node:assert/strict';
import test from 'node:test';
import {generateStudentCodes, StudentCodeCollision, withStudentCodes} from './student-codes';
import {normalizeStudentCode, validStudentCode} from '../student-entry-code';

test('new student codes have six decimal digits and stay unique within a bulk issue', () => {
  for (let round = 0; round < 20; round++) {
    const codes = generateStudentCodes(100);
    assert.equal(new Set(codes).size, 100);
    assert(codes.every(code => /^[1-9]\d{5}$/.test(code)));
  }
  let draws = 0;
  assert.deepEqual(generateStudentCodes(2, () => ++draws < 3 ? 123456 : 654321), ['123456', '654321']);
});
test('only valid new and previously issued formats are accepted without losing zeros', () => {
  assert.equal(normalizeStudentCode(' 012 345 '), '012345');
  assert(validStudentCode('012345'));
  assert(validStudentCode(normalizeStudentCode('abcd12_-xy90')));
  for (const code of ['12345', '1234567', 'ABCDEF', '１２３４５６', '12345.']) assert(!validStudentCode(code));
});
test('reservation collisions regenerate the batch; unrelated failures are never retried', async () => {
  let attempts = 0;
  const result = await withStudentCodes(2, async codes => {if (++attempts < 3) throw new StudentCodeCollision(); return codes;});
  assert.equal(attempts, 3); assert.equal(result.length, 2);
  attempts = 0;
  await assert.rejects(withStudentCodes(1, async () => {attempts++; throw new Error('permission denied');}), /permission denied/);
  assert.equal(attempts, 1);
  await assert.rejects(withStudentCodes(1, async () => {throw new StudentCodeCollision();}), /reservation exhausted/);
});
