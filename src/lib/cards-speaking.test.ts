import assert from 'node:assert/strict';
import {SPEAKING_MAX_BYTES, speakingCards, speakingComplete, speakingFileName, speakingFolderName, speakingRecorded, speakingZipName, type SpeakingTakes} from './cards-speaking';
import type {CardEntry} from './cards-types';

const card = (id: string, front = id): CardEntry => ({id, front, back: '뜻', example: '', alternatives: []});
const take = {takeId: 't', bytes: 100, seconds: 1, at: '2026-11-10'};
const cards = [card('a'), card('b'), card('blank', '  ')];
const some: SpeakingTakes = {a: take}, all: SpeakingTakes = {a: take, b: take};

assert.equal(SPEAKING_MAX_BYTES, 44 + 16000 * 2 * 30, 'thirty seconds of 16kHz mono PCM plus the header');
assert.deepEqual(speakingCards(cards).map(item => item.id), ['a', 'b'], 'a card with no front has nothing to read');
assert.equal(speakingRecorded(cards, some), 1);
assert.equal(speakingComplete(cards, some), false, 'one card is still missing');
assert.equal(speakingComplete(cards, all), true, 'a blank card is not required');
assert.equal(speakingComplete([card('blank', ' ')], {}), false, 'a set with nothing to read is never complete');
assert.equal(speakingRecorded(cards, {...all, gone: take}), 2, 'a take for another card is not counted');
assert.equal(speakingFileName(2, 'look after'), '003_look after.wav', 'files sort in study order');
assert.equal(speakingFileName(0, 'a/b:c?'), '001_a b c.wav', 'characters a file name cannot hold are removed');
assert.ok(speakingFileName(0, 'x'.repeat(200)).length <= 48, 'a long sentence makes a short name');
assert.equal(speakingFolderName(3, '김민수'), '03번_김민수');
assert.equal(speakingFolderName(0, '김민수'), '김민수', 'no roll number, no prefix');
assert.equal(speakingZipName('1과 단어'), '1과 단어_스피킹.zip');
assert.equal(speakingZipName('1과 단어', '김민수'), '1과 단어_스피킹_김민수.zip');
console.log('cards speaking tests passed');
