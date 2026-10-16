import assert from 'node:assert/strict';
import test from 'node:test';
import {createMatchingDeck, type MatchingSettings} from './matching-deck';
import {MATCHING_PACKS} from './matching-assets';
import {printMatchingDeck} from './matching-print';

test('print output isolates six cards per A4 sheet and escapes user-authored titles', () => {
  let html = '';
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const fakePopup = {document: {open() {}, write(value: string) {html = value;}, close() {}, images: [], getElementById() {return null;}}, opener: {}};
  Object.defineProperty(globalThis, 'window', {value: {open: () => fakePopup, location: {origin: 'https://class.example'}}, configurable: true});
  try {
    const settings: MatchingSettings = {version: 1, title: '<img src=x onerror="alert(1)">', pack: 'animals', symbolsPerCard: 4, shape: 'hexagon', seed: 'print', printCount: 13, labels: true};
    assert.equal(printMatchingDeck(settings, createMatchingDeck(4), MATCHING_PACKS[0].assets, 'ko'), true);
    assert.equal((html.match(/class="sheet"/g) || []).length, 3);
    assert.equal((html.match(/<article>/g) || []).length, 13);
    assert.equal((html.match(/<img alt=/g) || []).length, 52);
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
    assert.ok(html.includes('https://class.example/tools/matching/noto/'));
    assert.ok(html.includes('Apache-2.0'));
    assert.equal(fakePopup.opener, null);
  } finally {if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window');}
});
test('blocked print window returns a recoverable result', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {value: {open: () => null}, configurable: true});
  try {assert.equal(printMatchingDeck({} as MatchingSettings, [], [], 'en'), false);}
  finally {if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window');}
});
