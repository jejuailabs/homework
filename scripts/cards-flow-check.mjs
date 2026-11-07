// 카드놀이 서버 통합 점검. 실제 handleCards·auth·lesson-reports 코드를 Firestore 에뮬레이터에 돌린다.
// 가짜인 것: 세션 쿠키 검증과 Auth 사용자 조회(firebase-admin/auth), OpenAI 호출(fetch). 나머지는 운영과 같은 코드다.
// 실행: java -Duser.language=en -Duser.country=US -jar <cloud-firestore-emulator>.jar --host 127.0.0.1 --port 8080 --rules firestore.rules --project_id demo-homework
//       FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/cards-flow-check.mjs [구역 이름...]
// 구역: study edited tests deadline patch old ai. 운영 Firebase에는 절대 닿지 않도록 에뮬레이터 주소가 아니면 바로 멈춘다.
import {registerHooks} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import ts from 'typescript';

const host = process.env.FIRESTORE_EMULATOR_HOST || '';
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('FIRESTORE_EMULATOR_HOST must point at a local emulator.');
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON; delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
const projectId = 'demo-homework';
Object.assign(process.env, {FIREBASE_PROJECT_ID: projectId, GCLOUD_PROJECT: projectId, NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId, AUTH_CONTEXT_CACHE_MS: '0', OPENAI_API_KEY: 'stub-not-a-key', OPENAI_MODEL: 'stub-model'});
delete process.env.AI_REQUEST_LIMITS;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), src = path.join(root, 'src');
const candidates = base => [base, `${base}.ts`, path.join(base, 'index.ts')].find(file => fs.existsSync(file) && fs.statSync(file).isFile());
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return {url: 'data:text/javascript,', shortCircuit: true};
    if (specifier === 'firebase-admin/auth') return {url: 'data:text/javascript,export const getAuth = () => globalThis.__fakeAuth;', shortCircuit: true};
    if (specifier === 'firebase-admin/storage') return {url: 'data:text/javascript,export const getStorage = () => null;', shortCircuit: true};
    if (specifier === 'next/server') return {url: 'data:text/javascript,export const NextResponse = {json: (value, init) => Response.json(value, init)};', shortCircuit: true};
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
  await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {method: 'DELETE'});
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
  same(teacherRow.progress.latestScore, 0, 'report shows the blank attempt');
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
  check((await call(pupil(1), 'GET', ['distributions', lock.id])).status === 200, 'lock: students can still read the set');
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
  accepted(await call(teacher, 'PATCH', ['distributions', narrow.id], {allStudents: false}), 'teacher narrows it again');
  refused(await call(pupil(2), 'GET', ['distributions', narrow.id]), 404, 'NOT_FOUND', 'closed again for others');
  accepted(await call(teacher, 'PATCH', ['distributions', narrow.id], {active: false}), 'teacher closes it');
  refused(await call(pupil(1), 'GET', ['distributions', narrow.id]), 404, 'NOT_FOUND', 'a closed set is hidden from its target');
  await addStudent(3); await db().doc('classes/class-a/students/s4').update({disabled: false});
}

