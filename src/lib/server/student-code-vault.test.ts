import assert from 'node:assert/strict';
import test from 'node:test';
import {openStudentCode, recoverNumericStudentCodes, sealStudentCode, studentCodeBinding, studentCodeHash} from './student-code-vault';

const key = Buffer.alloc(32, 7), binding = studentCodeBinding('class-one', 'student-one', studentCodeHash('123456'));
test('teacher code vault keeps ciphertext recoverable and binds it to the class, student and code', () => {
  const sealed = sealStudentCode('123456', binding, key);
  assert.equal(openStudentCode(sealed, binding, key), '123456');
  assert(!JSON.stringify(sealed).includes('123456'));
  assert.notDeepEqual(sealStudentCode('123456', binding, key), sealed);
  assert.equal(openStudentCode(sealed, studentCodeBinding('other', 'student-one', studentCodeHash('123456')), key), null);
  assert.equal(openStudentCode(sealed, binding, Buffer.alloc(32, 8)), null);
});
test('changed or malformed vault records never reveal a code', () => {
  const sealed = sealStudentCode('123456', binding, key);
  assert.equal(openStudentCode({...sealed, data: 'x' + sealed.data.slice(1)}, binding, key), null);
  assert.equal(openStudentCode({...sealed, tag: 'bad'}, binding, key), null);
  assert.equal(openStudentCode(undefined, binding, key), null);
});
test('pre-vault six-digit hashes recover without changing the existing login code', async () => {
  const first = studentCodeHash('000005'), second = studentCodeHash('000010');
  const result = await recoverNumericStudentCodes([first, second]);
  assert.equal(result.get(first), '000005'); assert.equal(result.get(second), '000010');
  assert.equal((await recoverNumericStudentCodes(['not-a-hash'])).size, 0);
  assert.equal((await recoverNumericStudentCodes([studentCodeHash('LEGACYAB1234')], {from: 0, to: 20})).size, 0);
});
