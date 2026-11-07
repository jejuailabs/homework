import assert from 'node:assert/strict';
import vocab from '../data/cards-base-vocab.json';
import {BASE_VOCAB_SET_MAX, baseVocabCards, baseVocabLabel, baseVocabScope, baseVocabSetTitle, chunkBaseVocab, filterBaseVocab, type BaseVocabData} from './cards-base-vocab';

// The data file: the official list as published (2022 개정 [별표 3]), with the AI-draft note.
const data = vocab as BaseVocabData, words = data.words;
assert.equal(words.length, 3000, '3,000 words');
assert.equal(words.filter(entry => entry.tier === 1).length, 800, '800 marked for elementary school');
assert.equal(words.filter(entry => entry.tier === 2).length, 1200, '1,200 for middle and high common courses');
assert.equal(words.filter(entry => entry.tier === 3).length, 1000);
assert.deepEqual(data.source.counts, {total: 3000, elementary: 800, secondaryCommon: 1200, other: 1000});
assert.match(data.source.notice, /교육부 고시 제2022-33호/);
assert.equal(data.meaningNote, '뜻은 AI 초안, 교사 검토 권장', 'the AI-draft note travels with the data');
assert.ok(words.every(entry => entry.level === (entry.tier === 1 ? '초등' : '중고')), 'level follows the official mark');
assert.equal(new Set(words.map(entry => entry.word.toLowerCase())).size, 3000, 'no word twice');
assert.ok(words.every(entry => /^[A-Za-z][A-Za-z.' -]*$/.test(entry.word)), 'words are plain English headwords');
assert.ok(words.every(entry => entry.meaning.trim() && entry.meaning.length <= 24 && !/[A-Za-z]/.test(entry.meaning)), 'every word has a short Korean meaning');
assert.deepEqual(words.slice(0, 3).map(entry => entry.word), ['a', 'abandon', 'able'], 'official alphabetical order');
assert.deepEqual(words.find(entry => entry.word === 'airplane')?.variants, ['aeroplane'], 'spelling variants are kept');
assert.equal(words.find(entry => entry.word === 'zoo')?.tier, 1);

// Filtering: range, letters (inclusive, swapped when reversed), search in word, variant or meaning.
const elementary = filterBaseVocab(words, {scope: 'elementary'});
assert.equal(elementary.length, 800);
assert.equal(filterBaseVocab(words, {scope: 'secondary'}).length, 2200, 'secondary = everything not marked elementary');
assert.equal(filterBaseVocab(words, {scope: 'all'}).length, 3000);
const ab = filterBaseVocab(words, {scope: 'elementary', from: 'a', to: 'b'});
assert.ok(ab.length > 0 && ab.every(entry => /^[ab]/i.test(entry.word)));
assert.deepEqual(filterBaseVocab(words, {scope: 'elementary', from: 'b', to: 'a'}), ab, 'a reversed range is swapped');
assert.equal(filterBaseVocab(words, {scope: 'all', from: '1', to: '?'}).length, 3000, 'bad letters fall back to a–z');
assert.ok(filterBaseVocab(words, {scope: 'all', query: 'aeroplane'}).some(entry => entry.word === 'airplane'), 'search finds a variant');
assert.ok(filterBaseVocab(words, {scope: 'all', query: '  APPLE '}).some(entry => entry.word === 'apple'), 'search ignores case and spaces');
const korean = filterBaseVocab(words, {scope: 'elementary', query: words.find(entry => entry.word === 'apple')!.meaning});
assert.ok(korean.some(entry => entry.word === 'apple'), 'search finds a meaning');
assert.equal(baseVocabScope('nope'), 'elementary'); assert.equal(baseVocabScope('all'), 'all');

// Sets: chunks of 20/30/50, numbered titles, plain word cards.
const chunks = chunkBaseVocab(elementary, 20);
assert.equal(chunks.length, 40, '초등 800 in sets of 20 is 40 sets');
assert.ok(chunks.length <= BASE_VOCAB_SET_MAX, 'and fits one press');
assert.deepEqual(chunkBaseVocab([1, 2, 3, 4, 5], 50), [[1, 2, 3, 4, 5]]);
assert.deepEqual(chunkBaseVocab(Array.from({length: 45}, (_, i) => i), 30).map(chunk => chunk.length), [30, 15], 'a short last set keeps the rest');
assert.equal(chunkBaseVocab(Array.from({length: 45}, (_, i) => i), 7).length, 3, 'an unknown size falls back to 20');
assert.equal(baseVocabSetTitle('기본 어휘 초등', 2, 40, chunks[2]), `기본 어휘 초등 03 · ${chunks[2][0].word}–${chunks[2].at(-1)!.word}`);
assert.match(baseVocabSetTitle('기본 어휘', 4, 150, chunks[0]), /^기본 어휘 005 · /, 'padding follows the number of sets');
const cards = baseVocabCards(chunks[0]);
assert.deepEqual(cards[0], {front: chunks[0][0].word, back: chunks[0][0].meaning, example: '', alternatives: []});
assert.equal(baseVocabLabel(words.find(entry => entry.word === 'airplane')!), 'airplane / aeroplane');
console.log('cards base vocabulary tests ok');
