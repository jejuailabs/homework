// 카드 개인전 실측. 실제 rooms-server 코드를 Firestore 에뮬레이터에 돌리고, 학생 구독은 웹 SDK로 firestore.rules를 거친다.
// 실행: java -Duser.language=en -Duser.country=US -jar <cloud-firestore-emulator>.jar --host 127.0.0.1 --port 8080 --rules firestore.rules --project_id demo-homework
//       FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/cards-race-check.mjs [학생 수] [문항 수]
// 운영 Firebase에는 절대 닿지 않도록 에뮬레이터 주소와 demo- 프로젝트가 아니면 바로 멈춘다.
import {registerHooks} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import ts from 'typescript';

const host = process.env.FIRESTORE_EMULATOR_HOST || '';
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('FIRESTORE_EMULATOR_HOST must point at a local emulator.');
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON; delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
const projectId = 'demo-homework';
process.env.FIREBASE_PROJECT_ID = projectId; process.env.GCLOUD_PROJECT = projectId; process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = projectId;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), src = path.join(root, 'src');
const candidates = base => [base, `${base}.ts`, path.join(base, 'index.ts')].find(file => fs.existsSync(file) && fs.statSync(file).isFile());
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return {url: 'data:text/javascript,', shortCircuit: true};
    // Rooms use Firestore only; these two pull in ESM packages that Node's module hooks cannot link.
    if (specifier === 'firebase-admin/auth') return {url: 'data:text/javascript,export const getAuth = () => null;', shortCircuit: true};
    if (specifier === 'firebase-admin/storage') return {url: 'data:text/javascript,export const getStorage = () => null;', shortCircuit: true};
    if (specifier.startsWith('@/') || specifier.startsWith('.') && context.parentURL?.startsWith('file:') && context.parentURL.includes('/src/')) {
      const base = specifier.startsWith('@/') ? path.join(src, specifier.slice(2)) : path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier), file = candidates(base);
      if (file) return {url: pathToFileURL(file).href, shortCircuit: true};
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.ts')) return {format: 'module', source: ts.transpileModule(fs.readFileSync(fileURLToPath(url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText, shortCircuit: true};
    return next(url, context);
  },
});

const players = Number(process.argv[2] || 30), rounds = Number(process.argv[3] || 8), seconds = 60;
const {initializeApp, deleteApp} = await import('firebase/app');
const web = await import('firebase/firestore');
const {db} = await import('@/lib/server/admin');
const {handleRoomRequest} = await import('@/modules/playground/rooms-server');
const {choicesFor, isItemAnswer} = await import('@/modules/playground/engine');
const errors = [], clients = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const request = (method, ctx, segments, data = {}) => handleRoomRequest(new Request(`http://race.test/api/playground/${segments.join('/')}`, {method}), ctx, segments, data);
const student = index => ({uid: `u${index}`, email: null, displayName: null, role: 'student', classId: 'class-a', studentId: `s${index}`, authVersion: 0});
const teacher = {uid: 'teacher-a', email: null, displayName: null, role: 'teacher'};
const clientApp = (name, uid, claims = {}) => {const app = initializeApp({projectId, apiKey: 'demo'}, name), store = web.getFirestore(app); web.connectFirestoreEmulator(store, '127.0.0.1', Number(host.split(':')[1]), {mockUserToken: {sub: uid, user_id: uid, ...claims}}); clients.push({app}); return store;};
const check = (ok, label) => {console.log(`  ${ok ? 'ok' : 'FAILED'}: ${label}`); if (!ok) errors.push(label);};
const expectFailure = async (label, run, status) => {
  try {await run();} catch (error) {if (status !== undefined && error.status !== status) {check(false, `${label}: expected ${status}, got ${error.status} ${error.message}`); return;} check(true, `refused: ${label} (${error.status ?? error.code})`); return;}
  check(false, `${label}: was allowed`);
};

const store = db();
await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {method: 'DELETE'});
await store.doc('classes/class-a').set({ownerUid: teacher.uid, name: '3-2', grade: 3});
await store.doc(`users/${teacher.uid}`).set({role: 'teacher'});
for (let index = 0; index < players; index++) {
  await store.doc(`classes/class-a/students/s${index}`).set({name: `학생${index}`, character: 'cat', authUid: `u${index}`, wardrobeOwned: [], spaceOwned: []});
  await store.doc(`users/u${index}`).set({role: 'student', classId: 'class-a', studentId: `s${index}`, authVersion: 0});
}
const cards = Array.from({length: 12}, (_, index) => ({id: `card${index}`, front: `word ${index}`, back: `뜻 ${index}`, example: '', alternatives: []}));
await store.doc('cardSets/set-a').set({ownerUid: teacher.uid, title: '시험 세트', versionId: 'version-a', archived: false});
await store.doc('cardSetVersions/version-a').set({ownerUid: teacher.uid, cards});

