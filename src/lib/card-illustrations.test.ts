import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vocab from '../data/cards-base-vocab.json';
import {CARD_ILLUSTRATIONS, cardIllustration, cardIllustrationStorageUrl, illustrationHeadword, type CardIllustrationStorageConfig} from './card-illustrations';

const entries = Object.entries(CARD_ILLUSTRATIONS);
assert.equal(entries.length, 3000, 'every approved source headword has an image mapping');
const directory = path.resolve('public/cards/vocabulary-v1');
assert.ok(!fs.existsSync(directory) || fs.readdirSync(directory).length === 0, 'generated artwork must not be copied into the website deployment');
assert.equal(new Set(entries.map(([, art]) => art.file)).size, 3000, 'each headword has a distinct storage object filename');
assert.deepEqual(new Set(entries.map(([word]) => word)), new Set(vocab.words.map(item => item.word.toLowerCase())));
const ready: CardIllustrationStorageConfig = {ready: true, bucket: 'classroom-example.firebasestorage.app', prefix: 'cards/vocabulary/v1', downloadToken: '09bba038-bd46-4f84-aa94-7d0b6d65ce5e'};
const unready: CardIllustrationStorageConfig = {ready: false, bucket: '', prefix: 'cards/vocabulary/v1', downloadToken: ''};
for (const item of vocab.words) {
  const art = cardIllustration({front: item.word, back: item.meaning});
  assert.ok(art, `${item.word}: the original vocabulary meaning resolves`);
  assert.equal(art.src, cardIllustrationStorageUrl(art.file));
  assert.match(art.file, /^[A-Za-z]+(?:-[A-Za-z]+)*\.svg$/);
  assert.equal(cardIllustrationStorageUrl(art.file, unready), null, 'an unuploaded pack produces no image request URL');
  const url = cardIllustrationStorageUrl(art.file, ready);
  assert.ok(url, `${item.word}: a complete release resolves a direct storage URL`);
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://firebasestorage.googleapis.com');
  assert.equal(decodeURIComponent(parsed.pathname.split('/o/')[1]), `${ready.prefix}/${art.file}`);
  assert.equal(parsed.searchParams.get('alt'), 'media');
  assert.equal(parsed.searchParams.get('token'), ready.downloadToken);
}

assert.equal(cardIllustrationStorageUrl('apple.svg', ready), `https://firebasestorage.googleapis.com/v0/b/classroom-example.firebasestorage.app/o/cards%2Fvocabulary%2Fv1%2Fapple.svg?alt=media&token=${ready.downloadToken}`);
assert.ok(cardIllustrationStorageUrl('I.svg', {...ready, bucket: 'classroom-example.appspot.com', prefix: 'cards/vocabulary/v2'})?.includes('cards%2Fvocabulary%2Fv2%2FI.svg'));
assert.equal(cardIllustrationStorageUrl('apple.svg', {...ready, ready: false}), null, 'an incomplete upload stays disabled even when its other fields are filled');
for (const bucket of ['', 'ab', 'evil.com/path', '../bucket', 'bucket..name', '-bucket', 'bucket-', 'bucket name', 'bucket?x=1', 'Bucket', '127.0.0.1', 'bucket@other', `${'x'.repeat(64)}.com`]) {
  assert.equal(cardIllustrationStorageUrl('apple.svg', {...ready, bucket}), null, `reject invalid bucket ${bucket}`);
}
for (const prefix of ['', '../cards/vocabulary/v1', 'cards/vocabulary/v0', 'cards/vocabulary/v01', 'cards/vocabulary/v1/', 'cards/vocabulary/v1/../other', 'other/v1']) {
  assert.equal(cardIllustrationStorageUrl('apple.svg', {...ready, prefix}), null, `reject invalid release prefix ${prefix}`);
}
for (const downloadToken of ['', 'undefined', 'secret', '00000000-0000-0000-0000-000000000000', `${ready.downloadToken}&x=1`]) {
  assert.equal(cardIllustrationStorageUrl('apple.svg', {...ready, downloadToken}), null, 'reject invalid download tokens');
}
for (const file of ['../apple.svg', 'apple.svg?alt=media', '/apple.svg', 'Apple.svg', 'i.svg', 'not-a-registered-word.svg', 'apple.png', 'https://example.com/apple.svg']) {
  assert.equal(cardIllustrationStorageUrl(file, ready), null, `reject unsafe or unregistered file ${file}`);
}

assert.equal(cardIllustration({front: '  APPLE  ', back: '사과'})?.file, 'apple.svg');
assert.equal(cardIllustration({front: 'ａｐｐｌｅ', back: '사과'})?.word, 'apple');
assert.equal(cardIllustration({front: 'i', back: '나'})?.file, 'I.svg', 'uppercase source filename is retained in Storage object paths');
assert.equal(cardIllustration({front: 'twenty-first', back: '스물한 번째'})?.word, 'twenty-first');
assert.equal(cardIllustration({front: 'under', back: '아래에'})?.sense, '~ 아래에');
assert.equal(cardIllustration({front: 'run', back: '달리다'})?.word, 'run');
assert.equal(cardIllustration({front: 'run', back: '운영하다; 달리다'})?.word, 'run', 'an explicitly included selected sense is supported');
assert.equal(cardIllustration({front: 'rice', back: '밥'})?.word, 'rice', 'both pictured rice senses are supported');
assert.equal(cardIllustration({front: 'rice', back: '쌀'})?.word, 'rice');

for (const card of [
  {front: 'apple', back: '애플 회사'},
  {front: 'apple', back: '사과하다'},
  {front: 'run', back: '운영하다'},
  {front: 'bank', back: '강둑'},
  {front: 'bank', back: '은행나무'},
  {front: 'book', back: '예약하다'},
  {front: 'apple', back: ''},
  {front: 'apple', back: 'an apple'},
  {front: 'apple pie', back: '사과'},
  {front: 'I eat an apple.', back: '사과'},
  {front: 'pineapple-like', back: '사과'},
  {front: 'not-in-this-dictionary', back: '사과'},
]) assert.equal(cardIllustration(card), null, `no guessed meaning for ${card.front} / ${card.back}`);
for (const word of ['../apple', 'apple.svg', '/apple', 'https://example.com/apple', '__proto__', 'constructor', '<apple>', 'apple?word=pear', 'apple\0']) {
  assert.equal(cardIllustration({front: word, back: '사과'}), null, `unsafe/unregistered front ${word}`);
}
assert.equal(illustrationHeadword('apple pie'), null);
assert.equal(cardIllustration({front: 'apple', back: '사과'}, 'sentence'), null, 'sentence sets never guess a single-word image');
assert.equal(cardIllustration({front: 'apple', back: '사과'}, 'drill'), null, 'drill questions cannot disclose an answer image');
assert.equal(cardIllustration({front: 'apple', back: '사과', drill: {kind: 'short'}}, 'word'), null, 'a drill payload remains excluded even with a word-set label');
console.log('card illustration tests ok: 3,000 metadata mappings, Firebase URLs, unpublished fallback, no deployed SVGs, custom senses and assessment fallback');
