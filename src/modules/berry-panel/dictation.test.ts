import assert from 'node:assert/strict';
import {joinDictation} from './dictation';

assert.equal(joinDictation('', ' 오늘 3교시에 '), '오늘 3교시에');
assert.equal(joinDictation('민준이가', '결석했어'), '민준이가 결석했어');
assert.equal(joinDictation('민준이가 ', '결석했어'), '민준이가 결석했어');
assert.equal(joinDictation('그대로', '   '), '그대로');
assert.equal(joinDictation('', ''), '');
console.log('berry dictation tests passed');
