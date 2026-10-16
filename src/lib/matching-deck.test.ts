import assert from 'node:assert/strict';
import test from 'node:test';
import {MATCHING_COUNTS, createMatchingDeck, matchingDeckSize, matchingPositions, parseMatchingSettings, verifyMatchingDeck} from './matching-deck';
import {MATCHING_PACKS} from './matching-assets';

for (const count of MATCHING_COUNTS) {
  test(`every pair shares exactly one symbol: ${count} symbols, all cards and 20 seeds`, () => {
    for (let seed = 0; seed < 20; seed++) {
      const deck = createMatchingDeck(count, `test-${seed}`);
      assert.equal(deck.length, matchingDeckSize(count));
      assert.equal(verifyMatchingDeck(deck, count), true);
      assert.equal(verifyMatchingDeck(deck.slice(0, 3), count, false), true);
      for (let a = 0; a < deck.length; a++) for (let b = a + 1; b < deck.length; b++) {
        assert.equal(new Set(deck[a].filter(id => deck[b].includes(id))).size, 1);
      }
    }
  });
}
test('GF(4) preset, seed stability, and shuffled orders survive independent generation', () => {
  assert.deepEqual(createMatchingDeck(5, 'class'), createMatchingDeck(5, 'class'));
  assert.notDeepEqual(createMatchingDeck(5, 'class'), createMatchingDeck(5, 'other'));
  assert.throws(() => createMatchingDeck(7 as 5));
});
test('invalid, duplicated, missing and out-of-range cards are rejected', () => {
  const deck = createMatchingDeck(4);
  assert.equal(verifyMatchingDeck([deck[0], deck[0]], 4, false), false);
  assert.equal(verifyMatchingDeck([[0, 0, 1, 2]], 4, false), false);
  assert.equal(verifyMatchingDeck([[0, 1, 2, 100]], 4, false), false);
  assert.equal(verifyMatchingDeck(deck.slice(1), 4), false);
  assert.equal(verifyMatchingDeck([], 4, false), false);
});
test('import validates ranges, pack allowlist, shapes and seeds and strips untrusted extras', () => {
  const valid = {version: 1, title: '공공기관', pack: 'animals', symbolsPerCard: 5, shape: 'hexagon', seed: 'lesson', printCount: 12, labels: true};
  assert.deepEqual(parseMatchingSettings({...valid, script: 'bad'}, ['animals']), valid);
  for (const mutation of [{version: 2}, {pack: 'https://evil'}, {symbolsPerCard: 7}, {shape: '<svg'}, {seed: ''}, {printCount: 22}, {printCount: 2.5}, {labels: 'yes'}, {title: 'a'.repeat(81)}, {artwork: ['javascript:alert(1)']}, {artwork: Array(21).fill('noto-1f436')}]) {
    assert.throws(() => parseMatchingSettings({...valid, ...mutation}, ['animals']));
  }
});
test('each bundled pack has enough unique fixed SVGs for all supported decks', () => {
  for (const pack of MATCHING_PACKS) {
    assert.ok(pack.assets.length >= 57, pack.id);
    assert.equal(new Set(pack.assets.map(asset => asset.id)).size, pack.assets.length);
    assert.equal(new Set(pack.assets.map(asset => asset.src)).size, pack.assets.length);
    assert.ok(pack.assets.every(asset => asset.src.startsWith('/tools/matching/') && asset.src.endsWith('.svg') && asset.source.license));
  }
});
test('layout remains inside the hexagon inscribed circle without overlapping symbol boxes', () => {
  for (const count of MATCHING_COUNTS) {
    const positions = matchingPositions(count);
    for (const position of positions) assert.ok(Math.hypot(position.x - 50, position.y - 50) + position.size / 2 < 43.3);
    for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i], b = positions[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > (a.size + b.size) / 2);
    }
  }
});
