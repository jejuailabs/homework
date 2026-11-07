// 카드놀이 서버 통합 점검. 실제 handleCards·auth·lesson-reports 코드를 Firestore 에뮬레이터에 돌린다.
// 가짜인 것: 세션 쿠키 검증과 Auth 사용자 조회(firebase-admin/auth), OpenAI 호출(fetch). 나머지는 운영과 같은 코드다.
// 실행: java -Duser.language=en -Duser.country=US -jar <cloud-firestore-emulator>.jar --host 127.0.0.1 --port 8080 --rules firestore.rules --project_id demo-homework
//       FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/cards-flow-check.mjs [구역 이름...]
// 구역: study edited tests deadline patch old room berry ai games mastery class guard family counted pages transfer clone. 운영 Firebase에는 절대 닿지 않도록 에뮬레이터 주소가 아니면 바로 멈춘다.
import {registerHooks} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import ts from 'typescript';

const host = process.env.FIRESTORE_EMULATOR_HOST || '';
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('FIRESTORE_EMULATOR_HOST must point at a local emulator.');
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON; delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
const projectId = 'demo-homework';
Object.assign(process.env, {STUDENT_CODE_ENCRYPTION_KEY: (await import('node:crypto')).randomBytes(32).toString('base64'), FIREBASE_PROJECT_ID: projectId, GCLOUD_PROJECT: projectId, NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId, AUTH_CONTEXT_CACHE_MS: '0', OPENAI_API_KEY: 'stub-not-a-key', OPENAI_MODEL: 'stub-model'});
delete process.env.AI_REQUEST_LIMITS;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), src = path.join(root, 'src');
const candidates = base => [base, `${base}.ts`, path.join(base, 'index.ts')].find(file => fs.existsSync(file) && fs.statSync(file).isFile());
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return {url: 'data:text/javascript,', shortCircuit: true};
    if (specifier === 'firebase-admin/auth') return {url: 'data:text/javascript,export const getAuth = () => globalThis.__fakeAuth;', shortCircuit: true};
    if (specifier === 'firebase-admin/storage') return {url: 'data:text/javascript,export const getStorage = () => null;', shortCircuit: true};
    if (specifier === 'next/server') return {url: 'data:text/javascript,export const NextResponse = {json: (value, init) => Response.json(value, init)}; export const after = () => {};', shortCircuit: true};
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
// auth.ts stays real. Only what Firebase Auth itself would answer is faked: the cookie names the user, and every account is a verified Google one.
globalThis.__fakeAuth = {
  verifySessionCookie: async cookie => {const [uid, version] = cookie.split(':'); if (!uid) throw new Error('bad cookie'); return {uid, auth_time: Math.floor(Date.now() / 1000), ...(version === undefined ? {} : {authVersion: Number(version)})};},
  getUser: async uid => ({uid, disabled: false, email: `${uid}@demo.test`, displayName: uid, emailVerified: true, providerData: [{providerId: 'google.com'}]}),
};

const {db} = await import('@/lib/server/admin');
const {handleCards} = await import('@/lib/server/cards');
const {lessonReports} = await import('@/lib/server/lesson-reports');
const {callClassroomTool} = await import('@/modules/berry-connector/classroom-tools');
const logic = await import('@/lib/cards-logic');

let passed = 0;
const failures = [];
const section = name => console.log(`\n# ${name}`);
const check = (ok, label, detail) => {if (ok) {passed++; console.log(`  ok  ${label}`);} else {failures.push(label); console.log(`  FAIL ${label}${detail === undefined ? '' : ` -> ${JSON.stringify(detail).slice(0, 400)}`}`);}};
const same = (actual, expected, label) => check(JSON.stringify(actual) === JSON.stringify(expected), label, {actual, expected});
const iso = offsetMs => new Date(Date.now() + offsetMs).toISOString();
const MIN = 60_000, HOUR = 60 * MIN;

const call = async (who, method, segments, body, options = {}) => {
  const url = `http://cards.test/api/cards/${segments.join('/')}${options.query ?? ''}`;
  const headers = {'content-type': 'application/json', ...(who ? {cookie: `__session=${who}`} : {}), ...(options.headers ?? {})};
  const response = await handleCards(new Request(url, {method, headers, ...(body === undefined ? {} : {body: typeof body === 'string' ? body : JSON.stringify(body)})}), segments);
  return {status: response.status, data: await response.json()};
};
const refused = (result, status, code, label) => check(result.status === status && (!code || result.data.code === code), label, {status: result.status, data: result.data});
const accepted = (result, label) => check(result.status >= 200 && result.status < 300, label, result);

const teacher = 'teacher-a', stranger = 'teacher-b', pupil = n => `u${n}:0`;
const cards = Array.from({length: 12}, (_, index) => ({id: `card${index}`, front: `word ${index}`, back: `뜻 ${index}`, example: '', alternatives: index === 0 ? ['의미 0'] : []}));
const byFront = new Map(cards.map(card => [card.front, card])), byBack = new Map(cards.map(card => [card.back, card]));

