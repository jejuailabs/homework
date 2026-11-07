// 30명 카드 팀전 실측. 실제 rooms-server 코드를 Firestore 에뮬레이터에 돌리고, 학생·교사 구독은 웹 SDK로 firestore.rules를 거친다.
// 실행: java -Duser.language=en -Duser.country=US -jar <cloud-firestore-emulator>.jar --host 127.0.0.1 --port 8080 --rules firestore.rules --project_id demo-homework
//       FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/cards-room-load.mjs [학생 수] [문항 수] [입장 분산 ms]
// 운영 Firebase에는 절대 닿지 않도록 에뮬레이터 주소와 demo- 프로젝트가 아니면 바로 멈춘다.
import {registerHooks} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
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

const players = Number(process.argv[2] || 30), rounds = Number(process.argv[3] || 5), seconds = 10;
const require = createRequire(import.meta.url);
const {initializeApp, deleteApp} = await import('firebase/app');
const web = await import('firebase/firestore');
const {db} = await import('@/lib/server/admin');
const {handleRoomRequest} = await import('@/modules/playground/rooms-server');
const {AsyncLocalStorage} = await import('node:async_hooks');
const scope = new AsyncLocalStorage(), errors = [];
const firestoreLib = require('@google-cloud/firestore');

// Server-side reads and writes, per phase, the way Firestore bills them: one per document.
const zero = () => ({reads: 0, writes: 0}), phases = new Map();
let phase = 'seed';
const tally = () => {const name = scope.getStore()?.phase ?? phase; if (!phases.has(name)) phases.set(name, zero()); return phases.get(name);};
const reads = n => {tally().reads += n;}, writes = n => {tally().writes += n;};
const {Transaction, DocumentReference, Query, WriteBatch, Firestore} = firestoreLib;
const wrap = (proto, name, count) => {const original = proto[name]; proto[name] = function (...args) {const result = original.apply(this, args); count(result, args); return result;};};
wrap(Transaction.prototype, 'get', result => {Promise.resolve(result).then(value => reads(value?.docs ? value.docs.length || 1 : 1), () => {});});
for (const name of ['create', 'set', 'update', 'delete']) wrap(Transaction.prototype, name, () => writes(1));
wrap(DocumentReference.prototype, 'get', () => reads(1));
wrap(Query.prototype, 'get', result => {Promise.resolve(result).then(value => reads(value.docs.length || 1), () => {});});
wrap(Firestore.prototype, 'getAll', (_result, args) => reads(args.length));

// Realtime deliveries, one per document change a listener receives.
const listeners = {roomStudent: 0, roundStudent: 0, playerStudent: 0, roomTeacher: 0, roundTeacher: 0, playerTeacher: 0}, refused = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const request = (method, ctx, segments, data = {}) => handleRoomRequest(new Request(`http://load.test/api/playground/${segments.join('/')}`, {method}), ctx, segments, data);
const student = index => ({uid: `u${index}`, email: null, displayName: null, role: 'student', classId: 'class-a', studentId: `s${index}`, authVersion: 0});
const teacher = {uid: 'teacher-a', email: null, displayName: null, role: 'teacher'};
const clientApp = (name, uid, claims = {}) => {const app = initializeApp({projectId, apiKey: 'demo'}, name), store = web.getFirestore(app); web.connectFirestoreEmulator(store, '127.0.0.1', Number(host.split(':')[1]), {mockUserToken: {sub: uid, user_id: uid, ...claims}}); return {app, store};};