async function oldSection() {
  section('old documents');
  const stamp = iso(-30 * 24 * HOUR), classId = 'class-old', snapshot = {title: '예전 세트', description: '', type: 'word', cards: cards.slice(0, 6)};
  await db().doc(`classes/${classId}`).set({ownerUid: teacher, name: '예전 반'});
  await db().doc(`classes/${classId}/students/s7`).set({name: '학생7', number: 7, authUid: 'u7'});
  await db().doc(`classes/${classId}/students/s8`).set({name: '학생8', number: 8, authUid: 'u8'});
  for (const n of [7, 8]) await db().doc(`users/u${n}`).set({role: 'student', classId, studentId: `s${n}`, authVersion: 0});
  const requiredModes = Object.fromEntries(['memorize', 'recall', 'spell'].map(mode => [mode, {requiredCount: 0, direction: 'front-back', rangeStart: 1, rangeEnd: 6}]));
  // No afterDue, allStudents, test.format, test.timeLimitSeconds, as stored before this work.
  await db().doc('cardClassSets/old-dist').set({ownerUid: teacher, classId, className: '예전 반', setId: 'old-set', setVersion: 1, versionId: 'old-set_v1', title: '예전 세트', type: 'word', cardCount: 6, cardIds: snapshot.cards.map(card => card.id), targetStudentIds: ['s7', 's8'], targetStudents: [{id: 's7', name: '학생7', number: 7}, {id: 's8', name: '학생8', number: 8}], targetCount: 2, requiredModes, test: {questionCount: 3, goalScore: 80, maxAttempts: 5, requireStudy: false, direction: 'front-back', answerRelease: 'immediate'}, dueAt: stamp, active: true, snapshot, createdAt: iso(-60 * MIN), updatedAt: stamp});
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
  const saved = await call('u7:0', 'POST', ['distributions', 'old-dist', 'study'], {requestId: 'old-1', mode: 'memorize', direction: 'front-back', responses: right(1)});
  check(saved.status === 200 && saved.data.progress.lateAt === null, 'old progress keeps taking study', saved);
  check(!('lateAt' in saved.data.progress) || saved.data.progress.lateAt === null, 'no late mark from an open-by-default deadline');
  const opened = await start('u7:0', 'old-dist', 'old-2');
  same(opened.data.attempt?.id, 'old-open', 'old open attempt resumes');
  const graded = await submit('u7:0', 'old-dist', 'old-open', [{questionId: 'q1', answer: '뜻 0'}, {questionId: 'q2', answer: '뜻 1'}]);
  check(graded.status === 200 && graded.data.attempt.score === 100, 'an old attempt without a direction grades by the distribution', graded);
  const fresh = await start('u8:0', 'old-dist', 'old-3');
  check(fresh.status === 201 && fresh.data.attempt.questions.every(question => question.choices === undefined) && fresh.data.attempt.timeLimitSeconds === null, 'a new test on an old distribution is written and untimed', fresh);
  const stored = (await db().doc(`cardProgress/old-dist_s8/tests/${fresh.data.attempt.id}`).get()).data();
  same([stored.direction, stored.timeLimitSeconds], ['front-back', null], 'new attempts store the direction and limit');
  accepted(await call(teacher, 'PATCH', ['distributions', 'old-dist'], {afterDue: 'late'}), 'an old distribution takes a PATCH');
  same((await db().doc('cardClassSets/old-dist').get()).data().test.questionCount, 3, 'PATCH leaves the test alone');

  const lesson = (input, cookie = teacher) => lessonReports(new Request('http://cards.test/api/lesson-reports', {method: 'POST', headers: {'content-type': 'application/json', cookie: `__session=${cookie}`}, body: JSON.stringify(input)}), []);
  const seoul = new Date(Date.now() + 9 * HOUR).toISOString().slice(0, 10);
  const response = await lesson({classId, from: seoul, to: seoul, title: '이번 달', teacherNotes: '', requestId: 'lesson-1'}), body = await response.json();
  check(response.status === 201, 'lesson report captures old documents', body);
  check(body.report?.cards?.[0]?.targetCount === 2 && body.report.cards[0].attempts === 2, 'lesson report counts submitted attempts only', body.report?.cards);
  const allSet = await lesson({classId: 'class-a', from: seoul, to: seoul, title: '새 반', teacherNotes: '', requestId: 'lesson-2'}), allBody = await allSet.json();
  check(allSet.status === 201 && allBody.report.cards.length > 0, 'lesson report captures new allStudents distributions', allBody);
  const union = allBody.report?.cards?.find(row => row.targetCount >= 6);
  check(!!union && (await db().collection('cardClassSets').where('classId', '==', 'class-a').get()).docs.some(doc => doc.data().title === union.title), 'lesson report counts allStudents distributions over the class', allBody.report?.cards);
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

const sections = {study: studySection, edited: editedSection, tests: testsSection, deadline: deadlineSection, patch: patchSection, old: oldSection, ai: aiSection};
const chosen = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(sections);
await seed();
await makeSet();
for (const name of chosen) {
  try {await sections[name]();} catch (error) {failures.push(`${name} crashed: ${error.stack}`); console.log(`  CRASH ${error.stack}`);}
}
console.log(`\n${passed} passed, ${failures.length} failed`);
for (const failure of failures) console.log(` - ${failure}`);
process.exit(failures.length ? 1 : 0);
