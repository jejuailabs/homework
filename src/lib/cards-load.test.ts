import assert from 'node:assert/strict';
import { CARD_DAY_MINUTES, CARD_SECONDS, cardDayLoad, cardEstimateMinutes, cardRemaining } from './cards-load';
import { cardTestActive, redactCardSnapshot, sealedAttempt } from './cards-guard';
import type { CardRequiredModes, CardTestAttempt } from './cards-types';

const modes = (memorize: number, recall: number, spell: number) => Object.fromEntries(Object.entries({ memorize, recall, spell }).map(([mode, requiredCount]) => [mode, { requiredCount, direction: 'front-back', rangeStart: 1, rangeEnd: 20 }])) as CardRequiredModes;
const plan = (m: number, r: number, s: number, questions = 10, maxAttempts = 3) => ({ requiredModes: modes(m, r, s), test: { questionCount: questions, maxAttempts } });

// Estimate: required × seconds per mode + test questions, rounded up to whole minutes.
assert.deepEqual(CARD_SECONDS, { memorize: 4, recall: 6, spell: 10, test: 15 });
assert.equal(cardEstimateMinutes(plan(20, 20, 0, 20)), Math.ceil((20 * 4 + 20 * 6 + 20 * 15) / 60), 'a fresh set counts every required card and the test');
assert.equal(cardEstimateMinutes(plan(0, 0, 0, 1)), 1, 'anything left reads at least a minute');
assert.equal(cardEstimateMinutes(plan(20, 20, 20, 20), { completedCounts: { memorize: 20, recall: 20, spell: 20 }, attempts: 1, goalReached: true }), 0, 'nothing left reads 0');
assert.deepEqual(cardRemaining(plan(20, 20, 10), { completedCounts: { memorize: 25, recall: 5, spell: 0 }, attempts: 0, goalReached: false }), { memorize: 0, recall: 15, spell: 10, test: 10 }, 'extra study never goes negative');
assert.equal(cardRemaining(plan(0, 0, 0, 10, 3), { attempts: 3, goalReached: false }).test, 0, 'no attempts left: the test drops out');
assert.equal(cardRemaining(plan(0, 0, 0, 10, 0), { attempts: 9 }).test, 10, 'no attempt limit keeps the test');
assert.equal(cardRemaining(plan(5, 0, 0), {}).memorize, 5, 'an old record without counts reads as nothing done');

// Today's load: open sets with work left, nearest deadline first, no deadline last; locked sets do not count.
const now = Date.parse('2026-11-07T03:00:00Z');
const row = (id: string, dueAt: string | null, p = plan(60, 60, 0, 20), extra = {}) => ({ id, title: id, dueAt, ...p, ...extra });
const load = cardDayLoad([row('later', '2026-11-20T00:00:00Z'), row('none', null), row('soon', '2026-11-08T00:00:00Z'), row('done', '2026-11-07T10:00:00Z', plan(0, 0, 0, 0)), row('locked', '2026-11-01T00:00:00Z', undefined, { afterDue: 'lock' })], now);
assert.deepEqual(load.order.map(item => item.row.id), ['soon', 'later', 'none']);
assert.equal(load.minutes, 3 * cardEstimateMinutes(plan(60, 60, 0, 20)));
assert.equal(load.heavy, load.minutes > CARD_DAY_MINUTES);
assert.equal(cardDayLoad([row('small', null, plan(10, 10, 0, 10))], now).heavy, false, 'a light day has no warning');

// Answer protection: active means started and within time (+ the 60 s grace); old attempts without a limit stay active until submitted.
const started = '2026-11-07T03:00:00.000Z', at = (seconds: number) => Date.parse(started) + seconds * 1000;
assert.equal(cardTestActive({ status: 'started', startedAt: started, timeLimitSeconds: 600 }, at(500)), true);
assert.equal(cardTestActive({ status: 'started', startedAt: started, timeLimitSeconds: 600 }, at(650)), true, 'grace still counts');
assert.equal(cardTestActive({ status: 'started', startedAt: started, timeLimitSeconds: 600 }, at(700)), false, 'past time and grace: study opens again');
assert.equal(cardTestActive({ status: 'started', startedAt: started }, at(86_400)), true, 'an old attempt without a limit stays active');
assert.equal(cardTestActive({ status: 'started' }, at(0)), true, 'even without startedAt');
assert.equal(cardTestActive({ status: 'submitted', startedAt: started, timeLimitSeconds: null }, at(1)), false);
assert.equal(cardTestActive(null), false);

const snapshot = { title: 't', description: 'd', type: 'word' as const, cards: [{ id: 'a', front: 'apple', back: '사과', example: 'An apple.', alternatives: ['능금'] }] };
assert.deepEqual(redactCardSnapshot(snapshot, 'front-back').cards, [{ id: 'a', front: 'apple', back: '', example: '', alternatives: [] }], 'word → meaning keeps only the word');
assert.deepEqual(redactCardSnapshot(snapshot, 'back-front').cards, [{ id: 'a', front: '', back: '사과', example: '', alternatives: [] }], 'meaning → word keeps only the meaning');
assert.equal(snapshot.cards[0].back, '사과', 'the stored snapshot is untouched');

const attempt: CardTestAttempt = { id: 'x', status: 'submitted', number: 1, retryWrong: false, questions: [{ id: 'q', cardId: 'a', prompt: 'apple' }], score: 100, answersVisible: true, results: [{ questionId: 'q', answer: '사과', correct: true, expectedAnswer: '사과' }], startedAt: started, submittedAt: started };
const sealed = sealedAttempt(attempt);
assert.equal(sealed.score, 100);
assert.equal(sealed.answersVisible, false);
assert.ok(!('results' in sealed) && !JSON.stringify(sealed).includes('사과'), 'own right answers wait too');
console.log('cards load and guard tests ok');