async function seed() {
  const store = db(), batch = () => store.batch();
  await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {method: 'DELETE'});
  await store.doc('classes/class-a').set({ownerUid: teacher.uid, name: '3-2', grade: 3});
  await store.doc('classes/class-b').set({ownerUid: 'teacher-b', name: '다른 반', grade: 3});
  await store.doc(`users/${teacher.uid}`).set({role: 'teacher'});
  await store.doc('users/outsider').set({role: 'student', classId: 'class-b', studentId: 's0', authVersion: 0});
  for (let start = 0; start < players; start += 50) {
    const write = batch();
    for (let index = start; index < Math.min(players, start + 50); index++) {
      write.set(store.doc(`classes/class-a/students/s${index}`), {name: `학생${index}`, character: 'cat', authUid: `u${index}`, wardrobeOwned: [], spaceOwned: []});
      write.set(store.doc(`users/u${index}`), {role: 'student', classId: 'class-a', studentId: `s${index}`, authVersion: 0});
    }
    await write.commit();
  }
  const cards = Array.from({length: 20}, (_, index) => ({id: `card${index}`, front: `word ${index}`, back: `뜻 ${index}`, example: '', alternatives: []}));
  await store.doc('cardSets/set-a').set({ownerUid: teacher.uid, title: '시험 세트', versionId: 'version-a', archived: false});
  await store.doc('cardSetVersions/version-a').set({ownerUid: teacher.uid, cards});
  await store.doc('cardSets/set-other').set({ownerUid: 'teacher-b', title: '남의 세트', versionId: 'version-a', archived: false});
  await store.doc('cardSets/set-same').set({ownerUid: teacher.uid, title: '답이 하나', versionId: 'version-same', archived: false});
  await store.doc('cardSetVersions/version-same').set({ownerUid: teacher.uid, cards: [{id: 'x', front: 'a', back: '같음', example: '', alternatives: []}, {id: 'y', front: 'b', back: '같음', example: '', alternatives: []}]});
}
const expectFailure = async (label, run, status) => {
  try {await run();} catch (error) {if (status && error.status !== status) throw new Error(`${label}: expected ${status}, got ${error.status} ${error.message}`); console.log(`  ok refused: ${label} (${error.status ?? error.code})`); return;}
  throw new Error(`${label}: was allowed`);
};

await seed();
phase = 'create';
const cardRequest = {mode: 'team', classId: 'class-a', direction: 'front-back', rounds, seconds, teamCount: 3};
console.log('gates');
await expectFailure('another teacher\'s set', () => request('POST', teacher, ['rooms'], {...cardRequest, cardSetId: 'set-other', requestId: 'r1'}), 404);
await expectFailure('a set with one distinct answer', () => request('POST', teacher, ['rooms'], {...cardRequest, cardSetId: 'set-same', requestId: 'r2'}), 409);
await expectFailure('a student opening a card room', () => request('POST', student(0), ['rooms'], {...cardRequest, cardSetId: 'set-a', requestId: 'r3'}), 404);
await expectFailure('a playground team room with the class setting off', () => request('POST', teacher, ['rooms'], {mode: 'team', classId: 'class-a', rounds: 3, seconds: 10, teamCount: 2, requestId: 'r4'}), 403);
// Playground rooms must keep answering to the class setting.
const settingsDoc = db().doc('classes/class-a/settings/playground'), plain = {mode: 'team', classId: 'class-a', rounds: 3, seconds: 10, teamCount: 2, requestId: 'r5'};
await settingsDoc.set({enabled: true});
const playRoom = await request('POST', teacher, ['rooms'], plain);
await settingsDoc.set({enabled: false});
await expectFailure('a student joining a playground room with the setting off', () => request('POST', student(0), ['rooms', 'join'], {code: playRoom.code}), 403);
await settingsDoc.set({enabled: true});
await request('POST', student(0), ['rooms', 'join'], {code: playRoom.code});
await request('POST', student(1), ['rooms', 'join'], {code: playRoom.code});
const regress = clientApp('regress', 'u0', {authVersion: 0});
await web.getDoc(web.doc(regress.store, 'playRooms', playRoom.roomId));
await settingsDoc.set({enabled: false});
await expectFailure('a student subscribing to a playground room with the setting off', () => web.getDoc(web.doc(regress.store, 'playRooms', playRoom.roomId)));
await deleteApp(regress.app);
await settingsDoc.delete();
await request('POST', teacher, ['rooms', playRoom.roomId, 'end'], {status: 'lobby', round: -1});
phases.delete('create');
const created = await request('POST', teacher, ['rooms'], {...cardRequest, cardSetId: 'set-a', requestId: 'load-room'});
const roomId = created.roomId;

// Teacher host screen: same three listeners as use-play-room.ts.
const clients = [];
const teacherClient = clientApp('teacher', teacher.uid);
clients.push(teacherClient);
let room = null, roster = [], roundOff = null, watching = -2, question = null;
await request('GET', teacher, ['rooms', roomId]);
const failed = who => error => refused.push(`${who}: ${error.code}`);
web.onSnapshot(web.doc(teacherClient.store, 'playRooms', roomId), snapshot => {
  listeners.roomTeacher++; room = snapshot.data();
  if (room && watching !== room.round) {watching = room.round; roundOff?.(); if (room.round >= 0) roundOff = web.onSnapshot(web.doc(teacherClient.store, 'playRooms', roomId, 'rounds', String(room.round)), roundSnapshot => {listeners.roundTeacher++; question = roundSnapshot.data() ?? null;}, failed('teacher round'));}
}, failed('teacher room'));
web.onSnapshot(web.collection(teacherClient.store, 'playRooms', roomId, 'players'), snapshot => {listeners.playerTeacher += snapshot.docChanges().length; roster = snapshot.docs.map(row => row.data());}, failed('teacher players'));

