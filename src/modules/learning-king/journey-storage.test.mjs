import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./journey-storage.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const storageModule = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const {validateJourneyState, readJourneyState, writeJourneyState, journeyStorageKey, isJourneyFrameMessage, createJourneyStorageSession} = storageModule;

function sampleState() {
  const question = {id: 'g3-2026-10-25-1', q: '24 + 37 = ?', answers: ['61', '51', '71'], correct: '61', explanation: '24에 37을 더하면 61이에요.', skill: '덧셈', math: true, grade: 3, level: 'gentle', date: '2026-10-25', sequence: 1};
  return {version: 1, grade: 3, level: 'gentle', nextSequence: 2, totalAnswered: 1, totalCorrect: 1, completedLegs: 0, bank: [question], recent: [{id: question.id, q: question.q, answer: '61', correct: true, correctAnswer: '61', explanation: question.explanation, seconds: 4.2, at: '2026-10-25T11:00:00.000Z', grade: 3, level: 'gentle'}], active: {id: 'leg-1', grade: 3, level: 'gentle', date: '2026-10-25', sequence: 1, questions: [question], answers: [{answer: '61', correct: true, seconds: 4.2}], elapsedMs: 4200, questionElapsedMs: 0}};
}

function memoryStorage() {
  const entries = new Map();
  return {entries, getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)), removeItem: key => entries.delete(key)};
}

test('journey records survive browser storage with shared question references and account isolation', () => {
  const storage = memoryStorage();
  const original = sampleState();
  assert.equal(writeJourneyState(storage, 'teacher-a', original), true);
  const loaded = readJourneyState(storage, 'teacher-a');
  assert.equal(loaded.available, true);
  assert.deepEqual(loaded.state, original);
  assert.notEqual(loaded.state, original);
  assert.deepEqual(readJourneyState(storage, 'teacher-b'), {state: null, available: true});
  assert.deepEqual([...storage.entries.keys()], ['learning-king-journey-v1:teacher-a']);
  assert.equal(journeyStorageKey(''), null);
  assert.equal(journeyStorageKey('a'.repeat(129)), null);
});

test('journey schema rejects invalid counters, unsupported versions, and unexpected top-level fields', () => {
  for (const mutation of [
    {version: 2}, {grade: 0}, {grade: 7}, {level: 'hard'}, {nextSequence: -1}, {nextSequence: 1.2}, {totalAnswered: Infinity},
    {totalCorrect: 2}, {completedLegs: 1_000_000_001}, {bank: [null]}, {recent: [{} , null]}, {active: []}, {uid: 'student-id'},
  ]) assert.equal(validateJourneyState({...sampleState(), ...mutation}), null, JSON.stringify(mutation));
  const missing = sampleState();
  delete missing.active;
  assert.equal(validateJourneyState(missing), null);
});

test('journey payloads reject prototype keys, non-JSON values, excessive depth, cycles, and sparse arrays', () => {
  const poisoned = JSON.parse('{"__proto__":{"polluted":true}}');
  const cyclic = {}; cyclic.self = cyclic;
  let deep = {}; for (let index = 0; index < 12; index++) deep = {child: deep};
  for (const active of [poisoned, {constructor: {}}, {bad: undefined}, {bad: () => {}}, {bad: new Date()}, {bad: NaN}, cyclic, deep, {bad: new Array(2)}]) {
    assert.equal(validateJourneyState({...sampleState(), active}), null);
  }
  assert.equal({}.polluted, undefined);
});

test('journey payload limits apply to collections, strings, and encoded UTF-8 bytes', () => {
  assert.equal(validateJourneyState({...sampleState(), bank: Array.from({length: 301}, () => ({}))}), null);
  assert.equal(validateJourneyState({...sampleState(), recent: Array.from({length: 101}, () => ({}))}), null);
  assert.equal(validateJourneyState({...sampleState(), active: {text: 'x'.repeat(4001)}}), null);
  assert.equal(validateJourneyState({...sampleState(), bank: Array.from({length: 50}, () => ({q: '가'.repeat(3000)}))}), null);
  const storage = memoryStorage();
  const good = sampleState();
  assert.equal(writeJourneyState(storage, 'teacher-a', good), true);
  assert.equal(writeJourneyState(storage, 'teacher-a', {...good, bank: Array.from({length: 301}, () => ({}))}), false);
  assert.deepEqual(readJourneyState(storage, 'teacher-a').state, good, 'invalid saves must leave the last valid record intact');
});

test('journey storage reports unavailable read/write storage and ignores corrupt saved records', () => {
  const denied = {getItem() {throw new Error('denied');}, setItem() {throw new Error('denied');}, removeItem() {}};
  const quota = {getItem() {return null;}, setItem() {throw new Error('quota');}, removeItem() {}};
  assert.deepEqual(readJourneyState(denied, 'teacher-a'), {state: null, available: false});
  assert.deepEqual(readJourneyState(quota, 'teacher-a'), {state: null, available: false});
  assert.equal(writeJourneyState(quota, 'teacher-a', sampleState()), false);
  const storage = memoryStorage();
  for (const raw of ['{broken', '{"version":2}', 'x'.repeat(410_000)]) {
    storage.setItem(journeyStorageKey('teacher-a'), raw);
    assert.deepEqual(readJourneyState(storage, 'teacher-a'), {state: null, available: true});
  }
});

