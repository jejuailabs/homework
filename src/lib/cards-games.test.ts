import assert from 'node:assert/strict';
import {rainCap, rainCapped, RAIN_MAX_WORDS, GAME_MAX_MS, betterRecord, buildPairTiles, buildPuzzles, checkGameResult, formatGameTime, isPair, newRain, PAIR_MAX, PAIR_PENALTY_MS, pairCount, pairEligible, pairTime, puzzleCount, puzzleEligible, puzzlePrefix, puzzleScore, puzzleSpeech, puzzleSolved, puzzleStart, rainCatch, rainFallMs, rainLevel, rainMiss, rainReady, rainScore, rainSpawnMs, rainStep, rainTarget, RAIN_LIVES, RAIN_MAX_DROPS, rankGameRows, recentPlays, sentenceChunks} from './cards-games';
import type {CardEntry} from './cards-types';

const card = (index: number, extra: Partial<CardEntry> = {}): CardEntry => ({id: `c${index}`, front: `word ${index}`, back: `뜻 ${index}`, example: '', alternatives: [], ...extra});
const cards = Array.from({length: 10}, (_, index) => card(index));
let seed = 7;
const random = (max: number) => {seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed % max;};

// Pairs
assert.equal(pairEligible([card(1), card(2, {front: 'WORD 1'}), card(3, {back: '뜻 1'}), card(4, {back: ''}), card(5, {back: 'word 5'}), card(6, {front: '뜻 1'})]).map(item => item.id).join(), 'c1', 'repeated words, repeated meanings, blanks, same-on-both-sides and cross-side repeats are left out');
const tiles = buildPairTiles(cards, random)!;
assert.equal(tiles.length, PAIR_MAX * 2, 'six pairs make twelve tiles');
assert.equal(new Set(tiles.map(tile => tile.key)).size, tiles.length, 'tile keys are unique');
for (const tile of tiles) assert.equal(tiles.filter(other => isPair(tile, other)).length, 1, 'every tile has exactly one partner');
assert.equal(isPair(tiles[0], tiles[0]), false, 'a tile is not its own pair');
assert.equal(buildPairTiles(cards.slice(0, 2), random), null, 'fewer than three pairs cannot start');
assert.equal(pairCount(cards.slice(0, 4)), 4, 'a small set plays all its pairs');
assert.equal(pairTime(30_000, 3), 30_000 + 3 * PAIR_PENALTY_MS, 'a mistake adds time');