async function seed() {
  // A transaction a previous run left open holds its locks for a while, and the clear answers 409 until they expire.
  for (let tries = 0; ; tries++) {
    const cleared = await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {method: 'DELETE'});
    if (cleared.ok) break;
    if (tries >= 30) throw new Error(`the emulator did not clear: ${cleared.status}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  const store = db();
  await store.doc('classes/class-a').set({ownerUid: teacher, name: '3-2', grade: 3});
  await store.doc('classes/class-b').set({ownerUid: stranger, name: '다른 반', grade: 3});
  await store.doc(`users/${teacher}`).set({role: 'teacher'});
  await store.doc(`users/${stranger}`).set({role: 'teacher'});
  for (const index of [1, 2, 3, 4]) await addStudent(index);
  await store.doc('users/u9').set({role: 'student', classId: 'class-b', studentId: 's9', authVersion: 0});
  await store.doc('classes/class-b/students/s9').set({name: '옆반', number: 1, authUid: 'u9'});
}
async function addStudent(index, extra = {}) {
  await db().doc(`classes/class-a/students/s${index}`).set({name: `학생${index}`, number: index, authUid: `u${index}`, ...extra});
  await db().doc(`users/u${index}`).set({role: 'student', classId: 'class-a', studentId: `s${index}`, authVersion: 0});
}
let setId, setVersion = 1;
async function makeSet() {
  const created = await call(teacher, 'POST', ['sets'], {title: '점검 세트', description: '', type: 'word', folderId: null, cards, requestId: 'set-1'});
  accepted(created, 'teacher creates the set through the API');
  setId = created.data.set.id; setVersion = created.data.set.version;
}
let serial = 0;
async function distribute(input = {}) {
  const result = await call(teacher, 'POST', ['distributions'], {classId: 'class-a', setId, expectedVersion: setVersion, requestId: `dist-${++serial}`, ...input});
  if (result.status !== 201) throw new Error(`distribution failed: ${JSON.stringify(result)}`);
  return result.data.distribution;
}
const study = (who, distributionId, mode, requestId, responses, extra = {}) => call(who, 'POST', ['distributions', distributionId, 'study'], {requestId, mode, direction: 'front-back', responses, ...extra});
const right = (...indexes) => indexes.map(index => ({cardId: cards[index].id, answer: cards[index].back}));
const start = (who, distributionId, requestId, extra = {}) => call(who, 'POST', ['distributions', distributionId, 'tests'], {requestId, ...extra});
const submit = (who, distributionId, attemptId, answers) => call(who, 'POST', ['distributions', distributionId, 'tests', attemptId, 'submit'], {answers});
const answerFor = (question, direction, wrong = false) => {
  const card = direction === 'front-back' ? byFront.get(question.prompt) : byBack.get(question.prompt);
  return {questionId: question.id, answer: wrong ? '모르겠어요' : direction === 'front-back' ? card.back : card.front};
};
const report = async distributionId => (await call(teacher, 'GET', ['distributions', distributionId, 'report'])).data;
const reported = (data, studentId) => data.students?.find(row => row.id === studentId);
const secretsIn = attempt => JSON.stringify(attempt).match(/expectedAnswer|"correct"|"results"/g);

async function studySection() {
  section('study batch');
  const distribution = await distribute({requiredModes: {recall: {requiredCount: 12, direction: 'front-back', rangeStart: 1, rangeEnd: 12}}}), base = distribution.id;
  const first = await study(pupil(1), base, 'recall', 'batch-1', right(0, 1));
  accepted(first, 'first batch saved');
  same(first.data.results.map(row => row.correct), [true, true], 'batch graded by the server');
  same(first.data.progress.counts.recall, 2, 'counts two answers');
  const replay = await study(pupil(1), base, 'recall', 'batch-1', right(0, 1));
  accepted(replay, 'replay accepted');
  check(replay.data.duplicate === true, 'replay flagged duplicate', replay.data);
  same(replay.data.progress.counts.recall, 2, 'replay does not count again');
  same(replay.data.results, first.data.results, 'replay returns the same results');
  refused(await study(pupil(1), base, 'recall', 'batch-1', [{cardId: 'card0', answer: 'other'}, {cardId: 'card1', answer: '뜻 1'}]), 409, 'REQUEST_CONFLICT', 'changed answer under one requestId is refused');
  refused(await study(pupil(1), base, 'recall', 'batch-1', right(0, 1), {direction: 'back-front'}), 409, 'REQUEST_CONFLICT', 'changed direction under one requestId is refused');
  refused(await study(pupil(1), base, 'recall', 'batch-back', right(0, 1), {direction: 'back-front'}), 400, 'STUDY_DIRECTION', 'wrong direction under a required mode is refused');
  refused(await study(pupil(1), base, 'memorize', 'batch-1', right(0, 1)), 409, 'REQUEST_CONFLICT', 'changed mode under one requestId is refused');
  refused(await study(pupil(1), base, 'recall', 'batch-dup', [...right(2), ...right(2)]), 400, 'STUDY_CARD', 'same card twice in a batch is refused');
  refused(await study(pupil(1), base, 'recall', 'batch-outside', [{cardId: 'nope', answer: 'x'}]), 400, 'STUDY_CARD', 'card outside the set is refused');
  refused(await study(pupil(1), base, 'recall', 'batch-empty', []), 400, undefined, 'empty batch is refused');
  refused(await call(pupil(1), 'POST', ['distributions', base, 'study'], {mode: 'recall', direction: 'front-back', responses: right(3)}), 400, undefined, 'missing requestId is refused');
  same((await db().doc(`cardProgress/${base}_s1`).get()).data().counts.recall, 2, 'refused batches changed nothing');

  // The browser's own outbox: 30 answers seal into batches of ten that a retry can repeat safely.
  let outbox = logic.emptyStudyOutbox(), ids = 0;
  const newId = () => `sealed-${++ids}`;
  for (let round = 0; round < 3; round++) for (const card of cards.slice(0, 10)) outbox = logic.addStudyResponse(outbox, {cardId: card.id, answer: card.back, direction: 'front-back'}, 'recall', newId);
  same(outbox.sealed.map(batch => batch.responses.length), [10, 10, 10], 'outbox seals three batches of ten');
  check(outbox.buffer.length === 0, 'nothing left in the buffer');
  const sealed = [...outbox.sealed];
  for (const batch of sealed) {
    const sent = await study(pupil(2), base, batch.mode, batch.requestId, batch.responses, {direction: batch.direction, lastCardId: batch.lastCardId});
    if (sent.status === 200) outbox = logic.settleStudyBatch(outbox, batch.requestId); else check(false, `sealed batch ${batch.requestId}`, sent);
  }
  check(outbox.sealed.length === 0, 'all sealed batches settled');
  const again = await study(pupil(2), base, sealed[1].mode, sealed[1].requestId, sealed[1].responses, {direction: sealed[1].direction, lastCardId: sealed[1].lastCardId});
  check(again.status === 200 && again.data.duplicate === true, 'lost-reply retry of a sealed batch is a duplicate', again);
  const s2 = (await db().doc(`cardProgress/${base}_s2`).get()).data();
  same(s2.counts.recall, 30, 'thirty answers counted once each');
  same(s2.correctCounts.recall, 30, 'thirty correct');
  same(s2.coverage.recall.card0, 3, 'coverage counts three rounds per card');
  same(s2.lastPosition, {mode: 'recall', cardId: 'card9'}, 'last position saved');
  same((await db().collection(`cardProgress/${base}_s2/batches`).get()).size, 3, 'one receipt per batch');
  same(Object.keys((await db().doc(`cardProgress/${base}_s2/batches/sealed-1`).get()).data()).sort(), ['createdAt', 'distributionId', 'fingerprint', 'studentId', 'versionId'], 'receipts keep no raw answers');

  const own = await call(pupil(2), 'GET', ['distributions', base]), other = await call(pupil(3), 'GET', ['distributions', base]);
  same(own.data.coverage.recall.card0, 3, 'coverage comes back to its own student');
  same(other.data.coverage, {memorize: {}, recall: {}, spell: {}}, 'another student sees only empty coverage');
  same(other.data.distribution.targetStudentIds, ['s3'], 'a student sees only their own target id');
  check(!JSON.stringify(other.data).includes('학생2'), 'another student never sees a classmate name', other.data);
  const list = await call(pupil(3), 'GET', ['student']);
  check(!JSON.stringify(list.data).includes('coverage') && !JSON.stringify(list.data).includes('targetStudentIds'), 'student list carries no coverage or roster', list.data);
  const teacherView = await report(base);
  check(!JSON.stringify(teacherView).includes('"coverage"'), 'teacher report carries no raw coverage map');
  refused(await call(pupil(1), 'GET', ['distributions', base, 'report']), 403, 'FORBIDDEN', 'a student cannot open the report');
  refused(await call('u9:0', 'GET', ['distributions', base]), 404, 'NOT_FOUND', 'a student from another class cannot open it');
  refused(await study('u9:0', base, 'recall', 'batch-other', right(0)), 404, 'NOT_FOUND', 'a student from another class cannot study it');
  const narrow = await distribute({targetStudentIds: ['s1']});
  refused(await call(pupil(2), 'GET', ['distributions', narrow.id]), 404, 'NOT_FOUND', 'a student outside the targets cannot open it');
  check(!(await call(pupil(2), 'GET', ['student'])).data.distributions.some(row => row.id === narrow.id), 'and does not see it listed');
}

async function editedSection() {
  section('study batch across a settings edit');
  const rule = {requiredCount: 12, direction: 'front-back', rangeStart: 1, rangeEnd: 12}, base = await distribute({requiredModes: {recall: rule}}), path = ['distributions', base.id];
  const landed = await study(pupil(1), base.id, 'recall', 'e-1', right(0, 11));
  accepted(landed, 'batch lands before the edit');
  accepted(await call(teacher, 'PATCH', path, {requiredModes: {recall: {direction: 'back-front', rangeEnd: 6}}}), 'teacher changes direction and range');
  const replay = await study(pupil(1), base.id, 'recall', 'e-1', right(0, 11));
  check(replay.status === 200 && replay.data.duplicate === true, 'a batch that already landed still replays', replay);
  same(replay.data.progress?.counts.recall, 2, 'and is not counted twice');
  refused(await study(pupil(1), base.id, 'recall', 'e-1', [{cardId: 'card0', answer: 'changed'}, {cardId: 'card11', answer: '뜻 11'}]), 409, 'REQUEST_CONFLICT', 'a changed replay is still a conflict');
  refused(await study(pupil(1), base.id, 'recall', 'e-2', right(1)), 400, 'STUDY_DIRECTION', 'a new batch in the old direction is refused');
  refused(await study(pupil(1), base.id, 'recall', 'e-3', [{cardId: 'card11', answer: 'x'}], {direction: 'back-front'}), 400, 'STUDY_CARD', 'a card outside the new range is refused for good');
  same(logic.staleStudyBatch('STUDY_DIRECTION') && logic.staleStudyBatch('STUDY_CARD') && logic.staleStudyBatch('REQUEST_CONFLICT'), true, 'the browser drops those batches instead of retrying them');
}

async function testsSection() {
  section('tests');
  const test = {questionCount: 4, goalScore: 80, maxAttempts: 2, direction: 'back-front', answerRelease: 'immediate', format: 'choice', timeLimitSeconds: 120};
  const choice = await distribute({test}), base = choice.id;
  const started = await start(pupil(1), base, 'start-1');
  check(started.status === 201, 'choice test starts', started);
  const attempt = started.data.attempt;
  check(attempt.questions.length === 4 && attempt.questions.every(question => question.choices?.length === 4), 'each question has four stored choices', attempt.questions);
  check(attempt.questions.every(question => question.choices.includes(byBack.get(question.prompt).front)), 'the right answer is one of the choices');
  check(attempt.questions.every(question => new Set(question.choices).size === 4), 'choices are distinct');
  same(secretsIn(attempt), null, 'no answers or results before submit');
  check(attempt.answersVisible === false && attempt.score === null, 'nothing graded before submit');
  same(attempt.timeLimitSeconds, 120, 'time limit returned to the student');
  const saved = (await db().doc(`cardProgress/${base}_s1/tests/${attempt.id}`).get()).data();
  same(saved.questions.map(question => question.choices), attempt.questions.map(question => question.choices), 'choices stored with the attempt');
  same(saved.direction, 'back-front', 'attempt direction stored');
  same(saved.timeLimitSeconds, 120, 'attempt time limit stored');
  const replay = await start(pupil(1), base, 'start-1');
  same(replay.data.attempt.id, attempt.id, 'same requestId returns the same attempt');
  refused(await start(pupil(1), base, 'start-1', {retryWrong: true}), 409, 'REQUEST_CONFLICT', 'changed settings under one requestId are refused');
  const resumed = await start(pupil(1), base, 'start-2');
  same(resumed.data.attempt.id, attempt.id, 'a new request resumes the open attempt');
  same(resumed.data.progress.attempts, 1, 'resuming uses no attempt');
  same(secretsIn(resumed.data.attempt), null, 'resume leaks no answers');
  const listed = await call(pupil(1), 'GET', ['distributions', base, 'tests']);
  same(secretsIn(listed.data.attempts), null, 'attempt list before submit leaks no answers');
  check(typeof listed.data.serverTime === 'string', 'server time returned for the timer');
  refused(await submit(pupil(1), base, attempt.id, []), 400, 'TEST_ANSWERS', 'missing answers are refused');
  refused(await submit(pupil(2), base, attempt.id, attempt.questions.map(question => answerFor(question, 'back-front'))), 404, 'NOT_FOUND', 'another student cannot submit this attempt');
  // Teacher flips the direction mid-attempt: this attempt must still grade the way it was asked.
  accepted(await call(teacher, 'PATCH', ['distributions', base], {test: {direction: 'front-back'}}), 'teacher changes the test direction mid-attempt');
  const answers = attempt.questions.map((question, index) => answerFor(question, 'back-front', index === 0));
  const done = await submit(pupil(1), base, attempt.id, answers);
  check(done.status === 200 && done.data.attempt.score === 75, 'graded by the stored direction: 3 of 4', done.data.attempt);
  check(done.data.attempt.results.every(row => typeof row.expectedAnswer === 'string'), 'immediate release shows answers after submit');
  same(done.data.progress.latestScore, 75, 'score recorded');
  check(done.data.progress.goalReached === false, 'below goal');
  const twice = await submit(pupil(1), base, attempt.id, answers);
  check(twice.status === 200 && twice.data.duplicate === true && twice.data.progress.attempts === 1, 'resubmitting the same answers is a duplicate', twice);
  refused(await submit(pupil(1), base, attempt.id, answers.map(row => ({...row, answer: 'changed'}))), 409, 'TEST_SUBMITTED', 'changing a submitted test is refused');

  const wrongCard = attempt.questions[0].cardId;
  const retry = await start(pupil(1), base, 'start-3', {retryWrong: true});
  check(retry.status === 201 && retry.data.attempt.retryWrong === true, 'retry-wrong starts', retry);
  same(retry.data.attempt.questions.map(question => question.cardId), [wrongCard], 'retry asks only the wrong card');
  same(retry.data.attempt.questions[0].choices?.length, 4, 'retry still has full choices from the whole set');
  same((await db().doc(`cardProgress/${base}_s1/tests/${retry.data.attempt.id}`).get()).data().direction, 'front-back', 'the retry follows the new direction');
  const retried = await submit(pupil(1), base, retry.data.attempt.id, retry.data.attempt.questions.map(question => answerFor(question, 'front-back')));
  same(retried.data.attempt.score, 100, 'retry graded');
  same(retried.data.progress.bestScore, 100, 'best score kept');
  check(retried.data.progress.goalReached === true, 'goal reached');
  refused(await start(pupil(1), base, 'start-4'), 409, 'ATTEMPT_LIMIT', 'attempt limit reached');
  refused(await start(pupil(2), base, 'start-5', {retryWrong: true}), 409, 'NO_PREVIOUS_TEST', 'retry-wrong needs a finished test');
  refused(await start(pupil(2), base, 'start-6', {retryWrong: 'yes'}), 400, undefined, 'non-boolean retryWrong is refused');

  // A full score leaves nothing to retry.
  const perfect = await distribute({test: {questionCount: 2, maxAttempts: 5, direction: 'front-back', format: 'written', answerRelease: 'never'}});
  const one = await start(pupil(2), perfect.id, 'p-1');
  check(!JSON.stringify(one.data.attempt).includes('뜻'), 'a written test carries no answers at all', one.data.attempt);
  same(one.data.attempt.questions.every(question => question.choices === undefined), true, 'a written test has no choices');
  const graded = await submit(pupil(2), perfect.id, one.data.attempt.id, one.data.attempt.questions.map(question => answerFor(question, 'front-back')));
  same(graded.data.attempt.score, 100, 'written answers graded');
  check(graded.data.attempt.answersVisible === false && !JSON.stringify(graded.data.attempt).includes('expectedAnswer'), 'answerRelease never hides answers after submit', graded.data.attempt);
  refused(await start(pupil(2), perfect.id, 'p-2', {retryWrong: true}), 409, 'NO_WRONG_ANSWERS', 'no wrong answers to retry');

  const gated = await distribute({requiredModes: {memorize: {requiredCount: 2, direction: 'front-back', rangeStart: 1, rangeEnd: 2}}, test: {questionCount: 2, requireStudy: true}});
  refused(await start(pupil(3), gated.id, 'g-1'), 403, 'STUDY_REQUIRED', 'required study comes first');
  accepted(await study(pupil(3), gated.id, 'memorize', 'g-study', right(0, 1)), 'student studies');
  accepted(await start(pupil(3), gated.id, 'g-2'), 'then the test opens');

  // Two cards with one meaning: the other word is a right answer in disguise, so it can never be a wrong choice.
  const synonyms = [{id: 'big', front: 'big', back: '크다', example: '', alternatives: []}, {id: 'large', front: 'large', back: '크다', example: '', alternatives: []}, ...cards.slice(0, 5)];
  const pair = await call(teacher, 'POST', ['sets'], {title: '같은 뜻', description: '', type: 'word', folderId: null, cards: synonyms, requestId: 'set-synonyms'});
  const pairTest = await call(teacher, 'POST', ['distributions'], {classId: 'class-a', setId: pair.data.set.id, expectedVersion: 1, requestId: 'dist-synonyms', test: {questionCount: 7, format: 'choice', direction: 'back-front'}});
  const pairAttempt = await start(pupil(1), pairTest.data.distribution.id, 'pair-1');
  check(pairAttempt.status === 201 && pairAttempt.data.attempt.questions.filter(question => question.prompt === '크다').every(question => question.choices.filter(choice => choice === 'big' || choice === 'large').length === 1), 'a synonym is never offered as a wrong choice', pairAttempt.data.attempt?.questions);

  // Timed: overtime is flagged for the teacher only, and blank answers at expiry are accepted.
  const timed = await distribute({test: {questionCount: 3, format: 'written', timeLimitSeconds: 60, maxAttempts: 3, direction: 'front-back'}});
  const clock = await start(pupil(4), timed.id, 't-1'), late = clock.data.attempt, attemptRef = db().doc(`cardProgress/${timed.id}_s4/tests/${late.id}`);
  same(late.timeLimitSeconds, 60, 'timed attempt returns its limit');
  await attemptRef.update({startedAt: iso(-(60 + 30) * 1000)});
  const withinGrace = await submit(pupil(4), timed.id, late.id, late.questions.map(question => answerFor(question, 'front-back')));
  check(withinGrace.status === 200 && !('overtime' in withinGrace.data.attempt), 'within the 60s grace is not overtime', withinGrace.data.attempt);
  check((await attemptRef.get()).data().overtime === undefined, 'nothing stored for a graced submit');
  const next = await start(pupil(4), timed.id, 't-2'), expired = next.data.attempt, expiredRef = db().doc(`cardProgress/${timed.id}_s4/tests/${expired.id}`);
  await expiredRef.update({startedAt: iso(-(60 + 61 + 5) * 1000)});
  const blank = await submit(pupil(4), timed.id, expired.id, expired.questions.map(question => ({questionId: question.id, answer: ''})));
  check(blank.status === 200 && blank.data.attempt.score === 0 && blank.data.attempt.status === 'submitted', 'blank answers at expiry are graded as zero', blank);
  check(!('overtime' in blank.data.attempt), 'the student response has no overtime flag', blank.data.attempt);
  check((await expiredRef.get()).data().overtime === true, 'overtime stored');
  const studentList = await call(pupil(4), 'GET', ['distributions', timed.id, 'tests']);
  check(!JSON.stringify(studentList.data).includes('overtime'), 'the student attempt list has no overtime flag', studentList.data);
  const teacherRow = reported(await report(timed.id), 's4');
  check(teacherRow.attempts.find(row => row.id === expired.id)?.overtime === true, 'the teacher report shows overtime', teacherRow.attempts);
  check(teacherRow.attempts.find(row => row.id === late.id)?.overtime === undefined, 'and only on the attempt that ran over');
  same([teacherRow.progress.latestScore, teacherRow.attempts.find(row => row.id === expired.id)?.score], [100, 0], 'the report shows the blank overtime attempt, which does not become the latest score');
  check(teacherRow.attempts.every(row => row.answersVisible === true), 'teachers always see graded answers');
}

async function deadlineSection() {
  section('deadline');
  const edit = (distributionId, patch) => call(teacher, 'PATCH', ['distributions', distributionId], patch);
  const opened = await distribute({dueAt: iso(-HOUR), afterDue: 'open', test: {questionCount: 2, maxAttempts: 5}});
  same(opened.afterDue, 'open', 'open stored');
  const stillOpen = await study(pupil(1), opened.id, 'memorize', 'o-1', right(0));
  accepted(stillOpen, 'open: study allowed after the deadline');
  same(stillOpen.data.progress.lateAt, null, 'open: nothing marked late');
  accepted(await start(pupil(1), opened.id, 'o-2'), 'open: test allowed after the deadline');
  same((await db().doc(`cardProgress/${opened.id}_s1`).get()).data().lateAt, null, 'open: nothing stored as late');

  const late = await distribute({dueAt: iso(-MIN), afterDue: 'late', test: {questionCount: 2, maxAttempts: 5}});
  const graced = await study(pupil(1), late.id, 'memorize', 'l-1', right(0));
  accepted(graced, 'late: within grace saved');
  same(graced.data.progress.lateAt, null, 'late: within grace is not late');
  accepted(await edit(late.id, {dueAt: iso(-HOUR)}), 'teacher moves the deadline back an hour');
  const marked = await study(pupil(1), late.id, 'memorize', 'l-2', right(1));
  check(typeof marked.data.progress.lateAt === 'string', 'late: after grace sets lateAt', marked.data.progress);
  const firstLate = marked.data.progress.lateAt;
  await new Promise(resolve => setTimeout(resolve, 5));
  const later = await study(pupil(1), late.id, 'memorize', 'l-3', right(2));
  same(later.data.progress.lateAt, firstLate, 'late: keeps the first late activity');
  const testLate = await start(pupil(2), late.id, 'l-4');
  check(typeof testLate.data.progress.lateAt === 'string', 'late: starting a test after grace is late', testLate.data.progress);
  same(reported(await report(late.id), 's1').progress.lateAt, firstLate, 'late: the report shows it');
  accepted(await edit(late.id, {dueAt: iso(HOUR)}), 'teacher extends the deadline');
  same(reported(await report(late.id), 's1').progress.lateAt, null, 'an earlier mark no longer counts after the extension');
  const after = await study(pupil(1), late.id, 'memorize', 'l-5', right(3));
  same(after.data.progress.lateAt, null, 'and activity before the new deadline is on time');

  const lock = await distribute({dueAt: iso(HOUR), afterDue: 'lock', test: {questionCount: 2, maxAttempts: 5}});
  const before = await study(pupil(1), lock.id, 'memorize', 'k-1', right(0));
  accepted(before, 'lock: before the deadline studying works');
  const running = await start(pupil(2), lock.id, 'k-2');
  check(running.status === 201, 'lock: test started before the deadline', running);
  accepted(await edit(lock.id, {dueAt: iso(-MIN)}), 'teacher brings the deadline inside the grace');
  accepted(await study(pupil(1), lock.id, 'memorize', 'k-3', right(1)), 'lock: within grace still saves');
  accepted(await edit(lock.id, {dueAt: iso(-HOUR)}), 'the deadline passes');
  refused(await study(pupil(1), lock.id, 'memorize', 'k-4', right(2)), 403, 'DUE_CLOSED', 'lock: new study refused');
  refused(await start(pupil(3), lock.id, 'k-5'), 403, 'DUE_CLOSED', 'lock: new test refused');
  const replayed = await study(pupil(1), lock.id, 'memorize', 'k-1', right(0));
  check(replayed.status === 200 && replayed.data.duplicate === true, 'lock: a batch that already landed replays fine', replayed);
  const resumed = await start(pupil(2), lock.id, 'k-6');
  same(resumed.data.attempt?.id, running.data.attempt.id, 'lock: the started test can be reopened');
  const finished = await submit(pupil(2), lock.id, running.data.attempt.id, running.data.attempt.questions.map(question => answerFor(question, 'front-back')));
  check(finished.status === 200 && finished.data.attempt.score === 100, 'lock: the started test can still be submitted', finished);
  const lockedView = await call(pupil(1), 'GET', ['distributions', lock.id]), lockedList = await call(pupil(1), 'GET', ['student']);
  check(lockedView.status === 200, 'lock: students can still read the set');
  check(Math.abs(Date.parse(lockedView.data.serverTime) - Date.now()) < 5000 && Math.abs(Date.parse(lockedList.data.serverTime) - Date.now()) < 5000, 'detail and list give the server time for the deadline', lockedView.data.serverTime);
  same(logic.cardDueState(lockedView.data.distribution, Date.parse(lockedView.data.serverTime)), 'lock', 'the server time closes the screen');
  same(logic.cardDueState(lockedView.data.distribution, Date.parse(lockedView.data.distribution.dueAt) - 1000), 'before', 'a slow device clock cannot be what closes it');
  check((await call(pupil(1), 'GET', ['student'])).data.distributions.some(row => row.id === lock.id && row.afterDue === 'lock'), 'lock: still listed for the student');
  accepted(await edit(lock.id, {afterDue: 'open'}), 'teacher reopens');
  accepted(await study(pupil(1), lock.id, 'memorize', 'k-7', right(2)), 'studying works again');

  const hidden = await distribute({dueAt: iso(HOUR), test: {questionCount: 2, answerRelease: 'after-due', maxAttempts: 5}});
  const answered = await start(pupil(1), hidden.id, 'a-1');
  const closed = await submit(pupil(1), hidden.id, answered.data.attempt.id, answered.data.attempt.questions.map(question => answerFor(question, 'front-back')));
  check(!JSON.stringify(closed.data.attempt).includes('expectedAnswer'), 'after-due release hides answers before the deadline', closed.data.attempt);
  accepted(await edit(hidden.id, {dueAt: iso(-MIN)}), 'the deadline passes');
  const shown = await call(pupil(1), 'GET', ['distributions', hidden.id, 'tests']);
  check(JSON.stringify(shown.data.attempts).includes('expectedAnswer'), 'and shows them after it', shown.data);
}

async function patchSection() {
  section('distribution PATCH');
  const base = await distribute({dueAt: iso(HOUR), afterDue: 'late', test: {questionCount: 5, goalScore: 70, maxAttempts: 4, direction: 'front-back', answerRelease: 'immediate', format: 'written'}}), path = ['distributions', base.id];
  const edited = await call(teacher, 'PATCH', path, {test: {goalScore: 90, format: 'choice', timeLimitSeconds: 300}, requiredModes: {spell: {requiredCount: 6}}, afterDue: 'lock', dueAt: iso(2 * HOUR)});
  accepted(edited, 'settings saved');
  const after = edited.data.distribution;
  same([after.test.goalScore, after.test.format, after.test.timeLimitSeconds, after.test.maxAttempts, after.test.questionCount], [90, 'choice', 300, 4, 5], 'a partial test edit keeps the rest');
  same([after.requiredModes.spell.requiredCount, after.requiredModes.spell.rangeEnd], [6, 12], 'a partial mode edit keeps the rest');
  same(after.afterDue, 'lock', 'after-deadline rule changed');
  same(after.snapshot.cards.length, 12, 'cards unchanged');
  const stored = (await db().doc(`cardClassSets/${base.id}`).get()).data();
  same([stored.setVersion, stored.versionId, stored.title], [base.setVersion, base.versionId, base.title], 'version and title stay fixed');
  check(stored.updatedAt > base.updatedAt, 'updatedAt moved');
  same((await call(teacher, 'GET', path)).data.distribution.test.goalScore, 90, 'edit visible to the teacher');
  same((await call(pupil(1), 'GET', path)).data.distribution.test.format, 'choice', 'edit visible to the student');

  refused(await call(stranger, 'PATCH', path, {active: false}), 404, 'NOT_FOUND', "another teacher's PATCH is hidden as 404");
  refused(await call(stranger, 'GET', path), 404, 'NOT_FOUND', "another teacher's GET is hidden as 404");
  refused(await call(stranger, 'GET', [...path, 'report']), 404, 'NOT_FOUND', "another teacher's report is hidden as 404");
  refused(await call(pupil(1), 'PATCH', path, {active: false}), 403, 'FORBIDDEN', 'a student cannot PATCH');
  refused(await call(null, 'PATCH', path, {active: false}), 401, 'UNAUTHENTICATED', 'no session is refused');
  refused(await call(teacher, 'PATCH', path, {active: false}, {headers: {origin: 'https://evil.test'}}), 403, 'ORIGIN', 'cross-origin PATCH is refused');
  refused(await call(teacher, 'PATCH', ['distributions', 'missing-one'], {active: false}), 404, 'NOT_FOUND', 'a missing distribution is 404');
  for (const [label, patch] of [['empty body', {}], ['unknown field only', {title: 'x'}], ['non-boolean active', {active: 'no'}], ['non-boolean allStudents', {allStudents: 1}], ['bad afterDue', {afterDue: 'never'}], ['bad dueAt', {dueAt: 'tomorrow'}], ['goal over 100', {test: {goalScore: 101}}], ['zero attempts', {test: {maxAttempts: 0}}], ['short time limit', {test: {timeLimitSeconds: 10}}], ['too many questions', {test: {questionCount: 13}}], ['bad format', {test: {format: 'essay'}}], ['test not an object', {test: 'x'}], ['range past the set', {requiredModes: {recall: {rangeEnd: 13}}}], ['requirement too high', {requiredModes: {recall: {requiredCount: 121}}}], ['clearing the due date under after-due release', {test: {answerRelease: 'after-due'}, dueAt: null}]]) {
    refused(await call(teacher, 'PATCH', path, patch), 400, undefined, `bad input refused: ${label}`);
  }
  refused(await call(teacher, 'PATCH', path, '{not json'), 400, undefined, 'bad input refused: malformed JSON');
  same((await db().doc(`cardClassSets/${base.id}`).get()).data().test.goalScore, 90, 'refused edits changed nothing');

  section('allStudents');
  const all = await distribute({requiredModes: {memorize: {requiredCount: 1, direction: 'front-back', rangeStart: 1, rangeEnd: 12}}}), allPath = ['distributions', all.id];
  check(all.allStudents === true, 'no targets means all students', all);
  same(all.targetCount, 4, 'four students at distribution');
  await addStudent(5);
  check((await call(pupil(5), 'GET', ['student'])).data.distributions.some(row => row.id === all.id), 'a new student sees it listed');
  same((await call(pupil(5), 'GET', allPath)).status, 200, 'and can open it');
  accepted(await study(pupil(5), all.id, 'memorize', 'new-1', right(0)), 'and can study it');
  accepted(await start(pupil(5), all.id, 'new-2'), 'and can start the test');
  await addStudent(6);
  await db().doc('classes/class-a/students/s4').update({disabled: true});
  refused(await call(pupil(4), 'GET', ['student']), 403, undefined, 'a disabled student cannot list');
  refused(await study(pupil(4), all.id, 'memorize', 'off-1', right(0)), 403, undefined, 'a disabled student cannot study');
  await db().doc('classes/class-a/students/s3').delete();
  const data = await report(all.id);
  same(data.students.map(row => row.id).sort(), ['s1', 's2', 's3', 's4', 's5', 's6'], 'report is the union of original targets and current students');
  check(reported(data, 's4').disabled === true, 'disabled student marked on the report');
  check(reported(data, 's3').disabled === true && reported(data, 's3').name === '학생3', 'removed student keeps the original name');
  check(reported(data, 's6').disabled === false && reported(data, 's6').progress.attempts === 0, 'a new student who has not started is listed');
  same(data.students.map(row => row.number), [...data.students.map(row => row.number)].sort((a, b) => a - b), 'report is sorted by number');
  const narrow = await distribute({targetStudentIds: ['s1'], allStudents: false});
  refused(await call(pupil(2), 'GET', ['distributions', narrow.id]), 404, 'NOT_FOUND', 'a targeted set stays closed to others');
  same((await report(narrow.id)).students.map(row => row.id), ['s1'], 'its report lists only the target');
  accepted(await call(teacher, 'PATCH', ['distributions', narrow.id], {allStudents: true}), 'teacher opens it to all');
  same((await call(pupil(2), 'GET', ['distributions', narrow.id])).status, 200, 'now others can open it');
  same((await report(narrow.id)).students.map(row => row.id), ['s1', 's2', 's5', 's6'], 'report covers the active class');
  await addStudent(10);
  same((await report(narrow.id)).distribution.targetCount, 5, 'the report count follows the roster while open to all');
  same((await call(teacher, 'GET', ['distributions'], undefined, {query: '?classId=class-a'})).data.distributions.find(row => row.id === narrow.id).targetCount, 5, 'so does the teacher list');
  same((await call(teacher, 'GET', ['distributions', narrow.id])).data.distribution.targetCount, 5, 'and the teacher detail');
  const closing = await call(teacher, 'PATCH', ['distributions', narrow.id], {allStudents: false});
  accepted(closing, 'teacher turns all-students off');
  same([closing.data.distribution.allStudents, closing.data.distribution.targetCount], [false, 5], 'the count is fixed at that moment');
  const frozen = (await db().doc(`cardClassSets/${narrow.id}`).get()).data();
  same([[...frozen.targetStudentIds].sort(), frozen.targetCount, frozen.targetStudents.length], [['s1', 's10', 's2', 's5', 's6'], 5, 5], 'old targets and the current roster are written down');
  same((await call(pupil(10), 'GET', ['distributions', narrow.id])).status, 200, 'a later joiner is not stranded');
  await addStudent(11);
  refused(await call(pupil(11), 'GET', ['distributions', narrow.id]), 404, 'NOT_FOUND', 'a student who joins afterwards is not included');
  same((await call(teacher, 'GET', ['distributions'], undefined, {query: '?classId=class-a'})).data.distributions.find(row => row.id === narrow.id).targetCount, 5, 'and the count stays fixed');
  accepted(await call(teacher, 'PATCH', ['distributions', narrow.id], {active: false}), 'teacher closes it');
  refused(await call(pupil(1), 'GET', ['distributions', narrow.id]), 404, 'NOT_FOUND', 'a closed set is hidden from its target');
  await addStudent(3); await db().doc('classes/class-a/students/s4').update({disabled: false});
}

async function oldSection() {
  section('old documents');
  const stamp = iso(-30 * 24 * HOUR), created = iso(-60 * MIN), classId = 'class-old', snapshot = {title: '예전 세트', description: '', type: 'word', cards: cards.slice(0, 6)};
  await db().doc(`classes/${classId}`).set({ownerUid: teacher, name: '예전 반'});
  await db().doc(`classes/${classId}/students/s7`).set({name: '학생7', number: 7, authUid: 'u7'});
  await db().doc(`classes/${classId}/students/s8`).set({name: '학생8', number: 8, authUid: 'u8'});
  for (const n of [7, 8]) await db().doc(`users/u${n}`).set({role: 'student', classId, studentId: `s${n}`, authVersion: 0});
  const requiredModes = Object.fromEntries(['memorize', 'recall', 'spell'].map(mode => [mode, {requiredCount: 0, direction: 'front-back', rangeStart: 1, rangeEnd: 6}]));
  // No afterDue, allStudents, test.format, test.timeLimitSeconds, as stored before this work.
  await db().doc('cardClassSets/old-dist').set({ownerUid: teacher, classId, className: '예전 반', setId: 'old-set', setVersion: 1, versionId: 'old-set_v1', title: '예전 세트', type: 'word', cardCount: 6, cardIds: snapshot.cards.map(card => card.id), targetStudentIds: ['s7', 's8'], targetStudents: [{id: 's7', name: '학생7', number: 7}, {id: 's8', name: '학생8', number: 8}], targetCount: 2, requiredModes, test: {questionCount: 3, goalScore: 80, maxAttempts: 5, requireStudy: false, direction: 'front-back', answerRelease: 'immediate'}, dueAt: stamp, active: true, snapshot, createdAt: created, updatedAt: stamp});
  // No lateAt. The attempt has neither direction nor timeLimitSeconds.
  const questions = [{id: 'q1', cardId: 'card0', prompt: 'word 0'}, {id: 'q2', cardId: 'card1', prompt: 'word 1'}];
  await db().doc('cardProgress/old-dist_s7').set({distributionId: 'old-dist', ownerUid: teacher, classId, studentId: 's7', counts: {memorize: 3, recall: 1, spell: 0}, correctCounts: {memorize: 3, recall: 1, spell: 0}, coverage: {memorize: {card0: 1}, recall: {}, spell: {}}, mistakes: {card1: 1}, attempts: 2, bestScore: 50, latestScore: 50, starredCardIds: [], lastPosition: null, activeAttemptId: 'old-open', lastSubmittedAttemptId: 'old-done', updatedAt: stamp});
  await db().doc('cardProgress/old-dist_s7/tests/old-done').set({distributionId: 'old-dist', studentId: 's7', classId, versionId: 'old-set_v1', status: 'submitted', number: 1, retryWrong: false, questions, score: 50, results: [{questionId: 'q1', answer: '뜻 0', correct: true, expectedAnswer: '뜻 0'}, {questionId: 'q2', answer: 'x', correct: false, expectedAnswer: '뜻 1'}], startedAt: stamp, submittedAt: stamp, fingerprint: 'old'});
  await db().doc('cardProgress/old-dist_s7/tests/old-open').set({distributionId: 'old-dist', studentId: 's7', classId, versionId: 'old-set_v1', status: 'started', number: 2, retryWrong: false, questions, score: null, results: [], startedAt: stamp, submittedAt: null, fingerprint: null});

  const list = await call(teacher, 'GET', ['distributions'], undefined, {query: `?classId=${classId}`});
  same(list.status, 200, 'teacher list reads an old distribution');
  same([list.data.distributions?.[0]?.afterDue, list.data.distributions?.[0]?.allStudents], ['open', false], 'old fields default to open and targeted');
  const detail = await call(teacher, 'GET', ['distributions', 'old-dist']);
  same(detail.status, 200, 'teacher detail reads it');
  const data = await report('old-dist');
  check(data.students?.length === 2, 'report reads old progress and attempts', data);
  const row = reported(data, 's7');
  same([row.progress.lateAt, row.progress.attempts, row.attempts.length, row.attempts[0].timeLimitSeconds, row.attempts[0].overtime], [null, 2, 2, null, undefined], 'old attempts report with defaults');
  same(reported(data, 's8').progress.attempts, 0, 'an empty student reports zero');
  const pupilList = await call('u7:0', 'GET', ['student']);
  same(pupilList.status, 200, 'student list reads it');
  check(pupilList.data.distributions?.[0]?.afterDue === 'open', 'student list defaults afterDue');
  same((await call('u7:0', 'GET', ['distributions', 'old-dist'])).status, 200, 'student detail reads it');
  const tests = await call('u7:0', 'GET', ['distributions', 'old-dist', 'tests']);
  check(tests.status === 200 && tests.data.attempts.length === 2 && tests.data.attempts[0].timeLimitSeconds === null, 'student reads old attempts', tests);
  // An old open attempt has no time limit, so it counts as running until handed in (시험 정답 보호): study waits for it.
  refused(await call('u7:0', 'POST', ['distributions', 'old-dist', 'study'], {requestId: 'old-1', mode: 'memorize', direction: 'front-back', responses: right(1)}), 409, 'TEST_ACTIVE', 'an old open attempt without a limit holds study');
  const opened = await start('u7:0', 'old-dist', 'old-2');
  same(opened.data.attempt?.id, 'old-open', 'old open attempt resumes');
  const graded = await submit('u7:0', 'old-dist', 'old-open', [{questionId: 'q1', answer: '뜻 0'}, {questionId: 'q2', answer: '뜻 1'}]);
  check(graded.status === 200 && graded.data.attempt.score === 100, 'an old attempt without a direction grades by the distribution', graded);
  const saved = await call('u7:0', 'POST', ['distributions', 'old-dist', 'study'], {requestId: 'old-1', mode: 'memorize', direction: 'front-back', responses: right(1)});
  check(saved.status === 200 && saved.data.progress.lateAt === null, 'old progress keeps taking study once the old attempt is in', saved);
  check(!('lateAt' in (saved.data.progress ?? {})) || saved.data.progress.lateAt === null, 'no late mark from an open-by-default deadline');
  const fresh = await start('u8:0', 'old-dist', 'old-3');
  check(fresh.status === 201 && fresh.data.attempt.questions.every(question => question.choices === undefined) && fresh.data.attempt.timeLimitSeconds === null, 'a new test on an old distribution is written and untimed', fresh);
  const stored = (await db().doc(`cardProgress/old-dist_s8/tests/${fresh.data.attempt.id}`).get()).data();
  same([stored.direction, stored.timeLimitSeconds], ['front-back', null], 'new attempts store the direction and limit');
  accepted(await call(teacher, 'PATCH', ['distributions', 'old-dist'], {afterDue: 'late'}), 'an old distribution takes a PATCH');
  same((await db().doc('cardClassSets/old-dist').get()).data().test.questionCount, 3, 'PATCH leaves the test alone');

  const lesson = (input, cookie = teacher) => lessonReports(new Request('http://cards.test/api/lesson-reports', {method: 'POST', headers: {'content-type': 'application/json', cookie: `__session=${cookie}`}, body: JSON.stringify(input)}), []);
  // The report picks distributions by their Seoul creation day. The old one was made an hour ago, which is yesterday between 00:00 and 01:00 Seoul, so the range starts on its day.
  const seoulDay = value => new Date(Date.parse(value) + 9 * HOUR).toISOString().slice(0, 10), from = seoulDay(created), seoul = seoulDay(iso(0));
  const response = await lesson({classId, from, to: seoul, title: '이번 달', teacherNotes: '', requestId: 'lesson-1'}), body = await response.json();
  check(response.status === 201, 'lesson report captures old documents', body);
  check(body.report?.cards?.[0]?.targetCount === 2 && body.report.cards[0].attempts === 2, 'lesson report counts submitted attempts only', body.report?.cards);
  const allSet = await lesson({classId: 'class-a', from, to: seoul, title: '새 반', teacherNotes: '', requestId: 'lesson-2'}), allBody = await allSet.json();
  check(allSet.status === 201 && allBody.report.cards.length > 0, 'lesson report captures new allStudents distributions', allBody);
  const union = allBody.report?.cards?.find(row => row.targetCount >= 6);
  check(!!union && (await db().collection('cardClassSets').where('classId', '==', 'class-a').get()).docs.some(doc => doc.data().title === union.title), 'lesson report counts allStudents distributions over the class', allBody.report?.cards);
}

async function roomSection() {
  section('card team room');
  const {handleRoomRequest} = await import('@/modules/playground/rooms-server');
  const host = {uid: teacher, email: null, displayName: null, role: 'teacher'}, player = n => ({uid: `u${n}`, email: null, displayName: null, role: 'student', classId: 'class-a', studentId: `s${n}`, authVersion: 0});
  const room = (ctx, method, segments, data = {}) => handleRoomRequest(new Request(`http://cards.test/api/playground/${segments.join('/')}`, {method}), ctx, segments, data);
  for (const n of [1, 2]) await db().doc(`classes/class-a/students/s${n}`).update({character: 'cat', wardrobeOwned: [], spaceOwned: []});
  const opened = await room(host, 'POST', ['rooms'], {mode: 'team', classId: 'class-a', direction: 'front-back', rounds: 1, seconds: 10, teamCount: 2, cardSetId: setId, requestId: 'room-1'}), roomId = opened.roomId;
  for (const n of [1, 2]) await room(player(n), 'POST', ['rooms', 'join'], {code: opened.code});
  same((await room(host, 'GET', ['rooms', roomId])).viewer.rewardsEnabled, false, 'the host screen knows rewards are off in this class');
  await room(host, 'POST', ['rooms', roomId, 'start'], {status: 'lobby', round: -1});
  await new Promise(resolve => setTimeout(resolve, 3100));
  await room(host, 'POST', ['rooms', roomId, 'tick']);
  const asked = (await db().doc(`playRooms/${roomId}/rounds/0`).get()).data();
  for (const n of [1, 2]) await room(player(n), 'POST', ['rooms', roomId, 'answer'], {round: 0, choiceId: asked.choices[n - 1].id});
  await room(host, 'POST', ['rooms', roomId, 'tick']);
  await room(host, 'POST', ['rooms', roomId, 'next'], {status: 'reveal', round: 0});
  const finished = (await db().doc(`playRooms/${roomId}`).get()).data();
  check(finished.status === 'finished' && finished.settled === true, 'the room finishes and settles', finished.status);
  same((await db().collection('classes/class-a/students/s1/playgroundScores').get()).size, 0, 'no playground weekly score is written');
  same((await db().collection('classes/class-a/students/s1/playgroundYears').get()).size + (await db().collectionGroup('days').get()).size, 0, 'no playground day record is written');
  same((await room(host, 'GET', ['rooms', roomId, 'review'])).review.length, 1, 'the review opens');
  const refusedWith = async (run, status) => {try {await run(); return null;} catch (error) {return error.status === status ? true : error;}};
  same(await refusedWith(() => room(host, 'POST', ['rooms', roomId, 'reward'], {amount: 1}), 403), true, 'a reward in a class without rewards is refused');
  process.env.CARDS_TEAM_DISABLED = 'true';
  same(await refusedWith(() => room(host, 'GET', ['rooms', roomId, 'review']), 404), true, 'the review is closed with the switch off');
  delete process.env.CARDS_TEAM_DISABLED;
}

async function berrySection() {
  section('berry masks names in card titles');
  const named = await call(teacher, 'POST', ['sets'], {title: '학생1 보충 단어', description: '', type: 'word', folderId: null, cards, requestId: 'set-named'});
  const given = await call(teacher, 'POST', ['distributions'], {classId: 'class-a', setId: named.data.set.id, expectedVersion: 1, requestId: 'dist-named'});
  const bearer = {uid: teacher, role: 'teacher', grantId: 'grant', clientId: 'client', scopes: ['classroom:read']};
  const listed = await callClassroomTool('list_card_sets', {class_id: 'class-a'}, bearer), one = await callClassroomTool('list_card_sets', {distribution_id: given.data.distribution.id}, bearer);
  check(!JSON.stringify(listed).includes('학생1') && !JSON.stringify(one).includes('학생1'), 'list_card_sets never carries a child name', {listed, one});
  check(listed.card_sets.find(row => row.id === given.data.distribution.id)?.title?.includes('보충 단어'), 'the rest of the title stays');
  same(one.card_sets[0].students, (await db().collection('classes/class-a/students').get()).docs.filter(doc => !doc.data().disabled).length, 'all_students sets report the live class size');
  // A teacher often types the given name alone (하준이 보충 단어): that is masked too.
  await db().doc('classes/class-m').set({ownerUid: teacher, name: '이름 반'});
  await db().doc('classes/class-m/students/s30').set({name: '김하준', number: 3, authUid: 'u30'});
  const alone = await call(teacher, 'POST', ['sets'], {title: '하준이 보충 단어', description: '', type: 'word', folderId: null, cards, requestId: 'set-given'});
  const givenDist = await call(teacher, 'POST', ['distributions'], {classId: 'class-m', setId: alone.data.set.id, expectedVersion: 1, requestId: 'dist-given'});
  const masked = await callClassroomTool('list_card_sets', {distribution_id: givenDist.data.distribution.id}, bearer);
  same(masked.card_sets[0]?.title, '학생 03이 보충 단어', 'list_card_sets masks a given name typed alone');
}

async function gamesSection() {
  section('review games');
  const given = await distribute(), base = given.id, path = ['distributions', base, 'games'];
  const play = (who, body, target = path) => call(who, 'POST', target, body), board = who => call(who, 'GET', path);
  const empty = await board(pupil(1));
  accepted(empty, 'student reads the game boards');
  same([empty.data.games.pair.best, empty.data.games.pair.ranking, empty.data.rankingsShown], [null, [], false], 'no records yet, rankings hidden from students by default');
  const first = await play(pupil(1), {requestId: 'g-1', game: 'pair', pairs: 6, elapsedMs: 30_000, mistakes: 2});
  accepted(first, 'a pairs round is saved');
  same([first.data.improved, first.data.best.score, first.data.best.timeMs, first.data.best.plays], [true, 34_000, 30_000, 1], 'the server adds the mistake time itself');
  const replay = await play(pupil(1), {requestId: 'g-1', game: 'pair', pairs: 6, elapsedMs: 30_000, mistakes: 2});
  check(replay.status === 200 && replay.data.duplicate === true && replay.data.best.plays === 1, 'a replayed round counts once', replay.data);
  refused(await play(pupil(1), {requestId: 'g-1', game: 'pair', pairs: 6, elapsedMs: 20_000, mistakes: 0}), 409, 'REQUEST_CONFLICT', 'a different result under one requestId is refused');
  const worse = await play(pupil(1), {requestId: 'g-2', game: 'pair', pairs: 6, elapsedMs: 50_000, mistakes: 0});
  same([worse.data.improved, worse.data.best.score, worse.data.best.plays], [false, 34_000, 2], 'a slower round keeps the best and counts the play');
  refused(await play(pupil(1), {requestId: 'g-3', game: 'pair', pairs: 6, elapsedMs: 900, mistakes: 0}), 400, 'GAME_RESULT', 'an impossible time is refused');
  refused(await play(pupil(1), {requestId: 'g-4', game: 'pair', pairs: 12, elapsedMs: 30_000, mistakes: 0}), 400, 'GAME_RESULT', 'a pair count the set cannot give is refused');
  refused(await play(pupil(1), {requestId: 'g-5', game: 'rain', correct: 200, missed: 0, elapsedMs: 60_000}), 400, 'GAME_RESULT', 'more rain words than could fall is refused');
  refused(await play(pupil(1), {requestId: 'g-6', game: 'puzzle', results: [0], elapsedMs: 9000}), 400, 'GAME_RESULT', 'a word set without examples has no puzzle record');
  refused(await play(pupil(1), {requestId: 'g-7', game: 'chess', elapsedMs: 9000}), 400, 'GAME_INPUT', 'an unknown game is refused');
  refused(await play(pupil(1), {game: 'pair', pairs: 6, elapsedMs: 30_000, mistakes: 0}), 400, undefined, 'a missing requestId is refused');
  const rain = await play(pupil(2), {requestId: 'g-8', game: 'rain', correct: 12, missed: 3, elapsedMs: 60_000, direction: 'back-front', still: true});
  same(rain.data.best?.score, 5 * 10 + 5 * 20 + 2 * 30, 'rain points are counted by the server: ten per word times the level');
  // The rain screen ends a round itself at the limits (rainCap): a round of exactly GAME_MAX_MS is saved, one millisecond more is not.
  const capped = (await import('@/lib/cards-games')).GAME_MAX_MS, capPath = ['distributions', (await distribute()).id, 'games'];
  same((await play(pupil(4), {requestId: 'g-cap', game: 'rain', correct: 40, missed: 3, elapsedMs: capped}, capPath)).status, 200, 'a rain round ended at the time limit is saved');
  refused(await play(pupil(4), {requestId: 'g-over', game: 'rain', correct: 40, missed: 3, elapsedMs: capped + 1}, capPath), 400, 'GAME_RESULT', 'a round past the time limit would be refused');
  const closed = await board(pupil(1));
  same([closed.data.rankingsShown, closed.data.games.rain.ranking, closed.data.games.pair.rank, closed.data.games.pair.best?.score], [false, [], null, 34_000], 'rankings are hidden from students by default; their own best stays');
  await db().doc('classes/class-a/settings/playground').set({showRankings: true});
  same((await board(pupil(1))).data.rankingsShown, false, 'the playground ranking switch does not open card game rankings');
  await db().doc('classes/class-a/settings/playground').delete();
  const rankings = ['classes', 'class-a', 'game-rankings'];
  refused(await call(pupil(1), 'PATCH', rankings, {rankingsShown: true}), 403, 'FORBIDDEN', 'a student cannot open the ranking');
  refused(await call(stranger, 'PATCH', rankings, {rankingsShown: true}), 404, 'NOT_FOUND', 'another teacher cannot open the ranking');
  refused(await call(teacher, 'PATCH', rankings, {rankingsShown: 1}), 400, 'RANKING_SETTINGS', 'the ranking switch takes a boolean only');
  same((await call(teacher, 'GET', rankings)).data, {rankingsShown: false}, 'the teacher reads the switch off');
  same((await call(teacher, 'PATCH', rankings, {rankingsShown: true})).data, {rankingsShown: true}, 'the teacher turns the class ranking on');
  const seen = await board(pupil(1));
  same(seen.data.games.rain.ranking, [{id: '', name: '학생2', score: 210, timeMs: 60_000, rank: 1}], 'classmates appear by name without their ID');
  same(seen.data.games.pair.ranking.map(row => [row.id, row.rank]), [['s1', 1]], 'the student sees their own row with its ID');
  same([seen.data.games.pair.rank, seen.data.games.rain.rank, seen.data.games.rain.best], [1, null, null], 'own rank and best per game');
  const stored = (await db().doc(`cardGameScores/${base}_s1`).get()).data();
  same(Object.keys(stored.games), ['pair'], 'only games with a record are stored');
  same(Object.keys(stored.games.pair).sort(), ['at', 'plays', 'score', 'timeMs'], 'a game keeps only its best record');
  same((await db().collection(`cardGameScores/${base}_s1/plays`).get()).docs.map(doc => Object.keys(doc.data()).sort().join()), ['createdAt,fingerprint,improved', 'createdAt,fingerprint,improved'], 'receipts carry no scores or answers');
  const full = await board(teacher);
  check(full.status === 200 && full.data.games.pair.ranking[0]?.id === 's1' && full.data.games.rain.ranking[0]?.id === 's2', 'the teacher sees everyone with IDs', full.data);
  refused(await play(teacher, {requestId: 'g-9', game: 'pair', pairs: 6, elapsedMs: 30_000, mistakes: 0}), 403, 'FORBIDDEN', 'a teacher cannot post a record');
  refused(await board(stranger), 404, 'NOT_FOUND', 'another teacher cannot read the boards');
  refused(await board('u9:0'), 404, 'NOT_FOUND', 'a student of another class cannot read the boards');
  refused(await play('u9:0', {requestId: 'g-10', game: 'pair', pairs: 6, elapsedMs: 30_000, mistakes: 0}), 404, 'NOT_FOUND', 'a student of another class cannot post');
  accepted(await call(teacher, 'PATCH', rankings, {rankingsShown: false}), 'the teacher hides the class ranking again');
  const hidden = await board(pupil(1));
  same([hidden.data.rankingsShown, hidden.data.games.pair.ranking, hidden.data.games.pair.rank, hidden.data.games.pair.best?.score], [false, [], null, 34_000], 'with rankings hidden a student sees only their own best');
  same((await board(teacher)).data.games.rain.ranking.length, 1, 'the teacher still sees the ranking');
  let limited = null;
  for (let index = 0; index < 7; index++) {const result = await play(pupil(3), {requestId: `rate-${index}`, game: 'pair', pairs: 6, elapsedMs: 30_000 + index, mistakes: 0}); if (result.status !== 200) {limited = {index, result}; break;}}
  check(limited?.index === 6 && limited.result.status === 429 && limited.result.data.code === 'GAME_RATE', 'the seventh round in a minute is rate limited', limited);
  const bearer = {uid: teacher, role: 'teacher', grantId: 'grant', clientId: 'client', scopes: ['classroom:read']};
  const berry = await callClassroomTool('list_card_sets', {distribution_id: base}, bearer);
  same(berry.card_sets[0].game_players, {pair: 2, rain: 1, puzzle: 0}, 'Berry gets game player counts only');
  const locked = await distribute({dueAt: iso(HOUR), afterDue: 'lock'});
  accepted(await call(teacher, 'PATCH', ['distributions', locked.id], {dueAt: iso(-HOUR)}), 'the locked set passes its deadline');
  refused(await play(pupil(1), {requestId: 'g-11', game: 'pair', pairs: 6, elapsedMs: 30_000, mistakes: 0}, ['distributions', locked.id, 'games']), 403, 'DUE_CLOSED', 'a locked set takes no game records');
}

async function aiSection() {
  section('ai-draft');
  const original = globalThis.fetch, sent = [];
  let reply = () => Response.json({status: 'completed', usage: {input_tokens: 10, output_tokens: 20}, output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify({cards: [{front: 'Apple', back: '사과', example: 'I eat an apple.'}, {front: 'extra', back: '추가', example: ''}]})}]}]});
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.openai.com/')) {sent.push(init); return reply();}
    if (/^https?:/.test(String(url)) && !String(url).includes(host)) throw new Error(`unexpected outside call: ${url}`);
    return original(url, init);
  };
  try {
    const words = {mode: 'words', level: 'elementary', words: ['apple', 'kiwi']}, draft = (who, body, options) => call(who, 'POST', ['ai-draft'], body, options);
    const ok = await draft(teacher, words);
    same(ok.status, 200, 'teacher gets a draft');
    same(ok.data.cards, [{front: 'apple', back: '사과', example: 'I eat an apple.'}, {front: 'kiwi', back: '', example: ''}], 'draft follows the teacher list');
    same(sent.length, 1, 'one provider call');
    const prompt = JSON.parse(sent[0].body);
    same(JSON.parse(prompt.input[0].content[0].text), {words: ['apple', 'kiwi']}, 'only the words go to the provider');
    check(!/class-a|teacher-a|학생/.test(sent[0].body), 'no class, teacher or student data goes to the provider');
    const jobs = await db().collection('aiJobs').where('tool', '==', 'cards-ai-draft').get();
    check(jobs.size === 1 && jobs.docs[0].data().status === 'done' && jobs.docs[0].data().usage, 'the call went through the usage meter', jobs.docs.map(doc => doc.data()));
    refused(await draft(pupil(1), words), 403, 'FORBIDDEN', 'a student is refused');
    refused(await draft(null, words), 401, 'UNAUTHENTICATED', 'no session is refused');
    refused(await draft(teacher, words, {headers: {origin: 'https://evil.test'}}), 403, 'ORIGIN', 'another origin is refused');
    refused(await draft(teacher, words, {headers: {'sec-fetch-site': 'cross-site'}}), 403, 'ORIGIN', 'a cross-site fetch is refused');
    refused(await draft(teacher, JSON.stringify(words), {headers: {'content-type': 'text/plain'}}), 415, undefined, 'a form-like content type is refused');
    refused(await draft(teacher, {mode: 'text', level: 'elementary', text: '가'.repeat(30_000)}), 413, 'BODY_TOO_LARGE', 'an oversize body is refused');
    refused(await draft(teacher, {mode: 'text', level: 'elementary', text: 'a'.repeat(8001)}), 400, 'INPUT_INVALID', 'text over the limit is refused');
    refused(await draft(teacher, {mode: 'words', level: 'elementary', words: Array(61).fill('a')}), 400, 'INPUT_INVALID', 'too many words are refused');
    same(sent.length, 1, 'refused requests never reached the provider');
    reply = () => new Response('busy', {status: 500});
    const failed = await draft(teacher, {mode: 'words', level: 'middle', words: ['pear']});
    check(failed.status >= 500 && !JSON.stringify(failed.data).includes('stub-not-a-key'), 'provider failure is reported without the key', failed);
    reply = () => Response.json({status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: 'not json'}]}]});
    refused(await draft(teacher, {mode: 'words', level: 'high', words: ['plum']}), 502, 'AI_INVALID_RESPONSE', 'a broken reply is refused');
    delete process.env.OPENAI_API_KEY;
    refused(await draft(teacher, {mode: 'words', level: 'high', words: ['fig']}), 503, 'AI_NOT_CONFIGURED', 'no key is reported as not configured');
  } finally {globalThis.fetch = original; process.env.OPENAI_API_KEY = 'stub-not-a-key';}
}

