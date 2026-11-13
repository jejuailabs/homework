import assert from 'node:assert/strict';
import {SPEAKING_MAX_BYTES, emptySpeakingRequired, parseSpeakingCounts, parseSpeakingRequired, shadowCheck, speakingGoalSteps, speakingNeed, speakingPercent, speakingStepDone, speakingCards, speakingComplete, speakingFileName, speakingFolderName, speakingRecorded, speakingZipName, type SpeakingTakes} from './cards-speaking';
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

// 스피킹 6단계: 필수 횟수, 진행률, 쉐도잉 채점.
const free = emptySpeakingRequired();
assert.equal(speakingNeed(free, 'read'), 1, '자율 counts once');
assert.deepEqual(parseSpeakingRequired({read: 3, comp: -1, listen: 2.5, aloud: 99, shadow: '2'}), {read: 3, comp: 0, listen: 0, aloud: 10, shadow: 2, record: 0}, 'whole numbers 0-10 only');
assert.deepEqual(parseSpeakingCounts({read: {a: 2, b: 0, c: 'x'}, nope: {a: 1}}), {read: {a: 2}}, 'unknown steps and bad counts drop');
assert.equal(speakingGoalSteps(free).length, 6, 'all six steps count when none is required');
assert.deepEqual(speakingGoalSteps({...free, read: 2, record: 1}), ['read', 'record'], 'only the 필수 steps count once any is set');
assert.equal(speakingPercent(cards, {}, free), 0);
assert.equal(speakingPercent(cards, {read: {a: 1, b: 1}}, free), 17, 'one step of six done for both readable cards');
assert.equal(speakingPercent(cards, {read: {a: 1, b: 1}}, {...free, read: 2}), 0, 'twice is needed');
assert.equal(speakingPercent(cards, {read: {a: 2, b: 2}}, {...free, read: 2}), 100);
assert.deepEqual(speakingStepDone(cards, {read: {a: 1}}, {...free, read: 2}, 'read'), {done: 0, touched: 1, total: 2});
assert.equal(shadowCheck('We have nails on our hands and feet.', 'we have nails on our hands and feet').pass, true);
assert.equal(shadowCheck('We have nails on our hands and feet.', 'we have').pass, false, 'too few words spoken');
assert.equal(shadowCheck('What color is it?', 'what colour is it').pass, true, 'a close word counts');
assert.equal(shadowCheck('Hi.', '').pass, false, 'silence never passes');
assert.equal(shadowCheck('Hi.', 'hi').pass, true);
console.log('cards speaking tests passed');
