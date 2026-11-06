import assert from 'node:assert/strict';
import {exhibitionDateLabel} from './exhibition-date';

// 15:30 UTC is already the next day in Seoul.
assert.equal(exhibitionDateLabel('2026-11-05T15:30:00Z'), '2026년 11월 6일');
assert.match(exhibitionDateLabel('2026-11-05T15:30:00Z', 'ko', true), /^2026년 11월 6일 오전 12:30$/);
assert.match(exhibitionDateLabel('2026-11-06T04:14:00Z', 'ko', true), /오후 1:14$/);
assert.match(exhibitionDateLabel('2026-11-06T04:14:00Z', 'en', true), /Nov 6, 2026.*1:14/);
assert.equal(exhibitionDateLabel(''), '');
assert.equal(exhibitionDateLabel(undefined), '');
assert.equal(exhibitionDateLabel('not a date'), '');