phase = 'join';
const pupils = Array.from({length: players}, (_, index) => ({index, ctx: student(index), round: -2, question: null, roomState: null, answeredRound: -1}));
const joinSpreadMs = Number(process.argv[4] ?? 15_000), joinTimes = [], timers = [];
const beat = ctx => scope.run({phase: 'heartbeat'}, () => request('POST', ctx, ['rooms', roomId, 'heartbeat'])).catch(error => errors.push(`heartbeat ${error.message}`));
timers.push(setInterval(() => void beat(teacher), 10_000));
const attach = pupil => {
  const client = clientApp(`s${pupil.index}`, pupil.ctx.uid, {authVersion: 0}); clients.push(client); pupil.client = client;
  web.onSnapshot(web.doc(client.store, 'playRooms', roomId), snapshot => {
    listeners.roomStudent++; const value = snapshot.data(); pupil.roomState = value;
    if (value && pupil.round !== value.round) {pupil.round = value.round; pupil.roundOff?.(); if (value.round >= 0) pupil.roundOff = web.onSnapshot(web.doc(client.store, 'playRooms', roomId, 'rounds', String(value.round)), roundSnapshot => {listeners.roundStudent++; pupil.question = roundSnapshot.data() ?? null;}, failed(`student ${pupil.index} round`));}
  }, failed(`student ${pupil.index} room`));
  web.onSnapshot(web.doc(client.store, 'playRooms', roomId, 'players', pupil.ctx.studentId), () => {listeners.playerStudent++;}, failed(`student ${pupil.index} player`));
};
const joinStarted = Date.now();
// Like the classroom: students type the code over a few seconds, each subscribing and beating on its own clock.
await Promise.all(pupils.map(async pupil => {
  await sleep(Math.random() * joinSpreadMs);
  const before = Date.now();
  await request('POST', pupil.ctx, ['rooms', 'join'], {code: created.code}); await request('GET', pupil.ctx, ['rooms', roomId]);
  joinTimes.push(Date.now() - before); attach(pupil); timers.push(setInterval(() => void beat(pupil.ctx), 10_000));
}));
const joinMs = Date.now() - joinStarted;
console.log(`join: ${players} students in ${joinMs}ms (spread ${joinSpreadMs}ms), code ${created.code}`);
await sleep(1500);
if (refused.length) throw new Error(`listeners refused: ${refused.slice(0, 3).join(', ')}`);

console.log('rules');
const outsider = clientApp('outsider', 'outsider', {authVersion: 0}); clients.push(outsider);
await expectFailure('a student reading the answer bank', () => web.getDoc(web.doc(pupils[0].client.store, 'playRooms', roomId, 'secrets', '0')));
await expectFailure('a student reading the answers', () => web.getDocs(web.collection(pupils[0].client.store, 'playRooms', roomId, 'answers')));
await expectFailure('a student listing every player', () => web.getDocs(web.collection(pupils[0].client.store, 'playRooms', roomId, 'players')));
await expectFailure('a student from another class', () => web.getDoc(web.doc(outsider.store, 'playRooms', roomId)));
const roomDocBytes = Buffer.byteLength(JSON.stringify((await db().doc(`playRooms/${roomId}`).get()).data()));

const waitFor = async (test, label, limit = 30_000) => {const until = Date.now() + limit; while (!test()) {if (Date.now() > until) throw new Error(`timed out: ${label}`); await sleep(50);}};
const percentile = (values, share) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * share))] ?? 0;
const answerMs = [], revealMs = [], questionMs = [];
let answered = 0;
const lobbyListeners = {...listeners}, gameStarted = Date.now();