async function masterySection() {
  section('mastery, date review and missed-card review');
  await addStudent(5); await addStudent(6);
  const me = pupil(5), today = logic.cardReviewDate(), tomorrow = logic.cardAddDays(today, 1), yesterday = logic.cardAddDays(today, -1);
  const rule = {requiredCount: 6, direction: 'front-back', rangeStart: 1, rangeEnd: 6};
  const base = await distribute({requiredModes: {recall: rule}, test: {questionCount: 2, maxAttempts: 5}}), progressDoc = () => db().doc(`cardProgress/${base.id}_s5`).get(), missesDoc = () => db().doc('cardMisses/class-a_s5').get();
  const wrong = index => ({cardId: cards[index].id, answer: '모르겠어요'});

  const first = await study(me, base.id, 'recall', 'm-1', [...right(0, 1), wrong(2)]);
  accepted(first, 'recall batch with a miss saved');
  same([first.data.progress.mastery, first.data.progress.reviewDue], [Math.round(2 / 48 * 100), 0], 'two seeds out of twelve cards; nothing due until tomorrow');
  let saved = (await progressDoc()).data();
  same(saved.cardStates, {card0: {l: 1, b: 0, d: tomorrow}, card1: {l: 1, b: 0, d: tomorrow}, card2: {l: 0, b: 0, d: tomorrow}}, 'card states are stored compactly, a miss due tomorrow too');
  same((await missesDoc()).data().misses, {[base.id]: {card2: today}}, 'the miss lands in the student index in the same transaction');
  await study(me, base.id, 'recall', 'm-2', right(0));
  same((await progressDoc()).data().cardStates.card0.l, 2, 'a second right answer the same day is 새싹');
  await study(me, base.id, 'recall', 'm-3', right(0));
  same((await progressDoc()).data().cardStates.card0.l, 2, 'cramming the same day stops at 새싹');
  await study(me, base.id, 'memorize', 'm-4', right(3));
  check(!(await progressDoc()).data().cardStates.card3, 'memorize never moves mastery');
  same((await study(me, base.id, 'recall', 'm-1', [...right(0, 1), wrong(2)])).data.duplicate, true, 'a replayed batch is not graded twice');
  same((await progressDoc()).data().cardStates.card0.l, 2, 'and leaves mastery alone');

  // A day passes: move the stored dates back instead of the clock.
  saved = (await progressDoc()).data();
  await db().doc(`cardProgress/${base.id}_s5`).update({cardStates: {...saved.cardStates, card0: {...saved.cardStates.card0, d: yesterday}, card2: {...saved.cardStates.card2, d: yesterday}}});
  const detail = await call(me, 'GET', ['distributions', base.id]);
  same([detail.data.progress.reviewDue, Object.keys(detail.data.cardStates).sort()], [2, ['card0', 'card1', 'card2']], 'the set page shows two cards due and the student own states');
  check(!JSON.stringify((await call(pupil(6), 'GET', ['distributions', base.id])).data.cardStates ?? {}).includes('card0'), 'another student never sees these states');
  const due = await call(me, 'GET', ['review'], undefined, {query: `?distributionId=${base.id}`});
  same(due.data.items?.map(item => item.card.id).sort(), ['card0', 'card2'], 'today\'s review holds exactly the due cards');
  check(due.data.items.every(item => item.choices?.length === 4 && item.choices.includes(item.card.back) && item.direction === 'front-back'), 'each review card has four choices with the answer', due.data.items);
  refused(await study(me, base.id, 'memorize', 'm-r0', right(0), {review: true}), 400, undefined, 'a memorize review is refused');
  refused(await study(me, base.id, 'recall', 'm-r0', right(0), {review: 'yes'}), 400, undefined, 'a non-boolean review flag is refused');
  const reviewed = await study(me, base.id, 'recall', 'm-r1', [...right(0), wrong(2), ...right(10)], {review: true});
  accepted(reviewed, 'a review batch is saved, even for a card outside the required range');
  saved = (await progressDoc()).data();
  same([saved.cardStates.card0, saved.cardStates.card2.d, saved.cardStates.card10], [{l: 3, b: 1, d: logic.cardAddDays(today, 3)}, tomorrow, {l: 1, b: 0, d: tomorrow}], 'a due review answered right is 잎 for three days; a miss comes back tomorrow');
  same([saved.counts.recall, saved.coverage.recall.card10], [first.data.progress.counts.recall + 2, undefined], 'review answers give no required-study credit');
  same(reviewed.data.progress.reviewDue, 0, 'nothing left due');
  refused(await study(me, base.id, 'recall', 'm-r1', [...right(0), wrong(2), ...right(10)]), 409, 'REQUEST_CONFLICT', 'the same request id without the review flag is a different request');

  // Missed cards across sets.
  const other = await distribute({test: {questionCount: 12, maxAttempts: 5, direction: 'front-back'}});
  const begun = await start(me, other.id, 'm-t1');
  const answers = begun.data.attempt.questions.map(question => answerFor(question, 'front-back', ['word 4', 'word 5'].includes(question.prompt)));
  accepted(await submit(me, other.id, begun.data.attempt.id, answers), 'a test with two misses is submitted');
  const tested = (await db().doc(`cardProgress/${other.id}_s5`).get()).data();
  same([tested.cardStates.card4.l, tested.cardStates.card7.l, Object.keys(tested.cardStates).length], [0, 1, 12], 'test answers move mastery for every question');
  same(Object.keys((await missesDoc()).data().misses[other.id]).sort(), ['card4', 'card5'], 'test misses join the index');
  const list = await call(me, 'GET', ['student']);
  same(list.data.review, {total: 3, weeks: [{week: logic.cardWeekStart(today), count: 3}]}, 'the set list carries the missed-card count by week');
  same((await call(pupil(6), 'GET', ['student'])).data.review, {total: 0, weeks: []}, 'a student without misses gets an empty review row');
  const missedItems = (await call(me, 'GET', ['review'])).data.items;
  same(missedItems?.map(item => `${item.distributionId === base.id ? 'a' : 'b'}:${item.card.id}`).sort(), ['a:card2', 'b:card4', 'b:card5'], 'the missed-card review gathers misses from both sets');
  check(missedItems.every(item => item.missedOn === today && item.title), 'each carries its date and set title');
  same((await call(me, 'GET', ['review'], undefined, {query: `?week=${logic.cardAddDays(logic.cardWeekStart(today), -7)}`})).data.items, [], 'an older week is empty');
  refused(await call(me, 'GET', ['review'], undefined, {query: '?week=soon'}), 400, undefined, 'a malformed week is refused');
  accepted(await study(me, other.id, 'recall', 'm-r2', right(4, 5), {review: true}), 'reviewing the two test misses');
  same((await missesDoc()).data().misses, {[base.id]: {card2: today}}, 'cards answered right in review leave the index');
  same((await call(me, 'GET', ['student'])).data.review.total, 1, 'and the list count drops');
  accepted(await call(teacher, 'PATCH', ['distributions', base.id], {active: false}), 'teacher closes the first set');
  same([(await call(me, 'GET', ['student'])).data.review.total, (await call(me, 'GET', ['review'])).data.items.length], [0, 0], 'a closed set drops out of the row and the session');
  accepted(await call(teacher, 'PATCH', ['distributions', base.id], {active: true}), 'and reopens it');
  accepted(await call(teacher, 'PATCH', ['distributions', base.id], {dueAt: iso(-HOUR), afterDue: 'lock'}), 'teacher locks it after a deadline');
  same((await call(me, 'GET', ['review'])).data.items.length, 0, 'a locked set is left out of the missed-card review');
  refused(await call(me, 'GET', ['review'], undefined, {query: `?distributionId=${base.id}`}), 403, 'DUE_CLOSED', 'and its date review is closed');
  refused(await study(me, base.id, 'recall', 'm-r3', right(2), {review: true}), 403, 'DUE_CLOSED', 'a review answer after the lock is refused');
  refused(await call('u9:0', 'GET', ['review'], undefined, {query: `?distributionId=${other.id}`}), 404, 'NOT_FOUND', 'a student from another class cannot review it');
  refused(await call(teacher, 'GET', ['review']), 403, 'FORBIDDEN', 'a teacher has no review session');

  // Teacher report and Berry.
  const data = await report(other.id), row = reported(data, 's5');
  same([row.progress.mastery, row.levels.card4, row.levels.card7], [Math.round((10 + 2) / 48 * 100), 1, 1], 'the report carries mastery and card levels');
  same(reported(data, 's6').levels, {}, 'a student with no answers has no levels');
  const bearer = {uid: teacher, role: 'teacher', grantId: 'grant', clientId: 'client', scopes: ['classroom:read']};
  const berry = (await callClassroomTool('list_card_sets', {distribution_id: other.id}, bearer)).card_sets[0].progress;
  check(typeof berry.average_mastery === 'number' && berry.review_due_students === 0 && berry.review_due_cards === 0, 'Berry reads class mastery and due counts', berry);
  check(!JSON.stringify(berry).includes('학생5'), 'without names');

  // Old records: no cardStates, no miss index.
  const old = await distribute({test: {questionCount: 2, maxAttempts: 5}});
  await db().doc(`cardProgress/${old.id}_s6`).set({distributionId: old.id, ownerUid: teacher, classId: 'class-a', studentId: 's6', counts: {memorize: 0, recall: 3, spell: 0}, correctCounts: {memorize: 0, recall: 3, spell: 0}, coverage: {memorize: {}, recall: {card0: 1}, spell: {}}, mistakes: {card1: 2}, attempts: 0, bestScore: null, latestScore: null, starredCardIds: [], lastPosition: null, activeAttemptId: null, lastSubmittedAttemptId: null, updatedAt: iso(-HOUR)});
  const oldDetail = await call(pupil(6), 'GET', ['distributions', old.id]);
  same([oldDetail.status, oldDetail.data.progress.mastery, oldDetail.data.progress.reviewDue, oldDetail.data.cardStates], [200, 0, 0, {}], 'an old record reads as 0% with nothing due');
  same(reported(await report(old.id), 's6').levels, {}, 'the report reads it with no levels');
  same((await call(pupil(6), 'GET', ['review'])).data.items, [], 'no miss index means an empty review');
  const oldStudy = await study(pupil(6), old.id, 'recall', 'm-o1', [...right(0), wrong(1)]);
  same([oldStudy.status, oldStudy.data.progress.counts.recall], [200, 5], 'an old record keeps taking study');
  const upgraded = (await db().doc(`cardProgress/${old.id}_s6`).get()).data();
  same([upgraded.cardStates.card0.l, upgraded.mistakes.card1], [1, 3], 'and gains card states while keeping its old counts');
  same((await db().doc('cardMisses/class-a_s6').get()).data().misses, {[old.id]: {card1: today}}, 'the first miss creates the index');
}

