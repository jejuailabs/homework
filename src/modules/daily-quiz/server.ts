import 'server-only';
import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {db} from '@/lib/server/admin';
import {assertOrigin, getContext} from '@/lib/server/auth';
import {ApiError, id, isAdmin} from '@/lib/server/policy';
import {checkQuizAnswer, DAILY_REWARD_HALF_UNITS, generateQuizPack, generateQuizReview, nextQuizSkill, publicQuizSession, QuizError, quizAddDays, quizPackId, quizRanking, quizScope, quizWeekStart, QUIZ_VERSION, seoulQuizDate, validQuizCronSecret} from './engine';
import {quizLearners, quizModes, type QuizLabState, type QuizMode, type QuizPack, type QuizScope, type QuizSession, type QuizSkill, type QuizSubject, type QuizWalletRow, type Understanding} from './types';

type Input = Record<string, unknown>;
const json = (value: unknown, status = 200) => NextResponse.json(value, {status, headers: {'Cache-Control': 'private, no-store'}});
const packRef = (scope: QuizScope, subject: QuizSubject) => db().doc(`dailyQuizPacks/${quizPackId(scope, subject)}`);
const learnerRef = (uid: string, scope: QuizScope, learner: string) => db().doc(`dailyQuizLabs/${uid}/learners/g${scope.grade}_s${scope.semester}_${learner}`);
const sessionId = (scope: QuizScope, mode: QuizMode) => `${QUIZ_VERSION}_${scope.date}_${mode}`;
const modeFor = (value: unknown): QuizMode => {if (!quizModes.includes(value as QuizMode)) throw new QuizError('학습 종류를 확인해 주세요.'); return value as QuizMode;};
const learnerFor = (value: unknown) => {if (!quizLearners.some(learner => learner.id === value)) throw new QuizError('연습 학생을 선택해 주세요.'); return value as string;};
async function input(request: Request): Promise<Input> {
  const raw = await request.text(); if (Buffer.byteLength(raw) > 10000) throw new QuizError('입력 내용이 너무 커요.');
  try {const data = JSON.parse(raw); if (data && typeof data === 'object' && !Array.isArray(data)) return data;} catch {}
  throw new QuizError('입력 내용을 확인해 주세요.');
}
async function ensurePack(scope: QuizScope, subject: QuizSubject) {
  const ref = packRef(scope, subject), previous = await ref.get();
  if (previous.exists) return {pack: previous.data() as QuizPack, created: false};
  const pack = generateQuizPack(scope, subject);
  try {await ref.create({...pack, createdAt: new Date().toISOString()}); return {pack, created: true};}
  catch (error) {if ((error as {code?: number}).code !== 6) throw error; return {pack: (await ref.get()).data() as QuizPack, created: false};}
}
export async function prepareQuizDays(date: string, scopes: {grade: number; semester: number}[], source: string) {
  let created = 0, existing = 0;
  // Bound concurrency to one grade/semester at a time, and 14 immutable packs.
  for (const value of scopes) {
    const outcomes = await Promise.all(Array.from({length: 7}, (_, i) => quizAddDays(date, i)).flatMap(date => (['english', 'math'] as const).map(subject => ensurePack(quizScope({...value, date}), subject))));
    created += outcomes.filter(item => item.created).length; existing += outcomes.filter(item => !item.created).length;
  }
  const result = {at: new Date().toISOString(), date, created, existing, source};
  await db().doc('dailyQuizOperations/latest').set(result); return result;
}
async function state(uid: string, data: Input): Promise<QuizLabState> {
  const scope = quizScope(data), learnerId = learnerFor(data.learnerId), ref = learnerRef(uid, scope, learnerId), weekStart = quizWeekStart(scope.date);
  const dates = Array.from({length: 7}, (_, i) => quizAddDays(scope.date, i));
  const [learner, sessionDocs, skills, ledger, ranks, packs, operation] = await Promise.all([
    ref.get(), db().getAll(...quizModes.map(mode => ref.collection('sessions').doc(sessionId(scope, mode)))), ref.collection('skills').get(), ref.collection('ledger').orderBy('createdAt', 'desc').limit(30).get(),
    Promise.all(quizLearners.map(async learner => {
      const sessions = await learnerRef(uid, scope, learner.id).collection('sessions').where('date', '>=', weekStart).where('date', '<=', quizAddDays(weekStart, 6)).get();
      return {id: learner.id, name: learner.name, sessions: sessions.docs.map(doc => doc.data() as QuizSession)};
    })),
    db().getAll(...dates.flatMap(date => (['english', 'math'] as const).map(subject => packRef({...scope, date}, subject)))), db().doc('dailyQuizOperations/latest').get(),
  ]);
  const skillRows = skills.docs.map(doc => doc.data() as QuizSkill).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  return {...scope, today: seoulQuizDate(), weekStart, learners: quizLearners, learnerId, walletHalfUnits: learner.data()?.walletHalfUnits || 0, ledger: ledger.docs.map(doc => ({id: doc.id, ...doc.data()}) as QuizWalletRow), skills: skillRows, dueCount: skillRows.filter(skill => skill.dueDate <= scope.date && skill.lastDate < scope.date).length,
    sessions: Object.fromEntries(sessionDocs.filter(doc => doc.exists).map(doc => {const session = doc.data() as QuizSession; return [session.mode, publicQuizSession(session)];})), ranking: quizRanking(ranks),
    prepared: dates.map((date, i) => ({date, english: packs[i * 2].exists, math: packs[i * 2 + 1].exists})), schedulerConfigured: validQuizCronSecret(process.env.CRON_SECRET), lastPreparation: operation.exists ? operation.data() as QuizLabState['lastPreparation'] : null};
}
async function start(uid: string, data: Input) {
  const scope = quizScope(data), learnerId = learnerFor(data.learnerId), mode = modeFor(data.mode), ref = learnerRef(uid, scope, learnerId), sessionRef = ref.collection('sessions').doc(sessionId(scope, mode));
  const pack = mode === 'review' ? null : (await ensurePack(scope, mode)).pack;
  const session = await db().runTransaction(async tx => {
    const [previous, pupil, skills] = await Promise.all([tx.get(sessionRef), tx.get(ref), mode === 'review' ? tx.get(ref.collection('skills')) : Promise.resolve(null)]);
    if (previous.exists) return previous.data() as QuizSession;
    const questions = pack?.questions || generateQuizReview(scope, learnerId, skills!.docs.map(doc => doc.data() as QuizSkill));
    if (!questions.length) throw new QuizError('이 날짜에 예정된 복습이 없어요. 데일리를 푼 뒤 다음 날로 이동해 보세요.', 'QUIZ_NO_REVIEW', 409);
    const session: QuizSession = {...scope, id: sessionRef.id, mode, questions, answers: {}, completed: false, createdAt: new Date().toISOString()};
    tx.create(sessionRef, session);
    if (!pupil.exists) tx.create(ref, {grade: scope.grade, semester: scope.semester, name: quizLearners.find(learner => learner.id === learnerId)!.name, walletHalfUnits: 0, earnedHalfUnits: 0});
    return session;
  });
  return {session: publicQuizSession(session)};
}
async function answer(uid: string, data: Input) {
  const scope = quizScope(data), learnerId = learnerFor(data.learnerId), mode = modeFor(data.mode), ref = learnerRef(uid, scope, learnerId).collection('sessions').doc(sessionId(scope, mode)), questionId = id(data.questionId);
  const session = await db().runTransaction(async tx => {
    const snapshot = await tx.get(ref); if (!snapshot.exists) throw new QuizError('학습을 먼저 시작해 주세요.', 'QUIZ_SESSION', 409);
    const session = snapshot.data() as QuizSession, question = session.questions.find(question => question.id === questionId);
    if (!question) throw new QuizError('이 회차의 문제를 선택해 주세요.');
    const result = checkQuizAnswer(question, data.answer), previous = session.answers[questionId];
    if (previous) {
      if (previous.answer !== result.answer) throw new QuizError('처음 제출한 답은 변경할 수 없어요.', 'QUIZ_ANSWER_LOCKED', 409);
      return session;
    }
    session.answers[questionId] = {...result, understanding: null, submittedAt: new Date().toISOString()};
    tx.update(ref, {answers: session.answers}); return session;
  });
  return {session: publicQuizSession(session)};
}
async function understanding(uid: string, data: Input) {
  const scope = quizScope(data), learnerId = learnerFor(data.learnerId), mode = modeFor(data.mode), ref = learnerRef(uid, scope, learnerId), sessionRef = ref.collection('sessions').doc(sessionId(scope, mode)), questionId = id(data.questionId);
  if (!['known', 'unsure', 'unknown'].includes(data.understanding as string)) throw new QuizError('이해도를 선택해 주세요.');
  const result = await db().runTransaction(async tx => {
    const snapshot = await tx.get(sessionRef); if (!snapshot.exists) throw new QuizError('학습을 먼저 시작해 주세요.', 'QUIZ_SESSION', 409);
    const session = snapshot.data() as QuizSession, question = session.questions.find(question => question.id === questionId), answer = session.answers[questionId];
    if (!question || !answer) throw new QuizError('답을 제출하고 해설을 먼저 확인해 주세요.', 'QUIZ_PHASE', 409);
    const skillRef = ref.collection('skills').doc(question.skillId), receipt = ref.collection('ledger').doc(mode === 'review' ? `${session.id}_${questionId}` : session.id);
    const [pupil, skillDoc, paid] = await Promise.all([tx.get(ref), tx.get(skillRef), tx.get(receipt)]);
    if (!pupil.exists) throw new QuizError('연습 학생을 찾을 수 없어요.', 'QUIZ_SESSION', 409);
    if (answer.understanding) return {session: publicQuizSession(session), rewardedHalfUnits: 0, walletHalfUnits: pupil.data()!.walletHalfUnits};
    answer.understanding = data.understanding as Understanding; answer.completedAt = new Date().toISOString();
    const previous = skillDoc.exists ? skillDoc.data() as QuizSkill : undefined;
    // Moving the lab clock backwards must not overwrite a later learning record.
    const next = previous && previous.lastDate > scope.date ? previous : nextQuizSkill(question, answer, scope.date, previous);
    answer.nextDue = next.dueDate;
    session.completed = session.questions.every(question => !!session.answers[question.id]?.understanding);
    const reward = paid.exists ? 0 : mode === 'review' ? 1 : session.completed ? DAILY_REWARD_HALF_UNITS : 0;
    const walletHalfUnits = pupil.data()!.walletHalfUnits + reward;
    if (!Number.isSafeInteger(walletHalfUnits)) throw new QuizError('시험용 잔액을 확인해 주세요.', 'QUIZ_BALANCE', 409);
    tx.update(sessionRef, {answers: session.answers, completed: session.completed});
    tx.set(skillRef, next);
    if (reward) {
      tx.update(ref, {walletHalfUnits, earnedHalfUnits: (pupil.data()!.earnedHalfUnits || 0) + reward});
      tx.create(receipt, {date: scope.date, reason: mode === 'review' ? `복습 완료 · ${question.skillLabel}` : `${mode === 'english' ? '영어' : '연산'} 데일리 10문제 완료`, halfUnits: reward, balanceHalfUnits: walletHalfUnits, createdAt: answer.completedAt});
    }
    return {session: publicQuizSession(session), rewardedHalfUnits: reward, walletHalfUnits};
  });
  return result;
}
export async function handleQuizLab(request: Request, segments: string[]) {
  try {
    const ctx = await getContext(request); if (!isAdmin(ctx.role)) throw new ApiError(403, '관리자만 실험실을 사용할 수 있어요.', 'FORBIDDEN');
    if (request.method !== 'GET') assertOrigin(request);
    const path = segments.join('/');
    if (request.method === 'GET') {
      const params = Object.fromEntries(new URL(request.url).searchParams);
      if (path === 'state' || path === '') return json(await state(ctx.uid, params));
      if (path === 'preview') {
        const scope = quizScope(params), mode = modeFor(params.mode); if (mode === 'review') throw new QuizError('공통 데일리 과목을 선택해 주세요.');
        const doc = await packRef(scope, mode).get(); return json({pack: doc.exists ? doc.data() : generateQuizPack(scope, mode), persisted: doc.exists});
      }
    }
    if (request.method === 'POST') {
      const data = await input(request);
      if (path === 'prepare') {const scope = quizScope(data); return json(await prepareQuizDays(scope.date, [scope], `admin:${ctx.uid}`));}
      if (path === 'start') return json(await start(ctx.uid, data));
      if (path === 'answer') return json(await answer(ctx.uid, data));
      if (path === 'understanding') return json(await understanding(ctx.uid, data));
    }
    throw new ApiError(404, '요청한 기능을 찾을 수 없어요.', 'NOT_FOUND');
  } catch (error) {
    if (error instanceof QuizError || error instanceof ApiError) return json({error: error.message, code: error.code}, error.status);
    console.error('Daily quiz operation failed', (error as {code?: string}).code || 'INTERNAL');
    return json({error: '처리하지 못했어요. 다시 시도해 주세요.', code: 'INTERNAL_ERROR'}, 500);
  }
}
export async function handleQuizCron(request: Request) {
  const secret = process.env.CRON_SECRET, value = request.headers.get('authorization') || '';
  if (!validQuizCronSecret(secret)) return json({error: '예약 작업 인증 설정이 필요해요.'}, 503);
  const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(value);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return json({error: '인증이 필요해요.'}, 401);
  try {
    const date = quizAddDays(seoulQuizDate(), 1), scopes = Array.from({length: 6}, (_, i) => [1, 2].map(semester => ({grade: i + 1, semester}))).flat();
    return json(await prepareQuizDays(date, scopes, 'cron'));
  } catch (error) {
    console.error('Daily quiz preparation failed', (error as {code?: string}).code || 'INTERNAL');
    return json({error: '문제 준비에 실패했어요. 기존 문제는 보존돼요.'}, 500);
  }
}
