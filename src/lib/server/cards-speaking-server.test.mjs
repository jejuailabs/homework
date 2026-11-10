// 스피킹 서버 흐름을 메모리 저장소로 돌린다. Firestore·Storage 없이 권한·교체·용량·삭제 규칙을 확인한다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const dataUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const stub = code => JSON.stringify(dataUrl(code));

const state = globalThis.__speaking = {docs: new Map(), files: new Map(), locked: false};
const adminStub = `
const s = globalThis.__speaking;
const snap = (path) => ({id: path.split('/').pop(), ref: docRef(path), exists: s.docs.has(path), data: () => s.docs.has(path) ? JSON.parse(JSON.stringify(s.docs.get(path))) : undefined});
const docRef = (path) => ({path, get: async () => snap(path), set: async (v, o) => write(path, v, o), update: async v => s.docs.set(path, {...s.docs.get(path), ...v}), delete: async () => {s.docs.delete(path);}});
const write = (path, v, o) => s.docs.set(path, o?.merge ? {...s.docs.get(path), ...v} : v);
const query = (prefix, filters = []) => ({
  where: (field, _op, value) => query(prefix, [...filters, [field, value]]), limit: () => query(prefix, filters), select: () => query(prefix, filters),
  get: async () => ({docs: [...s.docs.keys()].filter(path => path.startsWith(prefix + '/') && !path.slice(prefix.length + 1).includes('/') && filters.every(([f, v]) => s.docs.get(path)[f] === v)).map(snap)}),
});
export const db = () => ({doc: docRef, collection: query, runTransaction: async fn => fn({get: ref => ref.get(), set: (ref, v, o) => write(ref.path, v, o)})});
export const bucket = () => ({file: path => ({save: async bytes => {s.files.set(path, bytes);}, delete: async () => {s.files.delete(path);}})});`;
const policyStub = `export class ApiError extends Error {constructor(status, message, code) {super(message); this.status = status; this.code = code;}}
export const id = value => {if (typeof value !== 'string' || !value || value.includes('/')) throw new ApiError(400, 'id'); return value;};`;
const cardsPolicyStub = `import {ApiError} from ${stub(policyStub)};
export const object = value => value;
export const assertDueOpen = () => {if (globalThis.__speaking.locked) throw new ApiError(409, 'locked', 'DUE_LOCKED');};`;
const gamesStub = `import {ApiError} from ${stub(policyStub)};
export async function cardDistributionAccess(ctx, id, tx) {
  const value = globalThis.__speaking.docs.get('cardClassSets/' + id);
  if (!value) throw new ApiError(404, 'missing', 'NOT_FOUND');
  if (ctx.role === 'student' && !value.targetStudentIds.includes(ctx.studentId)) throw new ApiError(404, 'missing', 'NOT_FOUND');
  if (ctx.role !== 'student' && ctx.uid !== value.ownerUid) throw new ApiError(404, 'missing', 'NOT_FOUND');
  return {...JSON.parse(JSON.stringify(value)), id};
}`;
const utilsStub = `export const boundedBytes = async request => new Uint8Array(await request.arrayBuffer());
export const consumeModuleRate = async () => {};`;
const nextStub = `export const NextResponse = {json: (value, init) => ({status: init?.status ?? 200, value})};`;
const wav = dataUrl(compile('../../modules/voice-caption/wav.ts'));
const rules = dataUrl(compile('../cards-speaking.ts').replace("'./storage-export'", stub(compile('../storage-export.ts'))));
let source = compile('./cards-speaking.ts').replace("import 'server-only';", '');
for (const [from, code] of [["'next/server'", nextStub], ["'./admin'", adminStub], ["'./policy'", policyStub], ["'./cards-policy'", cardsPolicyStub], ["'./cards-games'", gamesStub], ["'./signed-urls'", 'export const stableReadUrl = async path => "signed:" + path;'], ["'@/modules/artwork-extensions/server-utils'", utilsStub]]) source = source.replace(from, stub(code));
source = source.replace("'@/modules/voice-caption/wav'", JSON.stringify(wav)).replace("'../cards-speaking'", JSON.stringify(rules));
const {cardSpeaking} = await import(dataUrl(source));
const {pcmWav} = await import(wav);

const SET = 'd1', teacher = {uid: 'owner', role: 'teacher'}, minsu = {uid: 'u1', role: 'student', classId: 'c1', studentId: 's1'}, jia = {uid: 'u2', role: 'student', classId: 'c1', studentId: 's2'};
const card = (id, front) => ({id, front, back: '뜻', example: '', alternatives: []});
const seed = () => {
  state.docs.clear(); state.files.clear(); state.locked = false;
  state.docs.set('cardClassSets/' + SET, {ownerUid: 'owner', classId: 'c1', title: '1과', type: 'word', allStudents: true, targetStudentIds: ['s1', 's2'], snapshot: {type: 'word', cards: [card('a', 'apple'), card('b', 'look after')]}});
  state.docs.set('classes/c1/students/s1', {name: '김민수', number: 1});
  state.docs.set('classes/c1/students/s2', {name: '이지아', number: 2});
};
const audio = (seconds = 1) => pcmWav(new Float32Array(Math.floor(16000 * seconds)));
const send = (method, body, query = '') => new Request('http://local/x' + query, {method, body});
const call = (ctx, method, cardId, body, query) => cardSpeaking(ctx, send(method, body, query), SET, cardId);
const fails = (promise, code, label) => assert.rejects(promise, error => error.code === code, label);
const quota = () => state.docs.get('cardSpeakingStorage/owner')?.usedBytes ?? 0;
const turnOn = () => call(teacher, 'PATCH', undefined, JSON.stringify({enabled: true}));

