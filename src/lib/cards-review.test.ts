import assert from 'node:assert/strict';
import {CARD_MISS_LIMIT, cardAddDays, cardMastery, cardMissList, cardReviewDate, cardReviewState, cardReviewStates, cardWeekStart, dueCardIds, nextCardReview, recordCardMisses, summarizeCardMisses} from './cards-logic';

const day0 = '2026-11-02'; // a Monday
assert.equal(cardReviewDate(Date.parse('2026-11-06T15:30:00Z')), '2026-11-07', 'review dates follow Seoul, not UTC');
assert.equal(cardAddDays('2026-12-30', 3), '2027-01-02');
assert.equal(cardWeekStart('2026-11-08'), '2026-11-02', 'Sunday belongs to the week that began on Monday');
assert.equal(cardWeekStart(day0), day0);

// First answers.
assert.deepEqual(nextCardReview(undefined, true, day0), {l: 1, b: 0, d: '2026-11-03'}, 'a first correct answer is 씨앗, due tomorrow');
assert.deepEqual(nextCardReview(undefined, false, day0), {l: 0, b: 0, d: '2026-11-03'}, 'a first miss starts at 0, due tomorrow');

// Same day: at most 새싹.
let state = nextCardReview(undefined, true, day0);
state = nextCardReview(state, true, day0);
assert.deepEqual(state, {l: 2, b: 0, d: '2026-11-03'}, 'a second correct answer the same day is 새싹');
assert.deepEqual(nextCardReview(state, true, day0), state, 'cramming the same day cannot reach 잎');

// Spaced reviews raise the level and widen the interval: 1, 3, 7, 14, 30 days.
state = nextCardReview(state, true, '2026-11-03');
assert.deepEqual(state, {l: 3, b: 1, d: '2026-11-06'}, 'a due review answered right is 잎, next in 3 days');
assert.deepEqual(nextCardReview(state, true, '2026-11-04'), state, 'an early correct answer at 잎 changes nothing');
state = nextCardReview(state, true, '2026-11-07');
assert.deepEqual(state, {l: 4, b: 2, d: '2026-11-14'}, 'late is still due: 꽃, next in 7 days');
state = nextCardReview(nextCardReview(nextCardReview(state, true, '2026-11-14'), true, '2026-11-28'), true, '2026-12-28');
assert.deepEqual(state, {l: 4, b: 4, d: '2027-01-27'}, 'levels stop at 꽃 and intervals at 30 days');

// A miss never lowers the level; it only brings the card back tomorrow.
const missed = nextCardReview(state, false, '2027-01-05');
assert.deepEqual(missed, {l: 4, b: 0, d: '2027-01-06'}, 'a miss keeps 꽃 and resets the interval');
assert.deepEqual(nextCardReview(missed, true, '2027-01-06'), {l: 4, b: 1, d: '2027-01-09'}, 'the next due answer climbs the intervals again');

// Old or broken stored values.
assert.equal(cardReviewState(null), null);
assert.equal(cardReviewState({l: 2, b: 1}), null, 'no date means never answered');
assert.deepEqual(cardReviewState({l: 9, b: -3, d: day0}), {l: 4, b: 0, d: day0}, 'out-of-range numbers are clamped');
assert.deepEqual(cardReviewStates({a: {l: 1, b: 0, d: day0}, b: 'junk', c: {d: 'tomorrow'}}), {a: {l: 1, b: 0, d: day0}});
assert.deepEqual(cardReviewStates(undefined), {}, 'old progress records have no states');

// Set mastery.
const states = {a: {l: 4, b: 2, d: '2026-11-10'}, b: {l: 2, b: 0, d: day0}, c: {l: 0, b: 0, d: '2026-11-01'}};
assert.deepEqual(cardMastery(['a', 'b', 'c', 'd'], states, day0), {percent: 38, levels: [2, 0, 1, 0, 1], due: 2}, 'percent is the average level out of 4; due counts dates up to today');
assert.deepEqual(cardMastery([], states, day0), {percent: 0, levels: [0, 0, 0, 0, 0], due: 0});
assert.deepEqual(cardMastery(['a'], {gone: {l: 4, b: 0, d: day0}}, day0).percent, 0, 'states of cards outside the set do not count');
assert.deepEqual(dueCardIds(['a', 'b', 'c', 'd'], states, day0), ['c', 'b'], 'the longest-waiting card comes first');
assert.deepEqual(dueCardIds(['a', 'b', 'c'], states, day0, 1), ['c']);

// The miss index.
let misses = recordCardMisses(undefined, 'd1', ['x', 'y', 'x'], [], day0);
assert.deepEqual(misses, {d1: {x: day0, y: day0}}, 'a miss is recorded once with its date');
misses = recordCardMisses(misses, 'd2', ['x'], [], '2026-11-10');
assert.deepEqual(misses, {d2: {x: '2026-11-10'}, d1: {x: day0, y: day0}}, 'the same card id in another set is a different miss');
misses = recordCardMisses(misses, 'd1', ['y'], ['x'], '2026-11-10');
assert.deepEqual(misses, {d1: {y: '2026-11-10'}, d2: {x: '2026-11-10'}}, 'a review clears a card; a new miss moves its date');
assert.deepEqual(recordCardMisses(misses, 'd3', [], [], cardAddDays('2026-11-10', 29)), {}, 'misses older than four weeks drop out');
assert.deepEqual(recordCardMisses({d1: 'junk', d2: {a: 'bad', b: day0}}, 'd3', [], [], day0), {d2: {b: day0}}, 'malformed entries are dropped');
const crowded = recordCardMisses({old: Object.fromEntries(Array.from({length: CARD_MISS_LIMIT}, (_, index) => [`c${index}`, day0]))}, 'new', ['n1', 'n2'], [], '2026-11-03');
assert.equal(Object.values(crowded).reduce((total, cards) => total + Object.keys(cards).length, 0), CARD_MISS_LIMIT, 'the index never grows past its limit');
assert.deepEqual(Object.keys(crowded.new), ['n1', 'n2'], 'the newest misses are the ones kept');

const index = {d1: {a: '2026-11-03', b: '2026-10-28'}, d2: {c: '2026-11-04'}, closed: {z: '2026-11-04'}};
assert.deepEqual(cardMissList(index, '2026-11-05').map(row => row.cardId), ['z', 'c', 'a', 'b'], 'newest misses first, ties in set order');
assert.deepEqual(cardMissList(index, '2026-11-05', new Set(['d1', 'd2'])).map(row => row.cardId), ['c', 'a', 'b'], 'sets the student can no longer open are left out');
assert.deepEqual(cardMissList(index, '2026-11-05', undefined, '2026-10-26').map(row => row.cardId), ['b'], 'one week only');
assert.deepEqual(summarizeCardMisses(index, '2026-11-05', new Set(['d1', 'd2'])), {total: 3, weeks: [{week: '2026-11-02', count: 2}, {week: '2026-10-26', count: 1}]}, 'weekly groups, newest week first');
assert.deepEqual(summarizeCardMisses(undefined, day0), {total: 0, weeks: []});
console.log('cards review tests passed');