test('journey storage preserves readable accumulated records when new writes are unavailable', () => {
  const stored = sampleState();
  const raw = JSON.stringify(stored);
  const readOnly = {getItem() {return raw;}, setItem() {throw new Error('quota');}, removeItem() {}};
  assert.deepEqual(readJourneyState(readOnly, 'teacher-a'), {state: stored, available: false});
  assert.equal(writeJourneyState(readOnly, 'teacher-a', {...stored, totalAnswered: 2}), false);
  assert.deepEqual(readJourneyState(readOnly, 'teacher-a').state, stored, 'failed writes must not erase a readable saved journey');
});

test('only the active opaque sandbox frame can use the journey bridge', () => {
  const activeFrame = {};
  const message = {source: activeFrame, origin: 'null', data: {type: 'learning-king-journey-save', state: sampleState()}};
  assert.equal(isJourneyFrameMessage(message, activeFrame), true);
  assert.equal(isJourneyFrameMessage({...message, source: {}}, activeFrame), false);
  assert.equal(isJourneyFrameMessage({...message, origin: 'https://attacker.example'}, activeFrame), false);
  assert.equal(isJourneyFrameMessage({...message, source: null}, null), false);
  assert.equal(isJourneyFrameMessage({...message, data: null}, activeFrame), false);
  assert.equal(isJourneyFrameMessage({...message, data: {type: 1}}, activeFrame), false);
});

test('journey storage sessions reject stale tabs and retain the latest successful save', () => {
  const storage = memoryStorage();
  const initial = sampleState();
  writeJourneyState(storage, 'teacher-a', initial);
  const firstTab = createJourneyStorageSession(storage, 'teacher-a');
  const secondTab = createJourneyStorageSession(storage, 'teacher-a');
  assert.deepEqual(firstTab.load().state, initial);
  assert.deepEqual(secondTab.load().state, initial);
  const firstUpdate = {...initial, totalAnswered: 2};
  const secondUpdate = {...initial, totalAnswered: 2, totalCorrect: 2};
  assert.equal(firstTab.save(firstUpdate), true);
  assert.equal(secondTab.save(secondUpdate), false);
  secondTab.load();
  assert.equal(secondTab.save(secondUpdate), false, 'repeated load messages must not unlock a stale frame');
  assert.deepEqual(readJourneyState(storage, 'teacher-a').state, firstUpdate);
  const nextUpdate = {...firstUpdate, totalAnswered: 3};
  assert.equal(firstTab.save(nextUpdate), true, 'the active tab advances its expected snapshot after each save');
  assert.deepEqual(readJourneyState(storage, 'teacher-a').state, nextUpdate);
});

test('journey storage sessions require load and isolate concurrent accounts and first saves', () => {
  const storage = memoryStorage();
  const first = createJourneyStorageSession(storage, 'teacher-a');
  const stale = createJourneyStorageSession(storage, 'teacher-a');
  const other = createJourneyStorageSession(storage, 'teacher-b');
  assert.equal(first.save(sampleState()), false);
  first.load(); stale.load(); other.load();
  assert.equal(first.save(sampleState()), true);
  assert.equal(stale.save({...sampleState(), grade: 5}), false);
  assert.equal(other.save({...sampleState(), grade: 2}), true);
  assert.equal(readJourneyState(storage, 'teacher-a').state.grade, 3);
  assert.equal(readJourneyState(storage, 'teacher-b').state.grade, 2);
});

test('journey sessions can recover write availability but cannot save after an unreadable initial load', () => {
  const base = memoryStorage();
  const original = sampleState();
  writeJourneyState(base, 'teacher-a', original);
  let readDenied = false;
  let writeDenied = true;
  const storage = {getItem(key) {if (readDenied) throw new Error('denied');return base.getItem(key);}, setItem(key, value) {if (writeDenied) throw new Error('quota');base.setItem(key, value);}, removeItem: base.removeItem};
  const session = createJourneyStorageSession(storage, 'teacher-a');
  assert.deepEqual(session.load(), {state: original, available: false});
  assert.equal(session.save({...original, totalAnswered: 2}), false);
  writeDenied = false;
  assert.equal(session.save({...original, totalAnswered: 2}), true);
  readDenied = true;
  const unreadable = createJourneyStorageSession(storage, 'teacher-a');
  assert.deepEqual(unreadable.load(), {state: null, available: false});
  readDenied = false;
  assert.equal(unreadable.save(original), false, 'a frame without an original snapshot must not overwrite a saved record');
  assert.equal(readJourneyState(base, 'teacher-a').state.totalAnswered, 2);
});