seed();
await fails(call(minsu, 'POST', 'a', audio()), 'SPEAKING_OFF', 'nothing can be recorded until the teacher turns it on');
assert.equal(state.files.size, 0, 'and no file is kept');
await fails(call(minsu, 'PATCH', undefined, JSON.stringify({enabled: true})), 'NOT_FOUND', 'a student cannot turn it on');
assert.equal((await turnOn()).value.enabled, true);
assert.equal(state.docs.get('cardClassSets/' + SET).speaking, true);
await fails(call(teacher, 'POST', 'a', audio()), 'FORBIDDEN', 'a teacher does not record for a student');
await fails(call(minsu, 'POST', 'zzz', audio()), 'NOT_FOUND', 'only cards of this set');
await fails(call(minsu, 'POST', 'a', new Uint8Array(50)), 'AUDIO_INVALID', 'only real WAV audio');
await fails(call(minsu, 'POST', 'a', audio(0.2)), 'AUDIO_INVALID', 'too short');
await fails(call(minsu, 'POST', 'a', audio(31)), 'AUDIO_INVALID', 'too long');
await fails(call({...minsu, studentId: 'outsider'}, 'POST', 'a', audio()), 'NOT_FOUND', 'only students this set was given to');

const first = await call(minsu, 'POST', 'a', audio());
assert.equal(first.status, 201);
assert.equal(first.value.recorded, 1);
assert.ok(first.value.take.url.startsWith('signed:card-speaking/owner/d1/s1/a/'), 'stored under the teacher, set, student and card');
assert.equal(state.files.size, 1);
const size = audio().length;
assert.equal(quota(), size);

const second = await call(minsu, 'POST', 'a', audio());
assert.equal(state.files.size, 1, 'recording again replaces the old file');
assert.notEqual(second.value.take.takeId, first.value.take.takeId, 'at a new address, so nothing plays the old audio from cache');
assert.equal(quota(), size, 'and the storage figure does not grow');

await fails(call(minsu, 'GET', undefined, undefined, '?all=1'), 'SPEAKING_INCOMPLETE', 'a student downloads only after every card');
await call(minsu, 'POST', 'b', audio());
const mine = await call(minsu, 'GET', undefined, undefined, '?all=1');
assert.deepEqual(mine.value.files.map(file => file.path), ['001_apple.wav', '002_look after.wav'], 'in set order');
const read = await call(minsu, 'GET');
assert.deepEqual([read.value.enabled, read.value.canRecord, Object.keys(read.value.takes).sort()], [true, true, ['a', 'b']]);
assert.deepEqual(Object.keys((await call(jia, 'GET')).value.takes), [], 'a classmate sees none of it');

await call(jia, 'POST', 'a', audio());
const summary = (await call(teacher, 'GET')).value;
assert.equal(summary.total, 2);
assert.deepEqual(summary.students.map(row => [row.name, row.recorded]), [['김민수', 2], ['이지아', 1]]);
assert.deepEqual(Object.keys((await call(teacher, 'GET', undefined, undefined, '?student=s2')).value.takes), ['a'], 'one student at a time');
assert.deepEqual((await call(teacher, 'GET', undefined, undefined, '?all=1')).value.files.map(file => file.path), ['01번_김민수/001_apple.wav', '01번_김민수/002_look after.wav', '02번_이지아/001_apple.wav'], 'each student gets a folder');
assert.deepEqual((await call(teacher, 'GET', undefined, undefined, '?student=s2&all=1')).value.files.map(file => file.path), ['001_apple.wav']);

const beforeFull = state.files.size;
process.env.CARD_SPEAKING_STORAGE_LIMIT_BYTES = String(quota());
await fails(call(jia, 'POST', 'b', audio()), 'SPEAKING_STORAGE_FULL', 'a full teacher storage stops new recordings');
assert.equal(state.files.size, beforeFull, 'and the refused file is removed');
delete process.env.CARD_SPEAKING_STORAGE_LIMIT_BYTES;

state.locked = true;
await fails(call(jia, 'POST', 'b', audio()), 'DUE_LOCKED', 'a locked set takes no new recordings');
assert.equal((await call(jia, 'GET')).value.canRecord, false, 'the screen knows it is listen-only');
state.locked = false;

await call(jia, 'DELETE', 'a');
assert.equal(state.docs.get('cardSpeaking/d1_s2').distributionId, SET, 'removing one recording keeps the record findable');
assert.deepEqual(state.docs.get('cardSpeaking/d1_s2').takes, {});
assert.equal(quota(), size * 2);

await fails(call(minsu, 'DELETE'), 'NOT_FOUND', 'a student cannot clear the class');
await call(teacher, 'DELETE');
assert.equal(state.files.size, 0, 'the teacher can remove every recording');
assert.equal([...state.docs.keys()].filter(key => key.startsWith('cardSpeaking/')).length, 0);
assert.equal(quota(), 0, 'and the storage comes back');

state.docs.get('cardClassSets/' + SET).type = 'drill';
await fails(turnOn(), 'SPEAKING_DRILL', 'practice-question sets have no speaking');
console.log('cards speaking server tests passed');