// Chunks and puzzles
assert.deepEqual(sentenceChunks('I like to eat red apples every day'), ['I like', 'to eat', 'red', 'apples', 'every', 'day'], 'eight words become six neighbouring chunks, longest first');
assert.deepEqual(sentenceChunks('  She   is happy  '), ['She', 'is', 'happy'], 'short sentences keep one word per chunk');
assert.equal(sentenceChunks('Hello world'), null, 'two words are too short to arrange');
assert.equal(sentenceChunks('a b c d e f g h i j k l m')!.length, 6, 'long sentences still give six chunks');
assert.equal(sentenceChunks('a b c d e f g h i j k l m')!.join(' '), 'a b c d e f g h i j k l m', 'chunks keep every word in order');
const sentences = [card(1, {front: 'I am a student.', back: '나는 학생이다.'}), card(2, {front: 'i am a student.', back: '중복'}), card(3, {front: 'Hi there', back: '짧음'})];
assert.deepEqual(puzzleEligible(sentences, 'sentence').map(item => item.cardId), ['c1'], 'sentence sets arrange the front, once per sentence, long enough only');
const words = [card(1, {example: 'I eat an apple.\n나는 사과를 먹는다.'}), card(2, {example: ''}), card(3, {example: '\nThe cat sleeps here.'})];
assert.deepEqual(puzzleEligible(words, 'word').map(item => [item.cardId, item.chunks.join(' ')]), [['c1', 'I eat an apple.'], ['c3', 'The cat sleeps here.']], 'word sets arrange the first line of the example');
assert.equal(puzzleEligible(words, 'word')[0].hint, '나는 사과를 먹는다.', 'a Korean line in the example becomes the hint');
assert.equal(puzzleEligible(words, 'word')[1].hint, 'word 3 · 뜻 3', 'with no Korean line the card is the hint');
assert.equal(puzzleEligible([card(1, {example: '나는 사과를 먹는다.\n오늘 아침에.'})], 'word')[0].hint, 'word 1 · 뜻 1', 'a Korean sentence to arrange has no translation line');
assert.deepEqual(puzzleEligible(words, 'word').map(item => item.meaning), [true, false], 'only a Korean sentence counts as a meaning to translate from');
const mixedWords = Array.from({length: 8}, (_, index) => card(index, {example: index < 3 ? `I see the cat ${index}.
나는 고양이 ${index}를 본다.` : `We like the dog ${index}.`}));
for (let round = 0; round < 10; round++) assert.deepEqual(buildPuzzles(mixedWords, 'word', random).slice(0, 3).map(item => item.meaning), [true, true, true], 'puzzles with a Korean sentence come first');
assert.equal(puzzleSpeech(['I eat', 'an apple.']), 'I eat an apple.', 'the English sentence is read whole');
assert.equal(puzzleSpeech(['나는', '사과를', '먹는다.']), '', 'a Korean sentence is not read');
assert.equal(puzzleCount(cards, 'word'), 0, 'word sets without examples have no puzzle');
const chunks = ['I', 'like', 'apples'];
for (let round = 0; round < 20; round++) assert.equal(puzzleSolved(chunks, puzzleStart(chunks, random)), false, 'the starting order is never already solved');
assert.deepEqual(puzzleStart(['go', 'go', 'go'], random).length, 3, 'identical chunks still give an order');
assert.equal(puzzleSolved(['the', 'cat', 'the', 'dog'], [2, 1, 0, 3]), true, 'identical chunks may swap');
assert.equal(puzzleSolved(chunks, [0, 1]), false, 'an unfinished order is not solved');
assert.equal(puzzlePrefix(chunks, [0, 2, 1]), 1, 'only the first chunk is in place');
assert.equal(puzzleScore([0, 1, 4, 9, -1]), 100 + 80 + 20 + 20 + 0, 'points fall with retries, never below twenty, nothing for a skip');
assert.equal(buildPuzzles(Array.from({length: 9}, (_, index) => card(index, {front: `this is sentence ${index}`})), 'sentence', random).length, 5, 'a round has five puzzles at most');