console.log('gates');
const base = {mode: 'race', cardSetId: 'set-a', classId: 'class-a', direction: 'front-back', rounds, seconds};
await expectFailure('a student opening a race', () => request('POST', student(0), ['rooms'], {...base, requestId: 'g1'}), 404);
await expectFailure('a race across classes', () => request('POST', teacher, ['rooms'], {...base, versusClassIds: ['class-a', 'class-b'], requestId: 'g2'}), 400);
await expectFailure('a typed race', () => request('POST', teacher, ['rooms'], {...base, answer: 'typed', requestId: 'g3'}), 400);
await expectFailure('a race without a card set', () => request('POST', teacher, ['rooms'], {mode: 'race', classId: 'class-a', rounds, seconds, requestId: 'g4'}));
await expectFailure('a race clock under 30 seconds', () => request('POST', teacher, ['rooms'], {...base, seconds: 10, requestId: 'g5'}), 400);
const created = await request('POST', teacher, ['rooms'], {...base, requestId: 'race-room'}), roomId = created.roomId;
const roomOf = async () => (await store.doc(`playRooms/${roomId}`).get()).data();
check((await roomOf()).mode === 'race' && (await roomOf()).questionMs === seconds * 1000, 'race room stores one clock for the game');

console.log('join and start');
const pupils = Array.from({length: players}, (_, index) => ({index, ctx: student(index)}));
for (const pupil of pupils) {await request('POST', pupil.ctx, ['rooms', 'join'], {code: created.code}); await request('GET', pupil.ctx, ['rooms', roomId]);}
check(!(await request('GET', pupils[0].ctx, ['rooms', roomId, 'race'])).question, 'no question in the lobby');
const s0 = clientApp('s0', 'u0', {authVersion: 0}), s1 = clientApp('s1', 'u1', {authVersion: 0});
await web.getDoc(web.doc(s0, 'playRooms', roomId));
await expectFailure('a student reading the answer bank', () => web.getDoc(web.doc(s0, 'playRooms', roomId, 'secrets', '0')));
await expectFailure('a student reading the answers', () => web.getDocs(web.collection(s0, 'playRooms', roomId, 'answers')));
await expectFailure('a student reading another student', () => web.getDoc(web.doc(s0, 'playRooms', roomId, 'players', 's1')));
let ownScore = null;
web.onSnapshot(web.doc(s1, 'playRooms', roomId, 'players', 's1'), snapshot => {ownScore = snapshot.data()?.score ?? null;}, error => errors.push(`listener ${error.code}`));
await request('POST', teacher, ['rooms', roomId, 'start'], {status: 'lobby', round: -1});
await sleep(3100);
await request('POST', teacher, ['rooms', roomId, 'tick']);
check((await roomOf()).status === 'question', 'the clock is running');
check((await store.collection(`playRooms/${roomId}/rounds`).get()).empty, 'no shared round documents in a race');

