import assert from 'node:assert/strict';
import {cardSetDraftInput, reviewDraftInput, setDraftPreview} from './card-drafts';

// create_set: each source becomes the editor's own AI request, validated by the same rules.
const words = cardSetDraftInput({set_title: ' 3단원 단어 ', source: 'words', words: ['apple', ' run ', ''], level: 'middle'});
assert.equal(words.title, '3단원 단어');
assert.deepEqual(words.request, {mode: 'words', level: 'middle', words: ['apple', 'run']});
assert.equal(words.label, '영어 단어 2개');
assert.deepEqual(cardSetDraftInput({set_title: 'Weather', source: 'topic', topic: 'weather'}).request, {mode: 'topic', level: 'elementary', topic: 'weather', count: 15}, 'level and count have defaults');
const concept = cardSetDraftInput({set_title: '식물', source: 'concept', subject: 'science', topic: '식물의 한살이', count: 8});
assert.deepEqual(concept.request, {mode: 'concept', level: 'elementary', subject: 'science', topic: '식물의 한살이', text: '', count: 8});
assert.match(concept.description, /과학 개념어/);
assert.equal(cardSetDraftInput({set_title: 'p', source: 'passage', text: 'I like apples.', count: 3}).request.mode, 'passage');
for (const args of [{source: 'topic', topic: 'x'}, {set_title: 'a'}, {set_title: 'a', source: 'photo'}, {set_title: 'a', source: 'words', words: []}, {set_title: 'a', source: 'topic', topic: 'x', count: 31}, {set_title: 'a', source: 'topic', topic: 'x', level: 'college'}, {set_title: 'a', source: 'concept', subject: 'music', topic: 'x'}, {set_title: 'a', source: 'concept', subject: 'math'}])
  assert.throws(() => cardSetDraftInput(args), JSON.stringify(args));

// create_review_set: examples are rewritten only for word sets, and only unless the teacher says no.
assert.deepEqual(reviewDraftInput({}, 'word'), {count: 10, level: 'elementary', rewrite: true});
assert.deepEqual(reviewDraftInput({count: 30, rewrite_examples: false, level: 'high'}, 'word'), {count: 30, level: 'high', rewrite: false});
assert.equal(reviewDraftInput({}, 'sentence').rewrite, false);
assert.throws(() => reviewDraftInput({count: 31}, 'word'));
assert.throws(() => reviewDraftInput({rewrite_examples: 'yes'}, 'word'));

// The preview lists the cards that will be saved.
assert.equal(setDraftPreview([{front: 'apple', back: '사과'}, {front: 'run', back: '달리다'}]), '1. apple — 사과\n2. run — 달리다');
const long = setDraftPreview(Array.from({length: 33}, (_, index) => ({front: `w${index}`, back: 'b'})));
assert.equal(long.split('\n').length, 31);
assert.ok(long.endsWith('… 외 3장'));
console.log('berry card draft tests ok');
