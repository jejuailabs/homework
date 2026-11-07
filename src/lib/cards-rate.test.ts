import assert from 'node:assert/strict';
import {CARD_TEACHER_LIMITS, hourlyRate} from './cards-rate';

const now = 50 * 3600_000;
assert.deepEqual(hourlyRate(undefined, now, 3), {kept: [], allowed: true});
assert.equal(hourlyRate([now - 1, now - 2], now, 3).allowed, true);
assert.equal(hourlyRate([now - 1, now - 2, now - 3], now, 3).allowed, false, 'the limit is reached within the hour');
assert.deepEqual(hourlyRate([now - 3600_000, now - 5, 'x', now + 10], now, 3).kept, [now - 5], 'old, broken and future stamps are dropped');
assert.ok(Object.values(CARD_TEACHER_LIMITS).every(limit => limit >= 10), 'limits leave room for normal work');
console.log('cards rate tests ok');