// Rain
assert.deepEqual([rainLevel(0), rainLevel(4), rainLevel(5), rainLevel(1000)], [1, 1, 2, 8], 'the level rises every five words and stops at eight');
assert.ok(rainFallMs(8) < rainFallMs(1) && rainSpawnMs(8) < rainSpawnMs(1), 'higher levels fall and arrive faster');
assert.equal(rainScore(6), 5 * 10 + 20, 'each word is worth ten points per level');
const ids = cards.map(item => item.id);
let rain = rainStep(newRain(ids, random), 0, ids, random);
assert.equal(rain.drops.length, 1, 'the first word falls at once');
rain = rainStep(rain, rainSpawnMs(1), ids, random);
assert.equal(rain.drops.length, 2, 'the next word follows after the interval');
assert.notEqual(rain.drops[0].cardId, rain.drops[1].cardId, 'the same card is never on screen twice');
const first = rain.drops[0];
const caught = rainCatch(rain, cardId => cardId === first.cardId)!;
assert.equal(caught.correct, 1, 'a matching answer catches the word');
assert.equal(caught.drops.some(drop => drop.id === first.id), false, 'the caught word leaves the screen');
assert.equal(rainCatch(rain, () => false), null, 'a wrong answer catches nothing');
let falling = rainStep(newRain(ids, random), 0, ids, random);
for (let step = 0; step < 400 && !falling.over; step++) falling = rainStep(falling, 100, ids, random);
assert.equal(falling.over, true, 'unanswered words end the game');
assert.equal(falling.lives, 0, 'all lives are spent');
assert.equal(falling.missed, RAIN_LIVES, 'the game stops at the last life');
assert.ok(falling.drops.length <= RAIN_MAX_DROPS, 'never more than four words at once');
assert.equal(rainStep(falling, 5000, ids, random), falling, 'a finished game stays put');
// Four choices: the lowest word is asked, a wrong pick costs a life and removes that word.
const twoDown = rainStep(rainStep(newRain(ids, random), 0, ids, random), rainSpawnMs(1), ids, random);
assert.equal(rainTarget(twoDown)!.id, twoDown.drops[0].id, 'the word closest to the ground is the one asked');
assert.equal(rainTarget(newRain(ids, random)), null, 'an empty sky asks nothing');
const missedOne = rainMiss(twoDown, twoDown.drops[0].id)!;
assert.deepEqual([missedOne.lives, missedOne.missed, missedOne.drops.length, missedOne.missedCards], [RAIN_LIVES - 1, 1, 1, [twoDown.drops[0].cardId]], 'a wrong pick spends a life, takes the word away and lists it as missed');
assert.equal(rainMiss(twoDown, 9999), null, 'a word already gone cannot be missed');
assert.equal(rainMiss({...twoDown, lives: 1}, twoDown.drops[0].id)!.over, true, 'a wrong pick on the last life ends the round');
assert.equal(rainReady(cards.slice(0, 4)), true, 'four different meanings can make four choices');
assert.equal(rainReady(cards.slice(0, 3)), false, 'three cannot');
assert.equal(rainReady([...cards.slice(0, 3), card(9, {back: '뜻 0'})]), false, 'repeated meanings count once');
assert.equal(checkGameResult('rain', {correct: 0, missed: 0, elapsedMs: 1000}, cards.slice(0, 3), 'word').ok, false, 'the server refuses a set that cannot make four choices');
const small = rainStep(newRain(['only'], random), 0, ['only'], random);
assert.equal(rainStep(small, 5000, ['only'], random).drops.filter(drop => drop.cardId === 'only').length, 1, 'a one-card set waits for the card to leave before reusing it');

// Server checks
const ok = (result: ReturnType<typeof checkGameResult>) => result.ok ? result.record : result.reason;
assert.deepEqual(ok(checkGameResult('pair', {pairs: 6, elapsedMs: 20_000, mistakes: 2}, cards, 'word')), {score: 24_000, timeMs: 20_000}, 'a pairs round is scored as time plus mistakes');
assert.equal(ok(checkGameResult('pair', {pairs: 5, elapsedMs: 20_000, mistakes: 0}, cards, 'word')), 'pairs', 'the pair count follows the set');
assert.equal(ok(checkGameResult('pair', {pairs: 6, elapsedMs: 1000, mistakes: 0}, cards, 'word')), 'too-fast', 'six pairs in a second is not possible');
assert.equal(ok(checkGameResult('pair', {pairs: 6, elapsedMs: 20_000.5, mistakes: 0}, cards, 'word')), 'elapsed', 'times are whole milliseconds');
assert.equal(ok(checkGameResult('pair', {pairs: 6, elapsedMs: 30 * 60_000, mistakes: 0}, cards, 'word')), 'elapsed', 'a round over twenty minutes is refused');
assert.equal(ok(checkGameResult('pair', {pairs: 2, elapsedMs: 9000, mistakes: 0}, cards.slice(0, 2), 'word')), 'cards', 'a set too small for pairs has no record');
assert.deepEqual(ok(checkGameResult('rain', {correct: 12, missed: 3, elapsedMs: 60_000}, cards, 'word')), {score: rainScore(12), timeMs: 60_000}, 'rain points follow the word count, not the client');
assert.equal(ok(checkGameResult('rain', {correct: 12, missed: 4, elapsedMs: 60_000}, cards, 'word')), 'counts', 'more misses than lives is refused');
assert.equal(ok(checkGameResult('rain', {correct: 60, missed: 0, elapsedMs: 30_000}, cards, 'word')), 'too-fast', 'more words than could have fallen is refused');
assert.equal(ok(checkGameResult('rain', {correct: 10, missed: 0, elapsedMs: 5000}, cards, 'word')), 'too-fast', 'typing faster than possible is refused');
const story = Array.from({length: 6}, (_, index) => card(index, {front: `we read book number ${index}`}));
assert.deepEqual(ok(checkGameResult('puzzle', {results: [0, 0, 1, -1, 2], elapsedMs: 40_000}, story, 'sentence')), {score: 100 + 100 + 80 + 0 + 60, timeMs: 40_000}, 'puzzle points come from the retries');
assert.equal(ok(checkGameResult('puzzle', {results: [0, 0, 0], elapsedMs: 40_000}, story, 'sentence')), 'results', 'one result per puzzle in the round');
assert.equal(ok(checkGameResult('puzzle', {results: [0, 0, 0, 0, 0], elapsedMs: 2000}, story, 'sentence')), 'too-fast', 'five puzzles in two seconds is refused');
assert.equal(ok(checkGameResult('puzzle', {results: [0, 0, 0, 0, 99], elapsedMs: 40_000}, story, 'sentence')), 'results', 'retry counts are bounded');
assert.equal(ok(checkGameResult('puzzle', {results: [], elapsedMs: 40_000}, cards, 'word')), 'cards', 'no puzzle, no record');