phase = 'start';
await request('POST', teacher, ['rooms', roomId, 'start'], {status: 'lobby', round: -1});
await waitFor(() => room?.status === 'countdown', 'countdown');
await sleep(3100);
phase = 'countdown tick';
await request('POST', teacher, ['rooms', roomId, 'tick']);
for (let round = 0; round < rounds; round++) {
  const opened = Date.now();
  await waitFor(() => pupils.every(pupil => pupil.question?.round === round && pupil.roomState?.status === 'question'), `round ${round} to reach everyone`);
  questionMs.push(Date.now() - opened);
  phase = 'answers';
  await Promise.all(pupils.map(async pupil => {
    await sleep(500 + Math.random() * 3500);
    const {choices} = pupil.question, choice = choices[Math.floor(Math.random() * choices.length)], before = Date.now();
    await scope.run({phase: 'answers'}, () => request('POST', pupil.ctx, ['rooms', roomId, 'answer'], {round, choiceId: choice.id}));
    answerMs.push(Date.now() - before); answered++;
  }));
  await waitFor(() => roster.filter(member => member.answeredRound === round).length === players, 'answers to reach the host');
  phase = 'reveal tick';
  const revealing = Date.now();
  await request('POST', teacher, ['rooms', roomId, 'tick']);
  await waitFor(() => pupils.every(pupil => pupil.question?.round === round && pupil.question?.correctChoiceId), `reveal ${round} to reach everyone`);
  revealMs.push(Date.now() - revealing);
  await sleep(1500);
  phase = 'next';
  await request('POST', teacher, ['rooms', roomId, 'next'], {status: 'reveal', round});
}
await waitFor(() => room?.status === 'finished', 'finish');
await sleep(800);
timers.forEach(clearInterval);
const gameMs = Date.now() - gameStarted, gameListeners = Object.fromEntries(Object.entries(listeners).map(([key, value]) => [key, value - lobbyListeners[key]]));
phase = 'review';
const {review} = await request('GET', teacher, ['rooms', roomId, 'review']);
await expectFailure('a student opening the review', () => request('GET', pupils[0].ctx, ['rooms', roomId, 'review']), 403);

const store = db(), settled = (await store.doc(`playRooms/${roomId}`).get()).data();
const answerDocs = await store.collection(`playRooms/${roomId}/answers`).get(), playerDocs = (await store.collection(`playRooms/${roomId}/players`).get()).docs.map(row => row.data());
const totals = [...phases.values()].reduce((sum, row) => ({reads: sum.reads + row.reads, writes: sum.writes + row.writes}), zero());
const check = (ok, label) => {console.log(`  ${ok ? 'ok' : 'FAILED'}: ${label}`); if (!ok) errors.push(label);};
console.log('results');
check(answerDocs.size === players * rounds, `${answerDocs.size} answers stored of ${players * rounds}`);
check(settled.status === 'finished' && settled.settled === true && settled.completion === 'complete', 'room finished and settled');
check(settled.teams.every(team => {const members = playerDocs.filter(row => row.team === team.id); return !members.length || Math.abs(team.score - members.reduce((sum, row) => sum + row.score, 0) / members.length) < 1e-9;}), 'each team score is the average of its members');
check(review.length > 0 && review.every(item => item.answer && item.wrong <= item.total), `review returned ${review.length} questions`);
check(!refused.length, `no listener refused (${refused.length})`);
check(!(await store.collection(`playRooms/${roomId}/rounds`).get()).docs.some(row => JSON.stringify(row.data()).includes('alternatives')), 'round documents carry no card data beyond the question');
const summary = {players, rounds, secondsPerQuestion: seconds, gameMs, joinMs, roomDocBytes, answersPerRound: answered / rounds,
  serverPerPhase: Object.fromEntries(phases), serverTotal: totals, listenerDeliveriesDuringGame: gameListeners, listenerDeliveriesWhole: listeners, listenerDeliveriesTotal: Object.values(listeners).reduce((sum, value) => sum + value, 0),
  latencyMs: {joinP50: percentile(joinTimes, .5), joinP95: percentile(joinTimes, .95), joinMax: Math.max(...joinTimes), answerP50: percentile(answerMs, .5), answerP95: percentile(answerMs, .95), answerMax: Math.max(...answerMs), questionToEveryone: Math.max(...questionMs), revealToEveryone: Math.max(...revealMs)}, refused: refused.length, errors};
console.log(JSON.stringify(summary, null, 1));
await Promise.allSettled(clients.map(client => deleteApp(client.app)));
process.exit(errors.length ? 1 : 0);