async function classSection() {
  section('class defaults, lesson notes and order');
  const path = classId => ['classes', classId, 'settings'];
  // A class that never saved the doc reads as the app defaults and newest-first order.
  const fresh = await call(teacher, 'GET', path('class-a'));
  same([fresh.status, fresh.data.settings.saved, fresh.data.settings.plan, fresh.data.settings.revision, fresh.data.settings.defaults.word.modes.spell.on, fresh.data.settings.defaults.sentence.afterDue], [200, false, [], 0, false, 'late'], 'an old class without the doc reads as app defaults');
  // Ownership: only the class owner, never a student or another teacher.
  refused(await call(stranger, 'GET', path('class-a')), 404, 'NOT_FOUND', 'another teacher cannot read the class settings');
  refused(await call(stranger, 'PATCH', path('class-a'), {plan: []}), 404, 'NOT_FOUND', 'another teacher cannot write them');
  refused(await call(pupil(1), 'GET', path('class-a')), 403, 'FORBIDDEN', 'a student cannot read them');
  refused(await call(teacher, 'GET', path('class-b')), 404, 'NOT_FOUND', 'the teacher cannot read a class of another teacher');
  refused(await call(teacher, 'PATCH', path('class-a'), {defaults: {word: {modes: {recall: {percent: 120}}}}}), 400, 'CLASS_SETTINGS', 'an unknown percent is refused');
  refused(await call(teacher, 'PATCH', path('class-a'), {}), 400, undefined, 'an empty save is refused');
  const before = await distribute({test: {questionCount: 3}});
  const studentBefore = await call(pupil(1), 'GET', ['student']);
  same(studentBefore.data.layout?.[0], {kind: 'set', id: studentBefore.data.distributions[0].id, highlight: false}, 'without a doc the student list still gets a newest-first layout');
  // Defaults: saved per type, reused by Berry; existing distributions untouched.
  const defaults = {word: {modes: {memorize: {on: false, percent: 100, direction: 'front-back'}, recall: {on: true, percent: 200, direction: 'back-front'}, spell: {on: true, percent: 50, direction: 'front-back'}}, speechRate: 0.7, test: {questionCount: 5, goalScore: 90, maxAttempts: 2, requireStudy: true, direction: 'front-back', answerRelease: 'immediate', format: 'choice', timeLimitMinutes: 10}, afterDue: 'lock'}};
  const saved = await call(teacher, 'PATCH', path('class-a'), {defaults, expectedRevision: 0});
  same([saved.status, saved.data.settings.revision, saved.data.settings.defaults.word.speechRate, saved.data.settings.defaults.sentence.speechRate, saved.data.classes], [200, 1, 0.7, 1, 1], 'the teacher saves word defaults; sentence keeps app defaults');
  refused(await call(teacher, 'PATCH', path('class-a'), {plan: [], expectedRevision: 0}), 409, 'STALE_SETTINGS', 'a save from a stale tab is refused');
  const untouched = (await call(teacher, 'GET', ['distributions', before.id])).data.distribution;
  same([untouched.test.questionCount, untouched.speechRate], [3, null], 'saving defaults leaves existing distributions alone');
  // 기존 배부에도 적용: the same PATCH the dialog sends, keeping each mode's range.
  const {patchFromDefaults, parseClassDefaults} = await import('@/lib/cards-class-plan');
  const ranged = await distribute({requiredModes: {recall: {requiredCount: 1, direction: 'front-back', rangeStart: 3, rangeEnd: 6}}});
  const applied = await call(teacher, 'PATCH', ['distributions', ranged.id], patchFromDefaults(parseClassDefaults(defaults.word), ranged));
  same([applied.status, applied.data.distribution.requiredModes.recall, applied.data.distribution.requiredModes.memorize.requiredCount, applied.data.distribution.test.timeLimitSeconds, applied.data.distribution.afterDue, applied.data.distribution.speechRate], [200, {requiredCount: 8, direction: 'back-front', rangeStart: 3, rangeEnd: 6}, 0, 600, 'lock', 0.7], 'applying to an existing distribution keeps its range and records the speech rate');
  refused(await call(teacher, 'PATCH', ['distributions', ranged.id], {speechRate: 0.75}), 400, undefined, 'an odd speech rate is refused');
  const spoken = await distribute({speechRate: 1.2});
  same([spoken.speechRate, (await call(pupil(2), 'GET', ['distributions', spoken.id])).data.distribution.speechRate], [1.2, 1.2], 'the student detail carries the speech rate');
  // Order, memos, highlight and hidden rows.
  const plan = [{kind: 'memo', id: 'm-1', text: '3/12 수업: Unit 1-2'}, {kind: 'set', id: ranged.id, highlight: true}, {kind: 'set', id: before.id, hidden: true}, {kind: 'memo', id: 'm-2', text: '학생1 보충', hidden: true}, {kind: 'memo', id: 'm-3', text: '학생2 발표 연습'}, {kind: 'set', id: 'gone-distribution'}];
  const ordered = await call(teacher, 'PATCH', path('class-a'), {plan, expectedRevision: 1});
  same([ordered.status, ordered.data.settings.plan.length, ordered.data.settings.defaults.word.speechRate], [200, 6, 0.7], 'the plan saves next to the defaults without dropping them');
  const list = await call(pupil(1), 'GET', ['student']), ids = list.data.distributions.map(row => row.id);
  check(!ids.includes(before.id), 'a hidden row is not in the student list', ids);
  same(list.data.layout.filter(row => row.kind === 'memo').map(row => row.id), ['m-1', 'm-3'], 'students get visible memos only');
  const memoAt = list.data.layout.findIndex(row => row.id === 'm-1'), pickAt = list.data.layout.findIndex(row => row.id === ranged.id);
  same([pickAt, list.data.layout[pickAt].highlight, ids.indexOf(spoken.id) < ids.indexOf(ranged.id)], [memoAt + 1, true, true], 'the teacher order holds: new rows first, then the memo and the highlighted set');
  same(list.data.distributions.length, list.data.layout.filter(row => row.kind === 'set').length, 'every listed set has its place in the layout');
  same((await call(pupil(1), 'GET', ['distributions', before.id])).status, 200, 'the hidden distribution and its data stay (direct open still works)');
  check((await call(teacher, 'GET', ['distributions'], undefined, {query: '?classId=class-a'})).data.distributions.some(row => row.id === before.id), 'the teacher list keeps the hidden row');
  const leak = await call(pupil(9), 'GET', ['student']);
  check(!JSON.stringify(leak.data).includes('Unit 1-2'), 'a student of another class never sees these memos', leak.data);
  refused(await call(teacher, 'PATCH', path('class-a'), {plan: [{kind: 'memo', id: 'long', text: '가'.repeat(201)}]}), 400, 'CLASS_SETTINGS', 'a memo over 200 characters is refused');
  refused(await call(teacher, 'PATCH', path('class-a'), {plan: Array.from({length: 101}, (_, index) => ({kind: 'memo', id: `m${index}`, text: 'x'}))}), 400, 'CLASS_SETTINGS', 'more than 100 memos are refused');
  refused(await call(teacher, 'PATCH', path('class-a'), {plan: [{kind: 'set', id: 'a/b'}]}), 400, 'CLASS_SETTINGS', 'a row id with a path is refused');
  // 모든 반에 적용: defaults only; another class keeps its own plan, and an earlier owner's doc is replaced, not merged.
  await db().doc('classes/class-c').set({ownerUid: teacher, name: '3-3', grade: 3});
  await db().doc('cardClassSettings/class-c').set({ownerUid: stranger, classId: 'class-c', defaults: {word: {speechRate: 1.5}}, plan: [{kind: 'memo', id: 'old', text: '전 주인 메모'}], revision: 9});
  const everywhere = await call(teacher, 'PATCH', path('class-a'), {defaults: {...defaults, sentence: {afterDue: 'open'}}, allClasses: true});
  const other = (await db().doc('cardClassSettings/class-c').get()).data(), mine = (await call(teacher, 'GET', path('class-a'))).data.settings;
  same([everywhere.data.classes, other.ownerUid, other.plan, other.defaults.word.speechRate, other.defaults.sentence.afterDue, mine.plan.length], [(await db().collection('classes').where('ownerUid', '==', teacher).get()).size, teacher, [], 0.7, 'open', 6], 'all classes get the defaults; their own plans stay and an old owner memo goes');
  check(!(await db().doc('cardClassSettings/class-b').get()).exists, 'a class of another teacher is never written');
  refused(await call(teacher, 'PATCH', path('class-a'), {plan: [], allClasses: true}), 400, undefined, 'only defaults go to all classes');
  // Berry: order, hidden and memos, pseudonymous; distribute fills gaps from the class defaults.
  const bearer = {uid: teacher, role: 'teacher', grantId: 'grant', clientId: 'client', scopes: ['classroom:read', 'classroom:write']};
  const berry = await callClassroomTool('list_card_sets', {class_id: 'class-a'}, bearer);
  const row = id => berry.card_sets.find(item => item.id === id);
  same([row(before.id)?.hidden_from_students, row(ranged.id)?.highlight, row(ranged.id)?.order > row(spoken.id)?.order], [true, true, true], 'list_card_sets carries order, hidden and highlight');
  check(berry.memos?.some(memo => memo.text === '3/12 수업: Unit 1-2') && !JSON.stringify(berry.memos).includes('학생1') && !JSON.stringify(berry.memos).includes('학생2') && berry.memos.some(memo => memo.hidden_from_students), 'memos reach Berry name-masked, hidden ones marked', berry.memos);
  try {
    const {planManage} = await import('@/modules/berry-connector/manage-tools');
    const planned = await planManage('manage_cards', {action: 'distribute', class_id: 'class-a', set_id: setId}, bearer), body = planned.calls[0].body;
    same([body.requiredModes.memorize.requiredCount, body.requiredModes.recall.requiredCount, body.test.questionCount, body.test.format, body.afterDue, body.speechRate], [0, 24, 5, 'choice', 'lock', 0.7], 'Berry distribute uses the class defaults when args are left out');
    const told = await planManage('manage_cards', {action: 'distribute', class_id: 'class-a', set_id: setId, test: {goal_score: 60}}, bearer);
    same(told.calls[0].body.test.goalScore, 60, 'what the teacher tells Berry still wins');
  } catch (error) {check(false, 'manage_cards planning ran', String(error.stack ?? error).slice(0, 300));}
}