// Records and ranks
assert.equal(betterRecord('pair', {score: 20_000, timeMs: 20_000}, {score: 21_000, timeMs: 21_000}), true, 'a faster pairs time is better');
assert.equal(betterRecord('pair', {score: 21_000, timeMs: 21_000}, {score: 21_000, timeMs: 1}), false, 'an equal pairs time is not a new record');
assert.equal(betterRecord('rain', {score: 100, timeMs: 9}, {score: 100, timeMs: 10}), true, 'equal points in less time is better');
assert.equal(betterRecord('puzzle', {score: 90, timeMs: 1}, {score: 100, timeMs: 99}), false, 'fewer points is not better');
assert.equal(betterRecord('rain', {score: 0, timeMs: 1}, null), true, 'the first round is always a record');
const ranked = rankGameRows('rain', [{id: 'b', name: 'B', score: 50, timeMs: 10}, {id: 'a', name: 'A', score: 50, timeMs: 10}, {id: 'c', name: 'C', score: 90, timeMs: 99}, {id: 'd', name: 'D', score: 50, timeMs: 5}]);
assert.deepEqual(ranked.map(row => `${row.id}${row.rank}`), ['c1', 'd2', 'a3', 'b3'], 'ties share a rank, faster time breaks point ties');
assert.deepEqual(rankGameRows('pair', [{id: 'x', name: 'X', score: 30, timeMs: 30}, {id: 'y', name: 'Y', score: 20, timeMs: 20}]).map(row => row.id), ['y', 'x'], 'the fastest pairs time ranks first');
assert.deepEqual(recentPlays([1000, 50_000, 70_000, 'x', 999_999], 70_000), [50_000, 70_000], 'the rate window keeps the last minute only');
assert.deepEqual([formatGameTime(38_449), formatGameTime(61_000), formatGameTime(0)], ['38.4', '1:01.0', '0.0'], 'times read as seconds with one decimal');
// A very long rain round ends itself at the record limits, so the save is never refused.
const longRain = {...newRain(['a', 'b', 'c'], random), correct: RAIN_MAX_WORDS - 1, time: 1000};
assert.equal(rainCap(longRain).over, false, 'below the limits the round goes on');
const capped = rainCap({...longRain, correct: RAIN_MAX_WORDS});
assert.deepEqual([capped.over, capped.drops, rainCapped(capped)], [true, [], true], 'the word limit ends the round');
const timed = rainCap({...longRain, correct: 3, time: GAME_MAX_MS + 80});
assert.deepEqual([timed.over, timed.time], [true, GAME_MAX_MS], 'the time limit ends the round at the limit');
assert.equal(checkGameResult('rain', {correct: 3, missed: 0, elapsedMs: timed.time}, cards, 'word').ok, true, 'and the capped record passes the server check');
console.log('cards games tests passed');
