import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vocab from '../data/cards-base-vocab.json';
import {CARD_ILLUSTRATIONS, cardIllustration, cardIllustrationStorageUrl, illustrationHeadword, type CardIllustrationStorageConfig} from './card-illustrations';

const entries = Object.entries(CARD_ILLUSTRATIONS);
assert.equal(entries.length, 2801, 'every reviewed headword has an image mapping');
const directory = path.resolve('public/cards/vocabulary-v1');
assert.ok(!fs.existsSync(directory) || fs.readdirSync(directory).length === 0, 'generated artwork must not be copied into the website deployment');
assert.equal(new Set(entries.map(([, art]) => art.file)).size, 2801, 'each headword has a distinct storage object filename');
const withoutPicture = new Set(["a","about","after","again","ago","all","already","also","although","altogether","always","and","another","any","as","aside","at","away","be","because","become","before","beyond","both","but","by","can","could","despite","do","due","during","each","either","else","even","ever","every","except","few","for","former","forth","from","furthermore","he","hence","here","how","however","i","if","in","indeed","initial","instead","it","just","last","latter","left","let","likewise","lot","may","maybe","meanwhile","mere","might","mine","moreover","much","must","neither","never","nevertheless","next","no","none","nonetheless","nor","not","now","nowadays","nowhere","of","often","once","only","or","other","otherwise","ought","out","overall","past","per","perhaps","phrase","quite","rather","seem","several","shall","she","should","since","so","some","somewhat","still","such","than","that","the","then","there","therefore","they","this","though","thus","till","to","too","unless","until","upon","verb","versus","very","via","we","well","what","when","where","whereas","whether","which","while","who","why","will","with","within","without","would","yes","yet","you","alcohol","assault","beer","belief","blood","bomb","cancer","cigarette","communist","dead","death","devote","diabetes","die","divorce","drown","faith","fat","funeral","gamble","game","gang","god","grave","gun","hell","holy","kill","murder","naked","native","pub","riot","sacred","sex","slave","starve","suicide","torture","tribe","trigger","ugly","victim","virgin","war","weapon","wine","worship"]);
assert.deepEqual(new Set(entries.map(([word]) => word)), new Set(vocab.words.map(item => item.word.toLowerCase()).filter(word => !withoutPicture.has(word))));
const ready: CardIllustrationStorageConfig = {ready: true, bucket: 'classroom-example.firebasestorage.app', prefix: 'cards/vocabulary/v1', downloadToken: '09bba038-bd46-4f84-aa94-7d0b6d65ce5e'};
const unready: CardIllustrationStorageConfig = {ready: false, bucket: '', prefix: 'cards/vocabulary/v1', downloadToken: ''};
for (const item of vocab.words) {
  if (withoutPicture.has(item.word.toLowerCase())) {
    assert.equal(cardIllustration({front: item.word, back: item.meaning}), null, `${item.word}: stays text only`);
    continue;
  }
  const art = cardIllustration({front: item.word, back: item.meaning});
  assert.ok(art, `${item.word}: the original vocabulary meaning resolves`);
  assert.equal(art.src, cardIllustrationStorageUrl(art.file));
  assert.match(art.file, /^[A-Za-z]+(?:-[A-Za-z]+)*\.webp$/);
  assert.equal(cardIllustrationStorageUrl(art.file, unready), null, 'an unuploaded pack produces no image request URL');
  const url = cardIllustrationStorageUrl(art.file, ready);
  assert.ok(url, `${item.word}: a complete release resolves a direct storage URL`);
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://firebasestorage.googleapis.com');
  assert.equal(decodeURIComponent(parsed.pathname.split('/o/')[1]), `${ready.prefix}/${art.file}`);
  assert.equal(parsed.searchParams.get('alt'), 'media');
  assert.equal(parsed.searchParams.get('token'), ready.downloadToken);
}

assert.equal(cardIllustrationStorageUrl('apple.webp', ready), `https://firebasestorage.googleapis.com/v0/b/classroom-example.firebasestorage.app/o/cards%2Fvocabulary%2Fv1%2Fapple.webp?alt=media&token=${ready.downloadToken}`);
assert.ok(cardIllustrationStorageUrl('apple.webp', {...ready, bucket: 'classroom-example.appspot.com', prefix: 'cards/vocabulary/v2'})?.includes('cards%2Fvocabulary%2Fv2%2Fapple.webp'));
assert.equal(cardIllustrationStorageUrl('apple.webp', {...ready, ready: false}), null, 'an incomplete upload stays disabled even when its other fields are filled');
for (const bucket of ['', 'ab', 'evil.com/path', '../bucket', 'bucket..name', '-bucket', 'bucket-', 'bucket name', 'bucket?x=1', 'Bucket', '127.0.0.1', 'bucket@other', `${'x'.repeat(64)}.com`]) {
  assert.equal(cardIllustrationStorageUrl('apple.webp', {...ready, bucket}), null, `reject invalid bucket ${bucket}`);
}
for (const prefix of ['', '../cards/vocabulary/v1', 'cards/vocabulary/v0', 'cards/vocabulary/v01', 'cards/vocabulary/v1/', 'cards/vocabulary/v1/../other', 'other/v1']) {
  assert.equal(cardIllustrationStorageUrl('apple.webp', {...ready, prefix}), null, `reject invalid release prefix ${prefix}`);
}
for (const downloadToken of ['', 'undefined', 'secret', '00000000-0000-0000-0000-000000000000', `${ready.downloadToken}&x=1`]) {
  assert.equal(cardIllustrationStorageUrl('apple.webp', {...ready, downloadToken}), null, 'reject invalid download tokens');
}
for (const file of ['../apple.webp', 'apple.webp?alt=media', '/apple.webp', 'Apple.webp', 'i.webp', 'not-a-registered-word.webp', 'apple.png', 'apple.svg', 'https://example.com/apple.webp']) {
  assert.equal(cardIllustrationStorageUrl(file, ready), null, `reject unsafe or unregistered file ${file}`);
}

assert.equal(cardIllustration({front: '  APPLE  ', back: '사과'})?.file, 'apple.webp');
assert.equal(cardIllustration({front: 'ａｐｐｌｅ', back: '사과'})?.word, 'apple');
for (const [front, back] of [['i', '나'], ['a', '하나의'], ['the', '그'], ['and', '그리고'], ['beer', '맥주'], ['gun', '총'], ['game', '게임']]) assert.equal(cardIllustration({front, back}), null, `${front}: function and unsuitable words stay text`);
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
console.log('card illustration tests ok: 2,801 metadata mappings, Firebase URLs, unpublished fallback, no deployed SVGs, custom senses and assessment fallback');