async function guardSection() {
  section('test answer protection and time estimate');
  // Written test, word → meaning: while it runs nothing a student can fetch may carry a meaning (뜻 n), an alternative (의미 0) or an expected answer.
  const me = pupil(2), given = await distribute({requiredModes: {recall: {requiredCount: 12, direction: 'front-back', rangeStart: 1, rangeEnd: 12}}, test: {questionCount: 4, format: 'written', direction: 'front-back', answerRelease: 'immediate', maxAttempts: 5}}), base = given.id;
  const other = (await distribute()).id;
  const secret = value => /뜻 \d|의미 0|expectedAnswer/.test(JSON.stringify(value));
  accepted(await study(me, base, 'recall', 'gd-1', [...right(0), {cardId: 'card2', answer: 'x'}]), 'study before the test is open');
  accepted(await study(me, other, 'recall', 'gh-1', [{cardId: 'card3', answer: 'x'}], {direction: 'back-front'}), 'a miss in another set');
  const first = await start(me, base, 'gs-1');
  accepted(await submit(me, base, first.data.attempt.id, first.data.attempt.questions.map(question => answerFor(question, 'front-back'))), 'first attempt handed in');
  check(secret((await call(me, 'GET', ['distributions', base, 'tests'])).data), 'with no test running, released results show answers (by design)');
  const running = await start(me, base, 'gs-2'), attempt = running.data.attempt;
  check(running.status === 201 && !secret(running.data), 'the new attempt carries prompts only', running.data);
  const detail = await call(me, 'GET', ['distributions', base]);
  check(detail.status === 200 && detail.data.testActive?.attemptId === attempt.id && !secret(detail.data), 'detail during the test: no meanings, alternatives or answers', detail.data.distribution?.snapshot?.cards?.slice(0, 2));
  same(detail.data.distribution.snapshot.cards.map(card => card.front), cards.map(card => card.front), 'the prompt side and card order stay');
  check(!secret((await call(me, 'GET', ['distributions', base, 'tests'])).data), 'test history hides earlier results while one runs');
  check(!secret((await start(me, base, 'gs-2b')).data), 'resuming the attempt shows prompts only');
  refused(await study(me, base, 'recall', 'gd-2', right(4)), 409, 'TEST_ACTIVE', 'new study answers wait for the test');
  refused(await study(me, base, 'recall', 'gd-3', right(5), {review: true}), 409, 'TEST_ACTIVE', 'review answers wait too');
  same((await db().doc(`cardProgress/${base}_s2`).get()).data().counts.recall, 2, 'nothing was graded or stored');
  const replay = await study(me, base, 'recall', 'gd-1', [...right(0), {cardId: 'card2', answer: 'x'}]);
  check(replay.status === 200 && replay.data.duplicate && !secret(replay.data), 'a replayed old batch returns no expected answers', replay.data);
  refused(await call(me, 'GET', ['review'], undefined, {query: `?distributionId=${base}`}), 409, 'TEST_ACTIVE', 'the set review waits');
  const missed = await call(me, 'GET', ['review']);
  check(missed.status === 200 && !missed.data.items.some(item => item.distributionId === base) && missed.data.items.some(item => item.distributionId === other), 'missed-card review skips the set under test, keeps the others', missed.data.items?.map(item => item.distributionId));
  check(!secret((await call(me, 'GET', ['distributions', base, 'games'])).data) && !secret((await call(me, 'GET', ['student'])).data), 'games and the set list carry no card text');
  check(secret((await call(teacher, 'GET', ['distributions', base])).data), 'the teacher still sees the whole set');
  const otherStudent = await call(pupil(3), 'GET', ['distributions', base]);
  check(otherStudent.data.testActive === undefined && secret(otherStudent.data), 'a classmate without a running test studies as usual');
  const done = await submit(me, base, attempt.id, attempt.questions.map(question => answerFor(question, 'front-back')));
  accepted(done, 'the test is handed in');
  const after = await call(me, 'GET', ['distributions', base]);
  check(after.data.testActive === undefined && after.data.distribution.snapshot.cards[0].back === '뜻 0' && after.data.distribution.snapshot.cards[0].alternatives[0] === '의미 0', 'after the test the cards come back whole');
  accepted(await study(me, base, 'recall', 'gd-2', right(4)), 'study resumes after the test');
  check((await call(me, 'GET', ['review'], undefined, {query: `?distributionId=${base}`})).status === 200, 'the set review opens again');
  check(secret((await call(me, 'GET', ['distributions', base, 'tests'])).data), 'released results show again');
  // A timed attempt past its limit and grace no longer holds study (the late hand-in is marked overtime for the teacher).
  const timed = (await distribute({test: {questionCount: 2, format: 'written', timeLimitSeconds: 60, direction: 'front-back'}})).id, clock = await start(me, timed, 'gt-1');
  check(secret((await call(me, 'GET', ['distributions', timed])).data) === false, 'a timed attempt within time hides answers');
  await db().doc(`cardProgress/${timed}_s2/tests/${clock.data.attempt.id}`).update({startedAt: iso(-3 * MIN)});
  const late = await call(me, 'GET', ['distributions', timed]);
  check(late.data.testActive === undefined && secret(late.data), 'past time and grace the set opens again', late.data.testActive);
  accepted(await study(me, timed, 'memorize', 'gt-2', right(0)), 'and takes study');
  // Berry: estimated minutes per set from counts only.
  const {cardEstimateMinutes} = await import('@/lib/cards-load');
  const stored = (await db().doc(`cardClassSets/${base}`).get()).data();
  const berry = await callClassroomTool('list_card_sets', {class_id: 'class-a', distribution_id: base}, {uid: teacher, role: 'teacher', grantId: 'grant', clientId: 'client', scopes: ['classroom:read']});
  same([berry.card_sets[0].minutes, cardEstimateMinutes(stored)], [Math.ceil((12 * 6 + 4 * 15) / 60), Math.ceil((12 * 6 + 4 * 15) / 60)], 'list_card_sets gives the estimated minutes');
}