console.log('answers');
const firsts = await Promise.all(pupils.map(pupil => request('GET', pupil.ctx, ['rooms', roomId, 'race'])));
check(new Set(firsts.map(view => view.question.round)).size > 1, `students start on different questions (${new Set(firsts.map(view => view.question.round)).size} distinct)`);
check(firsts.every(view => !JSON.stringify(view).includes('correctChoiceId')), 'a question carries no answer');
const truth = new Map();
const correctId = async index => {if (!truth.has(index)) {const {item} = (await store.doc(`playRooms/${roomId}/secrets/${index}`).get()).data(); truth.set(index, choicesFor(item, `${roomId}:${index}`).find(choice => isItemAnswer(item, choice.label)).id);} return truth.get(index);};
const latency = [];
// Student i misses every (i % 3 + 2)-th question; the last three students leave early to test the end rule.
await Promise.all(pupils.map(async (pupil, i) => {
  let view = firsts[i];
  const stopAt = i >= players - 3 ? 3 : rounds;
  while (view.question && view.step < stopAt) {
    await sleep(100 + Math.random() * 400);
    const right = await correctId(view.question.round), wrong = view.question.choices.find(choice => choice.id !== right).id;
    const choiceId = (view.step + 1) % (i % 3 + 2) === 0 ? wrong : right, before = Date.now();
    const result = await request('POST', pupil.ctx, ['rooms', roomId, 'race'], {step: view.step, choiceId});
    latency.push(Date.now() - before);
    if (result.correct !== (choiceId === right) || result.correctChoiceId !== right) errors.push(`grading of student ${i}`);
    if (i === 0 && view.step === 0) {
      const again = await request('POST', pupil.ctx, ['rooms', roomId, 'race'], {step: 0, choiceId});
      check(again.correct === result.correct && again.next.step === 1, 'a retried answer is not counted twice');
      await expectFailure('skipping ahead a question', () => request('POST', pupil.ctx, ['rooms', roomId, 'race'], {step: 3, choiceId}), 409);
    }
    view = result.next;
  }
  if (stopAt < rounds) await request('POST', pupil.ctx, ['rooms', roomId, 'leave']);
}));
check(!errors.some(error => error.startsWith('grading')), 'every answer graded by the server');
await sleep(300);
const finished = await roomOf();
check(finished.status === 'finished' && finished.completion === 'complete', 'the race ends once every student still playing has finished');
check(finished.settled === true, 'the room settled');
check(ownScore !== null && ownScore > 0, `a student sees their own score live (${ownScore})`);
const playerDocs = (await store.collection(`playRooms/${roomId}/players`).get()).docs.map(row => row.data());
const expected = i => i >= players - 3 ? null : Array.from({length: rounds}, (_, step) => (step + 1) % (i % 3 + 2) === 0 ? 0 : 100).reduce((a, b) => a + b, 0);
check(playerDocs.every(row => {const i = Number(row.key.slice(1)); return expected(i) === null || row.score === expected(i) && row.raceCorrect === expected(i) / 100 && row.answered === rounds;}), 'scores match the answers');
check(finished.players.every(row => typeof row.raceCorrect === 'number'), 'the final ranking carries right-answer counts');
const replay = await request('POST', pupils[1].ctx, ['rooms', roomId, 'race'], {step: rounds - 1, choiceId: 'x'});
const afterReplay = (await store.doc(`playRooms/${roomId}/players/s1`).get()).data();
check(!replay.next.question && afterReplay.score === expected(1) && afterReplay.answered === rounds, 'an answer sent after the end changes nothing');

console.log('results');
const {review} = await request('GET', teacher, ['rooms', roomId, 'review']);
check(review.length > 0 && review.every(item => item.answer && item.wrong <= item.total && item.total > 0), `teacher review lists ${review.length} questions`);
await expectFailure('a student opening the class review', () => request('GET', pupils[0].ctx, ['rooms', roomId, 'review']), 403);
const {misses} = await request('GET', pupils[1].ctx, ['rooms', roomId, 'race-misses']);
check(misses.length === Math.floor(rounds / 3) && misses.every(miss => miss.answer && miss.chosen && miss.answer !== miss.chosen), `student 1 sees their ${misses.length} misses`);
const {misses: zeroMisses} = await request('GET', pupils[0].ctx, ['rooms', roomId, 'race-misses']);
check(zeroMisses.length === Math.floor(rounds / 2), `student 0 sees their ${zeroMisses.length} misses`);
await store.doc('classes/class-a/settings/playground').set({rewardsEnabled: true});
await request('POST', teacher, ['rooms', roomId, 'reward'], {amount: 2}).then(() => check(true, 'the teacher can give the class reward'), error => check(false, `reward: ${error.message}`));

const paid = (await store.doc('classes/class-a/students/s0/pointLedger/playground_team_' + roomId).get()).data();
check(paid?.amount === 2 && paid.reason === '카드 개인전 참여', 'the reward is recorded as a solo race');

console.log('time limit');
const timed = await request('POST', teacher, ['rooms'], {...base, seconds: 30, requestId: 'race-timed'});
await request('POST', pupils[0].ctx, ['rooms', 'join'], {code: timed.code});
await request('POST', teacher, ['rooms', timed.roomId, 'start'], {status: 'lobby', round: -1});
await sleep(3100); await request('POST', teacher, ['rooms', timed.roomId, 'tick']);
const late = await request('GET', pupils[0].ctx, ['rooms', timed.roomId, 'race']);
await store.doc(`playRooms/${timed.roomId}`).update({roundEndsAt: Date.now() - 1000, statusEndsAt: Date.now() - 500});
await expectFailure('an answer after the clock ran out', () => request('POST', pupils[0].ctx, ['rooms', timed.roomId, 'race'], {step: 0, choiceId: late.question.choices[0].id}), 409);
await request('GET', pupils[0].ctx, ['rooms', timed.roomId, 'state']);
check((await store.doc(`playRooms/${timed.roomId}`).get()).data().status === 'finished', 'the clock ends the race');

const sorted = [...latency].sort((a, b) => a - b);
console.log(JSON.stringify({players, rounds, answers: latency.length, answerMsP50: sorted[Math.floor(sorted.length / 2)], answerMsP95: sorted[Math.floor(sorted.length * .95)], errors}, null, 1));
await Promise.allSettled(clients.map(client => deleteApp(client.app)));
process.exit(errors.length ? 1 : 0);
