import 'server-only';
import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {db} from '@/lib/server/admin';
import {assertOrigin, getContext, type Context} from '@/lib/server/auth';
import {ApiError, canManageClass, id} from '@/lib/server/policy';
import {addPointBalance, pointBalance} from '@/lib/server/points-policy';
import {checkQuizAnswer, generatePracticeMathPack, generateQuizReview, nextQuizSkill, publicQuizSession, QuizError, quizScope, quizWeekStart, seoulQuizDate} from './engine';
import {ANNUAL_QUIZ_VERSION, MATH_PRACTICE_VERSION, quizMathProgress, quizCalendar} from './curriculum';
import {ensurePack, input} from './server';
import {quizModes, type QuizLabState, type QuizMode, type QuizScope, type QuizSession, type QuizSkill, type QuizWalletRow, type Understanding} from './types';

const json = (data: unknown, status = 200) => NextResponse.json(data, {status, headers: {'Cache-Control': 'private, no-store'}});
type StudentContext = Context & {classId: string; studentId: string};
type Access = {ctx: StudentContext; scope: QuizScope; day: FirebaseFirestore.DocumentReference; pupil: FirebaseFirestore.DocumentSnapshot; cls: FirebaseFirestore.DocumentSnapshot};
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const yearRef = (access: Access) => access.pupil.ref.collection('dailyQuizYears').doc(String(quizCalendar(access.scope.date).schoolYear));
const sessionRef = (access: Access, mode: QuizMode) => yearRef(access).collection('sessions').doc(`${access.scope.date}_${mode}`);
const mathProgressRef = (access: Access) => yearRef(access).collection('progress').doc(`math_g${access.scope.grade}`);
const scoreRef = (pupil: FirebaseFirestore.DocumentReference, date: string) => pupil.collection('dailyQuizScores').doc(quizWeekStart(date));
function gradeOf(value: unknown) {const grade = Number(value); if (!Number.isInteger(grade) || grade < 1 || grade > 6) throw new QuizError('선생님이 학급의 초등 학년(1~6)을 설정하면 시작할 수 있어요.', 'QUIZ_GRADE', 409); return grade;}
function modeOf(value: unknown) {if (!quizModes.includes(value as QuizMode)) throw new QuizError('학습 종류를 확인해 주세요.'); return value as QuizMode;}
async function accessStudent(ctx: Context, tx?: FirebaseFirestore.Transaction): Promise<Access> {
  if (ctx.role !== 'student' || !ctx.classId || !ctx.studentId) throw new ApiError(403, '학생 화면에서 이용해 주세요.', 'FORBIDDEN');
  const date = seoulQuizDate(), pupilRef = db().doc(`classes/${ctx.classId}/students/${ctx.studentId}`), day = pupilRef.collection('dailyQuizDays').doc(date);
  const refs = [pupilRef, db().doc(`classes/${ctx.classId}`), db().doc(`users/${ctx.uid}`), day];
  const [pupil, cls, user, lock] = await Promise.all(refs.map(ref => tx ? tx.get(ref) : ref.get()));
  if (!cls.exists || !pupil.exists || pupil.data()?.disabled || pupil.data()?.authUid !== ctx.uid || !user.exists || user.data()?.disabled || user.data()?.role !== 'student' || user.data()?.classId !== ctx.classId || user.data()?.studentId !== ctx.studentId || (user.data()?.authVersion ?? 0) !== ctx.authVersion) throw new ApiError(403, '학생 계정을 다시 확인해 주세요.', 'STUDENT_UNAVAILABLE');
  const scope = lock.exists ? quizScope(lock.data()!) : quizScope({grade: gradeOf(cls.data()?.grade), semester: quizCalendar(date).semester, date});
  if (scope.date !== date) throw new QuizError('오늘의 학습을 다시 열어 주세요.', 'QUIZ_DATE', 409);
  return {ctx: ctx as StudentContext, scope, day, pupil, cls};
}
function validateScope(data: Record<string, unknown>, scope: QuizScope) {
  for (const field of ['date', 'grade', 'semester'] as const) if (data[field] !== undefined && String(data[field]) !== String(scope[field])) throw new QuizError('학년이나 날짜가 바뀌었어요. 오늘의 학습을 다시 열어 주세요.', 'QUIZ_DATE', 409);
  if (data.learnerId !== undefined) throw new ApiError(403, '본인의 학습만 이용할 수 있어요.', 'FORBIDDEN');
}
async function ranks(clsId: string, grade: number, date: string) {
  const pupils = await db().collection(`classes/${clsId}/students`).get();
  const active = pupils.docs.filter(doc => !doc.data().disabled);
  if (!active.length) return [];
  const scores = await db().getAll(...active.map(doc => scoreRef(doc.ref, date)));
  const rows = active.map((doc, i) => {
    const score = scores[i].data(), sessions = score?.grade === grade ? Object.values(score.entries || {}) as {correct: number; date: string}[] : [];
    return {id: doc.id, name: doc.data().name as string, score: sessions.reduce((sum, row) => sum + row.correct, 0), correct: sessions.reduce((sum, row) => sum + row.correct, 0), completedDays: new Set(sessions.map(row => row.date)).size, completedSubjects: sessions.length, rank: 0};
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  rows.forEach((row, i) => {row.rank = i && row.score === rows[i - 1].score ? rows[i - 1].rank : i + 1;}); return rows;
}
async function studentState(ctx: Context) {
  const access = await accessStudent(ctx), {scope, pupil, cls} = access, root = yearRef(access);
  const [sessions, skills, ledger, ranking, progress] = await Promise.all([
    db().getAll(...quizModes.map(mode => sessionRef(access, mode))), root.collection(`skills_g${scope.grade}`).get(),
    root.collection('ledger').orderBy('createdAt', 'desc').limit(30).get(), ranks(ctx.classId!, scope.grade, scope.date), mathProgressRef(access).get(),
  ]);
  const skillRows = skills.docs.map(doc => doc.data() as QuizSkill);
  return {...scope, today: scope.date, weekStart: quizWeekStart(scope.date), learners: [{id: ctx.studentId!, name: pupil.data()!.name}], learnerId: ctx.studentId!, className: cls.data()!.name, walletHalfUnits: pointBalance(pupil.data()?.points) * 2,
    ledger: ledger.docs.map(doc => ({id: doc.id, ...doc.data()}) as QuizWalletRow), skills: skillRows, dueCount: skillRows.filter(skill => skill.dueDate <= scope.date && skill.lastDate < scope.date).length,
    mathProgress: quizMathProgress(progress.data()?.completedDays ?? 0), sessions: Object.fromEntries(sessions.filter(doc => doc.exists).map(doc => {const session = doc.data() as QuizSession; return [session.mode, publicQuizSession(session)];})), ranking, prepared: [], schedulerConfigured: false, lastPreparation: null,
  } satisfies QuizLabState & {className: string};
}
async function start(ctx: Context, data: Record<string, unknown>) {
  const initial = await accessStudent(ctx); validateScope(data, initial.scope);
  const mode = modeOf(data.mode), pack = mode === 'english' ? (await ensurePack(initial.scope, mode)).pack : null;
  return db().runTransaction(async tx => {
    const access = await accessStudent(ctx, tx); validateScope(initial.scope, access.scope);
    const ref = sessionRef(access, mode), root = yearRef(access);
    const [existing, skills, progress] = await Promise.all([tx.get(ref), mode === 'review' ? tx.get(root.collection(`skills_g${access.scope.grade}`)) : Promise.resolve(null), mode === 'math' ? tx.get(mathProgressRef(access)) : Promise.resolve(null)]);
    const previous = existing.data() as QuizSession | undefined;
    if (previous && (mode !== 'math' || previous.completed || previous.mathPractice?.version === MATH_PRACTICE_VERSION)) return {session: publicQuizSession(previous)};
    const completedBefore = quizMathProgress(progress?.data()?.completedDays ?? 0).completedDays;
    const questions = mode === 'math' ? generatePracticeMathPack(access.scope, completedBefore).questions : pack?.questions || generateQuizReview(access.scope, ctx.studentId!, skills!.docs.map(doc => doc.data() as QuizSkill));
    if (!questions.length) throw new QuizError('오늘 예정된 복습이 없어요. 데일리를 풀면 다음 복습 일정이 생겨요.', 'QUIZ_NO_REVIEW', 409);
    const session: QuizSession = {...access.scope, id: ref.id, mode, questions, answers: {}, completed: false, createdAt: new Date().toISOString(), ...(mode === 'math' ? {mathPractice: {version: MATH_PRACTICE_VERSION, completedBefore}} : {})};
    // Preserve an unfinished calendar-based attempt; completed sessions and reward IDs never reset.
    if (previous) tx.create(ref.collection('migrations').doc(MATH_PRACTICE_VERSION), previous);
    tx.set(access.day, access.scope); tx.set(ref, session);
    return {session: publicQuizSession(session)};
  });
}
async function study(ctx: Context, data: Record<string, unknown>, phase: 'answer' | 'understanding') {
  const mode = modeOf(data.mode), questionId = id(data.questionId);
  if (phase === 'understanding' && !['known', 'unsure', 'unknown'].includes(data.understanding as string)) throw new QuizError('이해도를 선택해 주세요.');
  return db().runTransaction(async tx => {
    const access = await accessStudent(ctx, tx); validateScope(data, access.scope);
    const ref = sessionRef(access, mode), snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new QuizError('학습을 먼저 시작해 주세요.', 'QUIZ_SESSION', 409);
    const session = snapshot.data() as QuizSession, question = session.questions.find(q => q.id === questionId);
    if (!question) throw new QuizError('이 회차의 문제를 선택해 주세요.');
    const previousAnswer = session.answers[questionId];
    if (phase === 'answer') {
      const checked = checkQuizAnswer(question, data.answer);
      if (previousAnswer && previousAnswer.answer !== checked.answer) throw new QuizError('처음 제출한 답은 변경할 수 없어요.', 'QUIZ_ANSWER_LOCKED', 409);
      if (!previousAnswer) {session.answers[questionId] = {...checked, understanding: null, submittedAt: new Date().toISOString()}; tx.update(ref, {answers: session.answers});}
      return {session: publicQuizSession(session), rewardedHalfUnits: 0};
    }
    if (!previousAnswer) throw new QuizError('답을 제출하고 해설을 먼저 확인해 주세요.', 'QUIZ_PHASE', 409);
    const points = pointBalance(access.pupil.data()?.points);
    if (previousAnswer.understanding) return {session: publicQuizSession(session), rewardedHalfUnits: 0, walletHalfUnits: points * 2};
    const root = yearRef(access), skillRef = root.collection(`skills_g${session.grade}`).doc(question.skillId);
    const receiptId = digest(`${ANNUAL_QUIZ_VERSION}:${quizCalendar(session.date).schoolYear}:${session.id}:${mode === 'review' ? questionId : 'daily'}`);
    const receipt = access.pupil.ref.collection('pointLedger').doc(`quiz_${receiptId}`), score = scoreRef(access.pupil.ref, session.date);
    const [skill, paid, ranking, progress] = await Promise.all([tx.get(skillRef), tx.get(receipt), tx.get(score), mode === 'math' ? tx.get(mathProgressRef(access)) : Promise.resolve(null)]);
    const wasCompleted = session.completed;
    const at = new Date().toISOString(); previousAnswer.understanding = data.understanding as Understanding; previousAnswer.completedAt = at;
    const next = nextQuizSkill(question, previousAnswer, session.date, skill.exists ? skill.data() as QuizSkill : undefined);
    previousAnswer.nextDue = next.dueDate;
    session.completed = session.questions.every(q => !!session.answers[q.id]?.understanding);
    const amount = paid.exists ? 0 : mode === 'review' ? 0.5 : session.completed ? 5 : 0;
    const balance = addPointBalance(points, amount), earned = addPointBalance(pointBalance(access.pupil.data()?.pointsEarnedTotal), amount);
    tx.update(ref, {answers: session.answers, completed: session.completed}); tx.set(skillRef, next);
    if (mode === 'math' && session.mathPractice?.version === MATH_PRACTICE_VERSION && !wasCompleted && session.completed) {
      tx.set(mathProgressRef(access), {completedDays: quizMathProgress(progress?.data()?.completedDays ?? 0).completedDays + 1, updatedAt: at});
    }
    if (amount) {
      const reason = mode === 'review' ? `복습 완료 · ${question.skillLabel}` : `${mode === 'english' ? '영어' : '연산'} 데일리 10문제 완료`;
      tx.update(access.pupil.ref, {points: balance, pointsEarnedTotal: earned});
      tx.create(receipt, {classId: ctx.classId, studentId: ctx.studentId, amount, kind: 'earn', source: 'daily-quiz', sourceId: session.id, reason, actorUid: ctx.uid, balanceAfter: balance, createdAt: at});
      tx.create(root.collection('ledger').doc(receiptId), {date: session.date, reason, halfUnits: amount * 2, balanceHalfUnits: balance * 2, createdAt: at});
    }
    if (mode !== 'review' && session.completed) {
      const entries = ranking.data()?.grade === session.grade ? ranking.data()?.entries || {} : {};
      entries[`${session.date}_${mode}`] = {date: session.date, correct: Object.values(session.answers).filter(a => a.correct).length};
      tx.set(score, {grade: session.grade, entries, updatedAt: at});
    }
    return {session: publicQuizSession(session), rewardedHalfUnits: amount * 2, walletHalfUnits: balance * 2};
  });
}
async function teacherClass(ctx: Context, classId: string) {
  if (ctx.role === 'student') throw new ApiError(403, '선생님만 사용할 수 있어요.', 'FORBIDDEN');
  const cls = await db().doc(`classes/${id(classId)}`).get();
  if (!cls.exists || !canManageClass(ctx.role, ctx.uid, cls.data()?.ownerUid)) throw new ApiError(403, '우리 반만 확인할 수 있어요.', 'FORBIDDEN'); return cls;
}
async function report(ctx: Context, classId: string) {
  const cls = await teacherClass(ctx, classId), date = seoulQuizDate(), grade = gradeOf(cls.data()?.grade), semester = quizCalendar(date).semester;
  const pupils = await db().collection(`classes/${classId}/students`).get();
  const [ranking, packs] = await Promise.all([ranks(classId, grade, date), Promise.all([ensurePack({grade, semester, date}, 'english'), Promise.resolve({pack: generatePracticeMathPack({grade, semester, date}, 0)})])]);
  const students = await Promise.all(pupils.docs.filter(doc => !doc.data().disabled).map(async pupil => {
    const refs = quizModes.map(mode => pupil.ref.collection('dailyQuizYears').doc(String(quizCalendar(date).schoolYear)).collection('sessions').doc(`${date}_${mode}`));
    const [sessions, progress] = await Promise.all([db().getAll(...refs), pupil.ref.collection('dailyQuizYears').doc(String(quizCalendar(date).schoolYear)).collection('progress').doc(`math_g${grade}`).get()]);
    return {id: pupil.id, name: pupil.data().name, number: pupil.data().number, points: pointBalance(pupil.data().points), mathStage: quizMathProgress(progress.data()?.completedDays ?? 0).stage + 1, modes: Object.fromEntries(sessions.filter(s => s.exists).map(doc => {const session = doc.data() as QuizSession; return [session.mode, {completed: session.completed, total: session.questions.length, finished: Object.values(session.answers).filter(a => a.understanding).length, correct: Object.values(session.answers).filter(a => a.correct).length}];}))};
  }));
  return {className: cls.data()!.name, grade, date, semester, ranking, students: students.sort((a, b) => a.number - b.number), packs: packs.map(p => p.pack)};
}
export async function handlePublicQuiz(request: Request, segments: string[]) {
  try {
    const ctx = await getContext(request), path = segments.join('/');
    if (request.method !== 'GET') assertOrigin(request);
    if (request.method === 'GET' && path === 'state') return json(await studentState(ctx));
    if (request.method === 'GET' && path === 'report') return json(await report(ctx, id(new URL(request.url).searchParams.get('classId'))));
    if (request.method === 'POST') {
      const data = await input(request);
      if (path === 'grade') {const cls = await teacherClass(ctx, id(data.classId)); await cls.ref.update({grade: String(gradeOf(data.grade))}); return json({ok: true});}
      if (path === 'start') return json(await start(ctx, data));
      if (path === 'answer' || path === 'understanding') return json(await study(ctx, data, path));
    }
    throw new ApiError(404, '요청한 기능을 찾을 수 없어요.', 'NOT_FOUND');
  } catch (error) {
    if (error instanceof ApiError || error instanceof QuizError) return json({error: error.message, code: error.code}, error.status);
    console.error('Daily quiz failed', (error as {code?: string}).code || 'INTERNAL'); return json({error: '처리하지 못했어요. 잠시 후 다시 시도해 주세요.', code: 'INTERNAL_ERROR'}, 500);
  }
}