const sections = {study: studySection, edited: editedSection, tests: testsSection, deadline: deadlineSection, patch: patchSection, old: oldSection, room: roomSection, berry: berrySection, ai: aiSection, games: gamesSection, mastery: masterySection, class: classSection, guard: guardSection};
// 구역 family: 학부모 링크(학생 1명·읽기 전용·만료·회수)와 카드놀이 보말(필수 학습·목표 첫 달성, 한 번씩). `node scripts/cards-flow-check.mjs family`
async function familySection() {
  section('parent links and card rewards');
  const {publicCardShare} = await import('@/lib/server/cards-shares');
  const view = async (token, ip = '10.1.0.1') => {const response = await publicCardShare(new Request(`http://cards.test/api/cards-parent/${token}`, {headers: {'x-forwarded-for': ip}}), token); return {status: response.status, data: await response.json(), robots: response.headers.get('x-robots-tag')};};
  const tokenOf = link => link.path.split('/').pop();
  const ledger = studentId => db().collection(`classes/class-a/students/${studentId}/pointLedger`).where('source', '==', 'cards').get();
  const balance = async studentId => (await db().doc(`classes/class-a/students/${studentId}`).get()).data().points ?? 0;
  const given = await distribute({requiredModes: {memorize: {requiredCount: 0, direction: 'front-back', rangeStart: 1, rangeEnd: 12}, recall: {requiredCount: 4, direction: 'front-back', rangeStart: 1, rangeEnd: 4}, spell: {requiredCount: 0, direction: 'front-back', rangeStart: 1, rangeEnd: 12}}, test: {questionCount: 4, goalScore: 50, maxAttempts: 9, direction: 'front-back', answerRelease: 'immediate', format: 'written'}}), base = given.id;
  const rewards = ['classes', 'class-a', 'rewards'];

  // The switch: class owner only, off by default.
  same((await call(teacher, 'GET', rewards)).data.rewardsEnabled, false, 'card rewards are off by default');
  refused(await call(stranger, 'PATCH', rewards, {rewardsEnabled: true}), 404, 'NOT_FOUND', 'another teacher cannot switch card rewards');
  refused(await call(pupil(1), 'PATCH', rewards, {rewardsEnabled: true}), 403, 'FORBIDDEN', 'a student cannot switch card rewards');
  refused(await call(teacher, 'PATCH', rewards, {rewardsEnabled: 'yes'}), 400, 'REWARD_SETTINGS', 'the switch takes a boolean only');
  await db().doc('classes/class-a').set({pointSettings: {enabled: true, label: '보말', rules: {homework: 10}}}, {merge: true});
  // Off: finishing pays nothing, and switching on later does not pay for it afterwards.
  accepted(await study(pupil(3), base, 'recall', 'fam-3a', right(0, 1, 2, 3)), 's3 finishes the required study while rewards are off');
  accepted(await call(teacher, 'PATCH', rewards, {rewardsEnabled: true}), 'teacher turns card rewards on');
  accepted(await study(pupil(3), base, 'recall', 'fam-3b', right(0, 1)), 's3 keeps studying after finishing');
  same((await ledger('s3')).size, 0, 'no reward for a finish that came before the switch, nor for more study');
  // On: the first finish pays once; replays and more study do not.
  const before = await balance('s4');
  accepted(await study(pupil(4), base, 'recall', 'fam-4a', right(0, 1)), 's4 studies half');
  same((await ledger('s4')).size, 0, 'half the required study pays nothing');
  accepted(await study(pupil(4), base, 'recall', 'fam-4b', right(2, 3)), 's4 finishes the required study');
  const paid = await db().doc(`classes/class-a/students/s4/pointLedger/cards_study_${base}`).get();
  same([paid.exists, paid.data()?.amount, paid.data()?.kind, paid.data()?.sourceId, await balance('s4')], [true, 5, 'earn', base, before + 5], 'finishing pays 5 under a fixed ledger ID');
  check((await study(pupil(4), base, 'recall', 'fam-4b', right(2, 3))).data.duplicate === true, 'the finishing batch replays as a duplicate');
  accepted(await study(pupil(4), base, 'recall', 'fam-4c', right(0, 1, 2, 3)), 's4 studies another round');
  accepted(await study(pupil(4), base, 'recall', 'fam-4d', right(0, 1), {review: true}), 's4 reviews');
  same([(await ledger('s4')).size, await balance('s4')], [1, before + 5], 'replays, more rounds and reviews pay nothing more');
  same((await db().doc(`cardProgress/${base}_s4`).get()).data().pointRewards, {study: 5}, 'the progress record notes the reward for Berry counts');
  // The test goal: a failed attempt pays nothing, the first pass pays 10, a second pass nothing.
  const sit = async (requestId, wrong) => {const started = await start(pupil(4), base, requestId); return submit(pupil(4), base, started.data.attempt.id, started.data.attempt.questions.map(question => answerFor(question, 'front-back', wrong)));};
  accepted(await sit('fam-t1', true), 's4 fails a test');
  same((await ledger('s4')).size, 1, 'a failed test pays nothing');
  accepted(await sit('fam-t2', false), 's4 passes the test');
  same([(await db().doc(`classes/class-a/students/s4/pointLedger/cards_goal_${base}`).get()).data()?.amount, await balance('s4')], [10, before + 15], 'the first pass pays 10');
  accepted(await sit('fam-t3', false), 's4 passes again');
  same([(await ledger('s4')).size, await balance('s4')], [2, before + 15], 'one distribution pays at most 15: no second goal reward');
  const mine = await call(pupil(4), 'GET', ['distributions', base, 'rewards']);
  same(mine.data.rewards.map(row => [row.kind, row.amount]), [['study', 5], ['goal', 10]], 'the student reads their own two rewards');
  same((await call(pupil(3), 'GET', ['distributions', base, 'rewards'])).data.rewards, [], 'another student sees only their own (none)');
  refused(await call(teacher, 'GET', ['distributions', base, 'rewards']), 403, 'FORBIDDEN', 'the reward moment route is for students');
  // Game scores never pay.
  accepted(await call(pupil(4), 'POST', ['distributions', base, 'games'], {requestId: 'fam-g1', game: 'pair', pairs: 6, elapsedMs: 30_000, mistakes: 0}), 's4 plays a review game');
  same((await ledger('s4')).size, 2, 'a game record pays nothing');
  // Class 보말 off: nothing is paid even with the card switch on.
  await db().doc('classes/class-a').set({pointSettings: {enabled: false}}, {merge: true});
  accepted(await study(pupil(2), base, 'recall', 'fam-2a', right(0, 1, 2, 3)), 's2 finishes while the class 보말 is off');
  same((await ledger('s2')).size, 0, 'no reward when the class 보말 is off');
  await db().doc('classes/class-a').set({pointSettings: {enabled: true}}, {merge: true});

  // Parent links: teacher only, the class's own students, 1-60 days.
  const shares = ['distributions', base, 'shares'];
  refused(await call(stranger, 'POST', shares, {studentIds: ['s4']}), 404, 'NOT_FOUND', 'another teacher cannot make a link');
  refused(await call(pupil(4), 'POST', shares, {studentIds: ['s4']}), 403, 'FORBIDDEN', 'a student cannot make a link');
  refused(await call(teacher, 'POST', shares, {studentIds: ['s4'], days: 61}), 400, 'SHARE_DAYS', 'more than 60 days is refused');
  refused(await call(teacher, 'POST', shares, {studentIds: ['s9']}), 400, 'SHARE_STUDENTS', 'a student of another class is refused');
  const made = await call(teacher, 'POST', shares, {studentIds: ['s4'], note: '꾸준히 하고 있어요'});
  check(made.status === 201 && made.data.links.length === 1 && /^\/family\/cards\/[A-Za-z0-9_-]{43}$/.test(made.data.links[0].path), 'teacher makes one link', made.data);
  const token = tokenOf(made.data.links[0]), expiry = Date.parse(made.data.expiresAt) - Date.now();
  check(expiry > 13.9 * 86_400_000 && expiry <= 14 * 86_400_000, '14 days by default', made.data.expiresAt);
  const stored = (await db().collection('cardReportShares').get()).docs;
  check(stored.length === 1 && !JSON.stringify(stored[0].data()).includes(token) && stored[0].id !== token, 'only a hash of the token is stored', stored.map(doc => doc.id));
  const listed = await call(teacher, 'GET', shares);
  check(listed.data.shares.length === 1 && listed.data.shares[0].state === 'active' && !JSON.stringify(listed.data).includes(token), 'the teacher list shows state but no token', listed.data);
  const seen = await view(token);
  check(seen.status === 200 && seen.robots?.includes('noindex'), 'the link opens without login, marked noindex', seen);
  same([seen.data.student.name, seen.data.note, seen.data.progress.studyPercent, seen.data.progress.studyComplete, seen.data.test.bestScore, seen.data.test.goalReached, seen.data.test.scores.map(row => row.score)], ['학생4', '꾸준히 하고 있어요', 100, true, 100, true, [0, 100, 100]], 'the page shows this student: study, scores and the note');
  check(seen.data.practice.words.length > 0 && seen.data.practice.words[0].count >= 1 && !seen.data.practice.hidden, 'most-missed words to practise', seen.data.practice);
  const text = JSON.stringify(seen.data);
  check(!['학생1', '학생2', '학생3', '"s1"', '"s2"', '"s3"', 's4', 'rank', 'points', 'pointRewards', 'expectedAnswer', 'questions', 'classId', 'studentId'].some(word => text.includes(word)), 'nothing about other students, rankings, 보말, answers or IDs', text.slice(0, 400));
  same((await db().doc(`cardReportShares/${stored[0].id}`).get()).data().views, 1, 'opening counts one view and nothing else');
  // While a test is open the practice words wait.
  const open = await start(pupil(4), base, 'fam-t4');
  same((await view(token)).data.practice, {words: [], hidden: true}, 'practice words wait while a test is open');
  await submit(pupil(4), base, open.data.attempt.id, open.data.attempt.questions.map(question => answerFor(question, 'front-back')));
  // All at once: every student gets one, s4's earlier link is replaced.
  const all = await call(teacher, 'POST', shares, {studentIds: 'all', days: 3, nameMode: 'none'});
  const link = studentId => all.data.links.find(row => row.studentId === studentId);
  same([all.status, ['s1', 's2', 's3', 's4'].every(link), all.data.links.every((row, index) => !index || all.data.links[index - 1].number <= row.number), all.data.replaced], [201, true, true, 1], 'all students at once, in number order, replacing the open one');
  same((await view(token)).status, 404, 'the replaced link no longer opens');
  const s1 = await view(tokenOf(link('s1')));
  same([s1.status, s1.data.student.name], [200, ''], 'the no-name choice shows no name');
  check(!JSON.stringify(s1.data).includes('학생4') && !JSON.stringify(s1.data).includes('꾸준히'), 'a link shows only its own student', s1.data);
  // Revoked and expired links close at once.
  const s2 = link('s2'), s2id = (await call(teacher, 'GET', shares)).data.shares.find(row => row.studentId === 's2' && row.state === 'active').id;
  same((await view(tokenOf(s2))).status, 200, 's2 link opens');
  accepted(await call(teacher, 'DELETE', [...shares, s2id]), 'teacher closes the s2 link');
  same((await view(tokenOf(s2))).status, 404, 'a closed link is gone at once');
  const s3 = link('s3');
  await db().doc(`cardReportShares/${(await call(teacher, 'GET', shares)).data.shares.find(row => row.studentId === 's3' && row.state === 'active').id}`).update({expiresAt: iso(-MIN)});
  same((await view(tokenOf(s3))).status, 404, 'an expired link is gone');
  same((await view('x'.repeat(43))).status, 404, 'an unknown token is 404');
  same((await view('short')).status, 404, 'a malformed token is 404');
  // Berry: counts only.
  const bearer = {uid: teacher, role: 'teacher', grantId: 'grant', clientId: 'client', scopes: ['classroom:read']};
  const berry = (await callClassroomTool('list_card_sets', {distribution_id: base}, bearer)).card_sets[0];
  same([berry.parent_links, berry.progress?.bomal_given], [{active: all.data.links.length - 2, opened: 1}, {study: 1, goal: 1}], 'list_card_sets carries link and reward counts');
  check(!JSON.stringify(berry).includes(tokenOf(link('s4'))) && !JSON.stringify(berry).includes('/family/'), 'Berry never sees a token', berry);
  // Close all, then rate limits.
  same((await call(teacher, 'DELETE', shares)).data.revoked, all.data.links.length - 2, 'close all closes the open ones');
  same((await view(tokenOf(link('s4')))).status, 404, 'closed by close-all');
  const ip = '10.9.9.9';
  for (let index = 0; index < 12; index++) await view('y'.repeat(43), ip);
  same((await view(tokenOf(link('s1')), ip)).status, 429, 'many wrong tokens from one address are slowed down');
  const {createHash} = await import('node:crypto'), window = Math.floor(Date.now() / 600_000), limits = (await db().collection('rateLimits').get()).docs.map(doc => doc.id);
  const plain = ['failed', 'total'].map(kind => createHash('sha256').update(`cards-parent-${kind}:${ip}:${window}`).digest('hex'));
  check(limits.filter(name => name.startsWith('cards_parent_')).length >= 2 && !limits.some(name => plain.some(hash => name.includes(hash))), 'rate limit IDs are keyed HMACs, not a plain hash of the address', limits);
  await db().doc('classes/class-a/students/s1').set({disabled: true}, {merge: true});
  // Two creates at once for one student leave exactly one open link.
  const racing = await Promise.all([call(teacher, 'POST', shares, {studentIds: ['s3']}), call(teacher, 'POST', shares, {studentIds: ['s3']}), call(teacher, 'POST', shares, {studentIds: ['s3', 's2']})]);
  check(racing.every(result => result.status === 201), 'three creates at once all answer', racing.map(result => result.status));
  const openFor = async studentId => (await call(teacher, 'GET', shares)).data.shares.filter(row => row.studentId === studentId && row.state === 'active').length;
  same([await openFor('s3'), await openFor('s2')], [1, 1], 'concurrent creates leave one open link per student');
  same((await Promise.all(racing.flatMap(result => result.data.links.filter(row => row.studentId === 's3')).map(row => view(tokenOf(row), '10.4.0.1')))).filter(result => result.status === 200).length, 1, 'and exactly one of the new s3 links opens');
  const again = await call(teacher, 'POST', shares, {studentIds: ['s4']});
  accepted(again, 'a fresh link for s4');
  refused(await call(teacher, 'POST', shares, {studentIds: ['s1']}), 400, 'SHARE_STUDENTS', 'a disabled student gets no link');
  await db().doc('classes/class-a/students/s4').set({disabled: true}, {merge: true});
  same((await view(tokenOf(again.data.links[0]), '10.1.0.2')).status, 404, 'a link stops when the student is disabled');
  await db().doc('classes/class-a/students/s1').set({disabled: false}, {merge: true});
  await db().doc('classes/class-a/students/s4').set({disabled: false}, {merge: true});
}
sections.family = familySection;
// 구역 counted: 제한 시간이 지난 응시와 오답 재시험은 목표·보말을 움직이지 않는다. `node scripts/cards-flow-check.mjs counted`
async function countedSection() {
  section('overtime and retry attempts do not reach the goal');
  const {publicCardShare} = await import('@/lib/server/cards-shares');
  await db().doc('classes/class-a').set({pointSettings: {enabled: true, label: '보말'}}, {merge: true});
  accepted(await call(teacher, 'PATCH', ['classes', 'class-a', 'rewards'], {rewardsEnabled: true}), 'card rewards on');
  const given = await distribute({test: {questionCount: 4, goalScore: 50, maxAttempts: 9, direction: 'front-back', answerRelease: 'immediate', format: 'written', timeLimitSeconds: 60}}), base = given.id;
  const goalPaid = async () => (await db().doc(`classes/class-a/students/s2/pointLedger/cards_goal_${base}`).get()).exists;
  const progressOf = async () => (await db().doc(`cardProgress/${base}_s2`).get()).data();
  // Overtime: a full-marks hand-in after limit + grace is graded and kept, but counts for nothing.
  const late = (await start(pupil(2), base, 'cnt-1')).data.attempt;
  await db().doc(`cardProgress/${base}_s2/tests/${late.id}`).update({startedAt: iso(-(60 + 61 + 5) * 1000)});
  const lateSubmit = await submit(pupil(2), base, late.id, late.questions.map(question => answerFor(question, 'front-back')));
  same([lateSubmit.status, lateSubmit.data.attempt.score, lateSubmit.data.notCounted, 'overtime' in lateSubmit.data.attempt], [200, 100, true, false], 'an overtime hand-in is graded; the student is told it did not count, without the flag');
  same([lateSubmit.data.progress.bestScore, lateSubmit.data.progress.latestScore, lateSubmit.data.progress.goalReached], [null, null, false], 'it moves neither best nor latest score, nor the goal');
  same([await goalPaid(), (await db().doc(`cardProgress/${base}_s2/tests/${late.id}`).get()).data().overtime], [false, true], 'no goal 보말; the overtime attempt is kept for the teacher');
  const report = (await call(teacher, 'GET', ['distributions', base, 'report'])).data.students.find(row => row.id === 's2');
  check(report.attempts.some(row => row.id === late.id && row.overtime === true && row.score === 100), 'the teacher report shows the overtime attempt and its score', report.attempts);
  const link = await call(teacher, 'POST', ['distributions', base, 'shares'], {studentIds: ['s2']});
  const token = link.data.links[0].path.split('/').pop(), page = async () => (await (await publicCardShare(new Request(`http://cards.test/api/cards-parent/${token}`, {headers: {'x-forwarded-for': '10.3.0.1'}}), token)).json()).test;
  same(await page(), {goalScore: 50, maxAttempts: 9, bestScore: null, latestScore: null, goalReached: false, scores: []}, 'the parent page shows no goal and no overtime score');
  // A retry of the missed cards may raise the best score, but never pays the goal.
  const failed = (await start(pupil(2), base, 'cnt-2')).data.attempt;
  const failedSubmit = await submit(pupil(2), base, failed.id, failed.questions.map((question, index) => answerFor(question, 'front-back', index > 0)));
  same([failedSubmit.data.attempt.score, failedSubmit.data.notCounted, failedSubmit.data.progress.goalReached], [25, undefined, false], 'an in-time attempt below the goal counts as usual');
  const retry = await start(pupil(2), base, 'cnt-3', {retryWrong: true});
  check(retry.status === 201 && retry.data.attempt.retryWrong === true && retry.data.attempt.questions.length === 3, 'a retry holds the three missed cards', retry.data);
  const retried = await submit(pupil(2), base, retry.data.attempt.id, retry.data.attempt.questions.map(question => answerFor(question, 'front-back')));
  same([retried.data.attempt.score, retried.data.progress.bestScore, retried.data.progress.goalReached, await goalPaid()], [100, 100, true, false], 'the retry raises the best score to the goal but pays no goal 보말');
  const full = (await start(pupil(2), base, 'cnt-4')).data.attempt;
  await submit(pupil(2), base, full.id, full.questions.map(question => answerFor(question, 'front-back')));
  same(await goalPaid(), false, 'the goal was already reached, so a later full pass pays nothing either');
}
sections.counted = countedSection;
// 구역 pages: 학생 목록 둘째 쪽(200개 넘음)도 숨긴 세트를 빼고 선생님 순서를 따르며, 누적 오답 줄과 복습이 같은 세트를 센다. `node scripts/cards-flow-check.mjs pages`
async function pagesSection() {
  section('student list pages and cross-set review agree');
  const classId = 'class-p', who = 'u20:0', today = logic.cardReviewDate(), stamp = iso(0);
  await db().doc(`classes/${classId}`).set({ownerUid: teacher, name: '많은 세트 반'});
  await db().doc(`classes/${classId}/students/s20`).set({name: '학생20', number: 1, authUid: 'u20'});
  await db().doc('users/u20').set({role: 'student', classId, studentId: 's20', authVersion: 0});
  const requiredModes = Object.fromEntries(['memorize', 'recall', 'spell'].map(mode => [mode, {requiredCount: 0, direction: 'front-back', rangeStart: 1, rangeEnd: 6}]));
  const snapshot = {title: '많은 세트', description: '', type: 'word', cards: cards.slice(0, 6)};
  const ids = Array.from({length: 205}, (_, index) => `p${String(index).padStart(3, '0')}`);
  for (let start = 0; start < ids.length; start += 100) {
    const batch = db().batch();
    for (const docId of ids.slice(start, start + 100)) batch.set(db().doc(`cardClassSets/${docId}`), {ownerUid: teacher, classId, className: '많은 세트 반', setId: `set-${docId}`, setVersion: 1, versionId: `set-${docId}_v1`, title: `세트 ${docId}`, type: 'word', cardCount: 6, cardIds: snapshot.cards.map(card => card.id), targetStudentIds: [], targetCount: 1, allStudents: true, requiredModes, test: {questionCount: 3, goalScore: 80, maxAttempts: 3, requireStudy: false, direction: 'front-back', answerRelease: 'immediate'}, dueAt: null, afterDue: 'open', active: true, snapshot, createdAt: stamp, updatedAt: stamp});
    await batch.commit();
  }
  // The teacher's order puts p204 before p203 and hides p202 (both on the second page) and p005 (first page).
  await db().doc(`cardClassSettings/${classId}`).set({ownerUid: teacher, revision: 1, plan: [{kind: 'set', id: 'p204'}, {kind: 'set', id: 'p203'}, {kind: 'set', id: 'p202', hidden: true}, {kind: 'set', id: 'p005', hidden: true}, ...ids.filter(docId => !['p202', 'p203', 'p204', 'p005'].includes(docId)).map(docId => ({kind: 'set', id: docId}))]});
  await db().doc(`cardMisses/${classId}_s20`).set({classId, studentId: 's20', misses: {p202: {card0: today}, p005: {card1: today}, p203: {card2: today}, p001: {card3: today}}, updatedAt: stamp});
  const first = await call(who, 'GET', ['student']);
  check(first.status === 200 && !!first.data.nextCursor && !first.data.distributions.some(row => row.id === 'p005'), 'the first page drops its hidden set', first.data.nextCursor);
  const second = await call(who, 'GET', ['student'], undefined, {query: `?cursor=${encodeURIComponent(first.data.nextCursor)}`});
  same(second.data.distributions?.map(row => row.id), ['p204', 'p203', 'p200', 'p201'], 'the second page drops its hidden set and keeps the teacher order');
  same([second.data.layout, first.data.layout?.length > 0], [undefined, true], 'memos and layout come with the first page only');
  same([first.data.review, second.data.review], [{total: 2, weeks: [{week: logic.cardWeekStart(today), count: 2}]}, {total: 2, weeks: [{week: logic.cardWeekStart(today), count: 2}]}], 'the pinned row counts misses in visible sets on any page, hidden ones never');
  const session = await call(who, 'GET', ['review']);
  same(session.data.items?.map(item => item.distributionId).sort(), ['p001', 'p203'], 'the review session holds exactly what the row counts');
  same((await call(who, 'GET', ['distributions', 'p202'])).status, 200, 'a hidden set still opens by its address');
}
sections.pages = pagesSection;
const bearerOf = uid => ({uid, role: 'teacher', grantId: 'grant', clientId: 'client', scopes: ['classroom:read']});
// 구역 transfer: 다른 반으로 옮기기·학기말 이월. 세트와 학습 기본값이 새 반에 배부되고, 이은 학생의 숙련도·별표·오답만 따라가며 원래 반은 그대로다. `node scripts/cards-flow-check.mjs transfer`
async function transferSection() {
  section('transfer sets and carry student records to another class');
  await db().doc('classes/class-n').set({ownerUid: teacher, name: '4-1', grade: 4, year: 2027});
  await db().doc('classes/class-n/students/s31').set({name: '학생1', number: 1, authUid: 'u31'});
  await db().doc('classes/class-n/students/s32').set({name: '새친구', number: 2, authUid: 'u32'});
  await db().doc('classes/class-n/students/s33').set({name: '전학', number: 3, authUid: 'u33', disabled: true});
  await db().doc('users/u31').set({role: 'student', classId: 'class-n', studentId: 's31', authVersion: 0});
  const given = await distribute({dueAt: iso(3 * 24 * HOUR), afterDue: 'lock', requiredModes: {recall: {requiredCount: 6, direction: 'front-back', rangeStart: 1, rangeEnd: 6}}, test: {questionCount: 5, goalScore: 80, maxAttempts: 3, direction: 'front-back', answerRelease: 'after-due', format: 'written'}}), base = given.id;
  accepted(await study(pupil(1), base, 'recall', 'tr-1', [...right(0, 1), {cardId: cards[2].id, answer: '틀림'}], {starredCardIds: [cards[1].id]}), 'a student builds mastery, a star and a miss in the old class');
  await call(teacher, 'PATCH', ['classes', 'class-a', 'settings'], {plan: [{kind: 'memo', id: 'memo-tr', text: '1단원 복습'}, {kind: 'set', id: base, highlight: true}]});
  const preview = await call(teacher, 'GET', ['classes', 'class-a', 'transfer'], undefined, {query: '?toClassId=class-n'});
  same(preview.data.links, [{from: 's1', to: 's31'}], 'the preview suggests the one student with the same name');
  check(preview.data.distributions.some(row => row.id === base) && preview.data.to.length === 3, 'the preview lists the class sets and the target roster', preview.data);
  refused(await call(stranger, 'GET', ['classes', 'class-a', 'transfer']), 404, 'NOT_FOUND', 'another teacher cannot see the transfer');
  refused(await call(pupil(1), 'GET', ['classes', 'class-a', 'transfer']), 403, 'FORBIDDEN', 'a student cannot transfer');
  refused(await call(teacher, 'POST', ['classes', 'class-a', 'transfer'], {toClassId: 'class-b', distributionIds: [base], requestId: 'tr-x'}), 404, 'NOT_FOUND', 'a class of another teacher cannot receive sets');
  refused(await call(teacher, 'POST', ['classes', 'class-a', 'transfer'], {toClassId: 'class-n', distributionIds: [base], links: [{from: 's1', to: 's33'}], requestId: 'tr-y'}), 400, 'TRANSFER_LINKS', 'a disabled target student cannot take a record');
  refused(await call(teacher, 'POST', ['classes', 'class-a', 'transfer'], {toClassId: 'class-n', distributionIds: [base], links: [{from: 's1', to: 's31'}, {from: 's1', to: 's32'}], requestId: 'tr-z'}), 400, 'TRANSFER_LINKS', 'one record goes to one student only');
  const input = {toClassId: 'class-n', distributionIds: [base], settings: true, keepDue: false, links: [{from: 's1', to: 's31'}, {from: 's2', to: 's32'}], requestId: 'tr-run'};
  const moved = await call(teacher, 'POST', ['classes', 'class-a', 'transfer'], input);
  same([moved.status, moved.data.result?.distributions, moved.data.result?.created, moved.data.result?.seeded, moved.data.result?.students], [201, 1, 1, 1, 2], 'one set moved; only the student with something to carry gets a record');
  const placed = (await db().collection('cardClassSets').where('classId', '==', 'class-n').get()).docs.map(doc => ({...doc.data(), id: doc.id}));
  const copy = placed.find(row => row.carriedFrom?.distributionId === base);
  same([placed.length, copy?.allStudents, copy?.targetStudentIds, copy?.dueAt, copy?.test.answerRelease, copy?.carriedFrom?.className, copy?.requiredModes.recall.requiredCount], [1, true, ['s31', 's32'], null, 'immediate', '3-2', 6], 'the new class gets the set for all its students, without the old deadline');
  const oldState = (await db().doc(`cardProgress/${base}_s1`).get()).data(), carried = (await db().doc(`cardProgress/${copy.id}_s31`).get()).data();
  same([carried.cardStates, carried.starredCardIds, carried.counts.recall, carried.attempts, carried.bestScore, carried.classId], [oldState.cardStates, [cards[1].id], 0, 0, null, 'class-n'], 'mastery and stars carry; study counts and scores start fresh');
  same((await db().doc('cardMisses/class-n_s31').get()).data()?.misses, {[copy.id]: {[cards[2].id]: logic.cardReviewDate()}}, 'the recent miss follows under the new set');
  same((await db().doc('cardStudentLinks/class-n_s31').get()).data()?.fromStudentId, 's1', 'the link is kept for the next transfer');
  const settings = (await call(teacher, 'GET', ['classes', 'class-n', 'settings'])).data.settings;
  same(settings.plan, [{kind: 'memo', id: 'memo-tr-c', text: '1단원 복습'}, {kind: 'set', id: copy.id, highlight: true}], 'the lesson order and memos move with the set');
  const learner = await call('u31:0', 'GET', ['distributions', copy.id]);
  check(learner.status === 200 && learner.data.progress.mastery > 0 && learner.data.progress.counts.recall === 0, 'the student sees the carried mastery in the new class', learner.data.progress);
  accepted(await call('u31:0', 'POST', ['distributions', copy.id, 'study'], {requestId: 'tr-new', mode: 'recall', direction: 'front-back', responses: right(3)}), 'the student keeps studying in the new class');
  const again = await call(teacher, 'POST', ['classes', 'class-a', 'transfer'], input);
  same([again.status, again.data.result?.created, again.data.result?.seeded], [201, 0, 0], 'a retry with the same request writes nothing new');
  same((await db().doc(`cardProgress/${copy.id}_s31`).get()).data().counts.recall, 1, 'the retry never overwrites what the student did in the new class');
  const oldReport = reported(await report(base), 's1');
  same([oldReport.progress.counts.recall, oldReport.progress.starredCardIds], [3, [cards[1].id]], 'the old class report is unchanged');
  same((await callClassroomTool('list_card_sets', {distribution_id: copy.id}, bearerOf(teacher))).card_sets[0].carried_from, '3-2', 'Berry sees where the set came from');
}
sections.transfer = transferSection;
// 구역 clone: 클래스 복제(학생 없는 새 반 + 세트·기본값)와 학습 일정(학습할 날). `node scripts/cards-flow-check.mjs clone`
async function cloneSection() {
  section('clone a class and plan study days');
  const given = await distribute({dueAt: iso(2 * 24 * HOUR)}), base = given.id;
  refused(await call(teacher, 'PATCH', ['distributions', base], {planDate: '2026-02-30'}), 400, undefined, 'a day that does not exist is refused');
  const planned = await call(teacher, 'PATCH', ['distributions', base], {planDate: '2027-03-04'});
  same([planned.status, planned.data.distribution?.planDate], [200, '2027-03-04'], 'the teacher sets a study day');
  const listed = (await call(teacher, 'GET', ['distributions'], undefined, {query: '?classId=class-a'})).data.distributions.find(row => row.id === base);
  same(listed?.planDate, '2027-03-04', 'the class list carries the study day');
  const studentRow = (await call(pupil(1), 'GET', ['student'])).data.distributions.find(row => row.id === base);
  same(studentRow?.planDate, '2027-03-04', 'the student list carries the study day for the agenda');
  refused(await call(pupil(1), 'PATCH', ['distributions', base], {planDate: null}), 403, 'FORBIDDEN', 'a student cannot plan');
  refused(await call(stranger, 'POST', ['classes', 'class-a', 'clone'], {name: '복제', requestId: 'cl-x'}), 404, 'NOT_FOUND', 'another teacher cannot clone the class');
  refused(await call(pupil(1), 'POST', ['classes', 'class-a', 'clone'], {name: '복제', requestId: 'cl-y'}), 403, 'FORBIDDEN', 'a student cannot clone');
  const input = {name: '5-1', year: 2027, distributionIds: [base], settings: true, keepDue: true, requestId: 'cl-run'};
  const made = await call(teacher, 'POST', ['classes', 'class-a', 'clone'], input);
  check(made.status === 201 && !!made.data.classId && made.data.result.distributions === 1, 'the clone makes a class and places the set', made.data);
  const cls = (await db().doc(`classes/${made.data.classId}`).get()).data();
  same([cls.ownerUid, cls.name, cls.year, cls.studentCount, cls.clonedFrom], [teacher, '5-1', 2027, 0, 'class-a'], 'the new class is the teacher\'s, empty, and says where it came from');
  const placed = (await db().collection('cardClassSets').where('classId', '==', made.data.classId).get()).docs.map(doc => doc.data());
  same([placed.length, placed[0]?.allStudents, placed[0]?.targetStudentIds, placed[0]?.planDate, placed[0]?.dueAt], [1, true, [], '2027-03-04', given.dueAt], 'the set reaches every student who joins later; kept dates stay');
  const again = await call(teacher, 'POST', ['classes', 'class-a', 'clone'], input);
  same([again.data.classId, again.data.result?.created, (await db().collection('classes').where('clonedFrom', '==', 'class-a').get()).size], [made.data.classId, 0, 1], 'a retry makes no second class and no second set');
  await db().doc(`classes/${made.data.classId}/students/s41`).set({name: '새 학생', number: 1, authUid: 'u41'});
  await db().doc('users/u41').set({role: 'student', classId: made.data.classId, studentId: 's41', authVersion: 0});
  same((await call('u41:0', 'GET', ['student'])).data.distributions?.length, 1, 'a student added afterwards sees the cloned set');
  same((await callClassroomTool('list_card_sets', {distribution_id: base}, bearerOf(teacher))).card_sets[0].plan_date, '2027-03-04', 'Berry reads the study day');
}
sections.clone = cloneSection;
// 구역 sharing: 동료 공유. 공유한 폴더의 '공유' 세트만 보이고, 복제 허용일 때만 복사되며, 이메일을 지우면 바로 못 본다. `node scripts/cards-flow-check.mjs sharing`
async function sharingSection() {
  section('share a folder with colleagues, search and copy');
  const colleague = 'teacher-c', email = `${colleague}@demo.test`;
  await db().doc(`users/${colleague}`).set({role: 'teacher'});
  const folder = (await call(teacher, 'POST', ['folders'], {name: '3학년 공유'})).data.folder;
  const made = await call(teacher, 'POST', ['sets'], {title: '공유 점검 단어', description: '교과서 3과', type: 'word', folderId: folder.id, cards, requestId: 'sh-set'});
  const setIdShared = made.data.set.id;
  same((await call(teacher, 'GET', ['sets', setIdShared])).data.set.sharing, {visibility: 'private', allowCopy: false}, 'a new set is private');
  refused(await call(stranger, 'PATCH', ['folders', folder.id, 'share'], {members: email}), 404, 'NOT_FOUND', 'only the owner shares the folder');
  refused(await call(pupil(1), 'GET', ['shared']), 403, 'FORBIDDEN', 'students have no shared library');
  refused(await call(teacher, 'PATCH', ['folders', folder.id, 'share'], {members: 'not-an-email'}), 400, 'SHARE_MEMBERS', 'a broken email is refused');
  const shared = await call(teacher, 'PATCH', ['folders', folder.id, 'share'], {members: `${email.toUpperCase()}\n${teacher}@demo.test`});
  same([shared.data.members, shared.data.sharedSets], [[email], 0], 'the colleague is listed (lower-cased, owner left out); no set is visible yet');
  const before = await call(colleague, 'GET', ['shared']);
  same(before.data.folders?.map(row => [row.name, row.sets]), [['3학년 공유', 0]], 'the colleague sees the folder but not the private set');
  refused(await call(colleague, 'GET', ['shared', 'sets', setIdShared]), 404, 'NOT_FOUND', 'a private set cannot be opened');
  accepted(await call(teacher, 'PATCH', ['sets', setIdShared], {action: 'share', visibility: 'shared', allowCopy: false}), 'the owner shares the set, view only');
  same((await call(colleague, 'GET', ['shared'], undefined, {query: `?q=${encodeURIComponent('교과서 단어')}`})).data.sets?.map(row => [row.id, row.allowCopy]), [[setIdShared, false]], 'search finds it within the shared scope');
  same((await call(colleague, 'GET', ['shared'], undefined, {query: '?q=수학'})).data.sets, [], 'search finds nothing that is not there');
  const opened = await call(colleague, 'GET', ['shared', 'sets', setIdShared]);
  same([opened.status, opened.data.set?.cards.length, opened.data.set?.ownerName], [200, cards.length, teacher], 'the colleague previews the cards');
  refused(await call(colleague, 'POST', ['shared', 'sets', setIdShared, 'copy'], {requestId: 'sh-copy-0'}), 403, 'COPY_NOT_ALLOWED', 'no copy without the owner\'s permission');
  refused(await call(stranger, 'GET', ['shared', 'sets', setIdShared]), 404, 'NOT_FOUND', 'a teacher who is not listed cannot open it');
  accepted(await call(teacher, 'PATCH', ['sets', setIdShared], {action: 'share', visibility: 'shared', allowCopy: true}), 'the owner allows copies');
  const copied = await call(colleague, 'POST', ['shared', 'sets', setIdShared, 'copy'], {requestId: 'sh-copy-1'});
  check(copied.status === 201 && copied.data.set.copiedFrom?.setId === setIdShared && copied.data.set.folderId === null, 'the colleague copies it into their own sets', copied.data);
  const mine = (await call(colleague, 'GET', ['sets', copied.data.set.id])).data.set;
  check(mine.cards.length === cards.length && mine.cards.every(card => !cards.some(source => source.id === card.id)) && mine.copiedFrom?.ownerName === teacher, 'the copy has its own card IDs and says where it came from', mine.copiedFrom);
  same((await call(colleague, 'POST', ['shared', 'sets', setIdShared, 'copy'], {requestId: 'sh-copy-1'})).data.set?.id, copied.data.set.id, 'a retry returns the same copy');
  refused(await call(teacher, 'GET', ['sets', copied.data.set.id]), 404, 'NOT_FOUND', 'the owner cannot open the colleague\'s copy');
  same((await callClassroomTool('list_card_sets', {}, bearerOf(teacher))).sharing, {shared_folders: 1, colleagues: 1, shared_sets: 1, copied_sets: 0}, 'Berry reads sharing as counts');
  accepted(await call(teacher, 'PATCH', ['folders', folder.id, 'share'], {members: ''}), 'the owner stops sharing');
  refused(await call(colleague, 'GET', ['shared', 'sets', setIdShared]), 404, 'NOT_FOUND', 'the colleague loses access at once');
  same((await call(colleague, 'GET', ['sets', copied.data.set.id])).status, 200, 'a copy already made stays with the colleague');
}
sections.sharing = sharingSection;
// The emulator evaluates firestore.rules for a request carrying an unsigned ID token; this reads one document as a web client would.
async function rulesRead(uid, docPath, claims = {}) {
  const part = value => Buffer.from(JSON.stringify(value)).toString('base64url'), at = Math.floor(Date.now() / 1000);
  const token = `${part({alg: 'none', typ: 'JWT'})}.${part({iss: `https://securetoken.google.com/${projectId}`, aud: projectId, sub: uid, user_id: uid, auth_time: at, iat: at, exp: at + 3600, firebase: {sign_in_provider: 'custom'}, ...claims})}.`;
  return (await fetch(`http://${host}/v1/projects/${projectId}/databases/(default)/documents/${docPath}`, {headers: {Authorization: `Bearer ${token}`}})).status;
}
const roomCall = async () => {
  const {handleRoomRequest} = await import('@/modules/playground/rooms-server');
  return (ctx, method, segments, data = {}) => handleRoomRequest(new Request(`http://cards.test/api/playground/${segments.join('/')}`, {method}), ctx, segments, data);
};
const roomRefused = async (run, status) => {try {await run(); return null;} catch (error) {return error.status === status ? true : error.message;}};
const studentCtx = (n, classId) => ({uid: `u${n}`, email: null, displayName: null, role: 'student', classId, studentId: `s${n}`, authVersion: 0});
const hostCtx = {uid: teacher, email: null, displayName: null, role: 'teacher'};
async function versusStudent(n, classId, name) {
  await db().doc(`classes/${classId}/students/s${n}`).set({name, number: n, authUid: `u${n}`, character: 'cat', wardrobeOwned: [], spaceOwned: []});
  await db().doc(`users/u${n}`).set({role: 'student', classId, studentId: `s${n}`, authVersion: 0});
}
// 구역 versus: 반대항전. 같은 선생님의 두 반이 한 방 코드로 들어오고, 반마다 한 팀(반 평균)이며 다른 선생님 반은 고를 수 없다. `node scripts/cards-flow-check.mjs versus`
async function versusSection() {
  section('class vs class card room');
  const room = await roomCall();
  await db().doc('classes/class-v2').set({ownerUid: teacher, name: '3-5', grade: 3});
  for (const n of [1, 2]) await db().doc(`classes/class-a/students/s${n}`).update({character: 'cat', wardrobeOwned: [], spaceOwned: []});
  await versusStudent(51, 'class-v2', '오반'); await versusStudent(52, 'class-v2', '오반둘');
  same(await roomRefused(() => room(hostCtx, 'POST', ['rooms'], {mode: 'team', classId: 'class-a', versusClassIds: ['class-b'], direction: 'front-back', rounds: 1, seconds: 10, cardSetId: setId, requestId: 'vs-x'}), 403), true, 'another teacher\'s class cannot join a versus room');
  same(await roomRefused(() => room(hostCtx, 'POST', ['rooms'], {mode: 'team', classId: 'class-a', versusClassIds: Array.from({length: 6}, (_, i) => `c${i}`), direction: 'front-back', rounds: 1, seconds: 10, cardSetId: setId, requestId: 'vs-y'}), 400), true, 'seven classes are too many');
  const opened = await room(hostCtx, 'POST', ['rooms'], {mode: 'team', classId: 'class-a', versusClassIds: ['class-v2'], direction: 'front-back', rounds: 1, seconds: 10, cardSetId: setId, requestId: 'vs-1'}), roomId = opened.roomId;
  const made = (await db().doc(`playRooms/${roomId}`).get()).data();
  same([made.classIds, made.classNames, made.teamCount], [['class-a', 'class-v2'], ['3-2', '3-5'], 2], 'the room lists both classes, one team each');
  same([(await db().doc(`classes/class-a/playRoomCodes/${opened.code}`).get()).exists, (await db().doc(`classes/class-v2/playRoomCodes/${opened.code}`).get()).exists], [true, true], 'the code works in both classes');
  for (const [n, classId] of [[1, 'class-a'], [2, 'class-a'], [51, 'class-v2'], [52, 'class-v2']]) await room(studentCtx(n, classId), 'POST', ['rooms', 'join'], {code: opened.code});
  const players = Object.fromEntries((await db().collection(`playRooms/${roomId}/players`).get()).docs.map(doc => [doc.id, [doc.data().team, doc.data().classId]]));
  same(players, {s1: [0, 'class-a'], s2: [0, 'class-a'], s51: [1, 'class-v2'], s52: [1, 'class-v2']}, 'each student lands on their class team');
  same(await roomRefused(() => room(studentCtx(9, 'class-b'), 'POST', ['rooms', 'join'], {code: opened.code}), 404), true, 'a student of a class outside the room cannot join');
  same(await rulesRead('u1', `playRooms/${roomId}`, {authVersion: 0}), 200, 'firestore.rules let a student of the host class read the room');
  same(await rulesRead('u51', `playRooms/${roomId}`, {authVersion: 0}), 200, 'firestore.rules let a student of the second class read the room (rules change)');
  same(await rulesRead('u9', `playRooms/${roomId}`, {authVersion: 0}), 403, 'firestore.rules still refuse a student outside the room');
  await room(hostCtx, 'POST', ['rooms', roomId, 'start'], {status: 'lobby', round: -1});
  same((await db().doc(`playRooms/${roomId}`).get()).data().teams.map(team => team.name), ['3-2', '3-5'], 'teams carry the class names');
  await new Promise(resolve => setTimeout(resolve, 3100));
  await room(hostCtx, 'POST', ['rooms', roomId, 'tick']);
  const asked = (await db().doc(`playRooms/${roomId}/rounds/0`).get()).data(), secret = (await db().doc(`playRooms/${roomId}/secrets/0`).get()).data().item;
  const right = asked.choices.find(choice => secret.answers.includes(choice.label)), wrong = asked.choices.find(choice => !secret.answers.includes(choice.label));
  for (const [n, classId, choice] of [[1, 'class-a', right], [2, 'class-a', wrong], [51, 'class-v2', right], [52, 'class-v2', right]]) await room(studentCtx(n, classId), 'POST', ['rooms', roomId, 'answer'], {round: 0, choiceId: choice.id});
  await room(hostCtx, 'POST', ['rooms', roomId, 'tick']);
  const revealed = (await db().doc(`playRooms/${roomId}`).get()).data();
  check(revealed.teams[1].score > revealed.teams[0].score && revealed.teams.every(team => team.count === 2), 'the class with more right answers leads on its average', revealed.teams);
  await room(hostCtx, 'POST', ['rooms', roomId, 'next'], {status: 'reveal', round: 0});
  same((await room(studentCtx(51, 'class-v2'), 'GET', ['rooms', roomId])).room.status, 'finished', 'a student of the second class sees the result');
  same(await roomRefused(() => room(hostCtx, 'POST', ['rooms', roomId, 'reward'], {amount: 1}), 403), true, 'a versus room pays no team reward');
}
sections.versus = versusSection;
// 구역 hunt: 먼저 쓰기. 직접 쓴 답을 카드 학습 채점(대체 정답 포함)으로 보고, 가장 먼저 맞힌 학생만 점수를 받으며 한 문제 세 번까지다. `node scripts/cards-flow-check.mjs hunt`
async function huntSection() {
  section('first-to-type card room');
  const room = await roomCall();
  for (const n of [1, 2]) await db().doc(`classes/class-a/students/s${n}`).update({character: 'cat', wardrobeOwned: [], spaceOwned: []});
  same(await roomRefused(() => room(hostCtx, 'POST', ['rooms'], {mode: 'team', classId: 'class-a', answer: 'shout', direction: 'front-back', rounds: 1, seconds: 10, teamCount: 2, cardSetId: setId, requestId: 'hunt-x'}), 400), true, 'an unknown answer mode is refused');
  const opened = await room(hostCtx, 'POST', ['rooms'], {mode: 'team', classId: 'class-a', answer: 'typed', direction: 'front-back', rounds: 2, seconds: 30, teamCount: 2, cardSetId: setId, requestId: 'hunt-1'}), roomId = opened.roomId;
  same((await db().doc(`playRooms/${roomId}`).get()).data().cards.answer, 'typed', 'the room is a first-to-type room');
  for (const n of [1, 2]) await room(studentCtx(n, 'class-a'), 'POST', ['rooms', 'join'], {code: opened.code});
  await room(hostCtx, 'POST', ['rooms', roomId, 'start'], {status: 'lobby', round: -1});
  await new Promise(resolve => setTimeout(resolve, 3100));
  await room(hostCtx, 'POST', ['rooms', roomId, 'tick']);
  const asked = (await db().doc(`playRooms/${roomId}/rounds/0`).get()).data(), secret = (await db().doc(`playRooms/${roomId}/secrets/0`).get()).data();
  same([asked.choices, typeof asked.prompt], [[], 'string'], 'the public round has a prompt and no choices');
  check(!JSON.stringify(asked).includes(secret.card.back), 'the public round does not carry the answer');
  same(await roomRefused(() => room(studentCtx(1, 'class-a'), 'POST', ['rooms', roomId, 'answer'], {round: 0, choiceId: 'c_x'}), 400), true, 'a choice answer is refused in a typed room');
  const miss = await room(studentCtx(1, 'class-a'), 'POST', ['rooms', roomId, 'type'], {round: 0, text: '모르겠어요'});
  same([miss.correct, miss.triesLeft], [false, 2], 'a wrong answer leaves two tries');
  const answer = secret.card.alternatives[0] ?? secret.card.back;
  const hit = await room(studentCtx(2, 'class-a'), 'POST', ['rooms', roomId, 'type'], {round: 0, text: ` ${answer.toUpperCase()} `});
  same([hit.correct, hit.first], [true, true], 'the first right answer wins (graded like card study: spacing, case, alternatives)');
  const revealed = (await db().doc(`playRooms/${roomId}`).get()).data();
  same(revealed.status, 'reveal', 'the question reveals at once');
  const results = (await db().doc(`playRooms/${roomId}/rounds/0`).get()).data().results;
  same(results.map(row => [row.key, row.points]).sort(), [['s1', 0], ['s2', 1000]], 'only the winner scores');
  same(await roomRefused(() => room(studentCtx(1, 'class-a'), 'POST', ['rooms', roomId, 'type'], {round: 0, text: answer}), 409), true, 'a late right answer does not score');
  await room(hostCtx, 'POST', ['rooms', roomId, 'next'], {status: 'reveal', round: 0});
  for (let i = 0; i < 3; i++) await room(studentCtx(1, 'class-a'), 'POST', ['rooms', roomId, 'type'], {round: 1, text: `틀림${i}`});
  same(await roomRefused(() => room(studentCtx(1, 'class-a'), 'POST', ['rooms', roomId, 'type'], {round: 1, text: 'again'}), 409), true, 'three tries a question');
  for (let i = 0; i < 3; i++) await room(studentCtx(2, 'class-a'), 'POST', ['rooms', roomId, 'type'], {round: 1, text: `틀림${i}`});
  await room(hostCtx, 'POST', ['rooms', roomId, 'tick']);
  const second = (await db().doc(`playRooms/${roomId}/rounds/1`).get()).data();
  same([(await db().doc(`playRooms/${roomId}`).get()).data().status, second.results.every(row => row.points === 0)], ['reveal', true], 'when everyone is out of tries the question reveals with no winner');
  await room(hostCtx, 'POST', ['rooms', roomId, 'next'], {status: 'reveal', round: 1});
  same((await room(hostCtx, 'GET', ['rooms', roomId, 'review'])).review, [], 'typed rounds stay out of the choice review');
}
sections.hunt = huntSection;
const chosen = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(sections);
await seed();
await makeSet();
for (const name of chosen) {
  try {await sections[name]();} catch (error) {failures.push(`${name} crashed: ${error.stack}`); console.log(`  CRASH ${error.stack}`);}
}
console.log(`\n${passed} passed, ${failures.length} failed`);
for (const failure of failures) console.log(` - ${failure}`);
process.exit(failures.length ? 1 : 0);
