import 'server-only';
import {createHash, randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import {db} from '@/lib/server/admin';
import {assertOrigin, getContext, type Context} from '@/lib/server/auth';
import {runMeteredAi} from '@/lib/server/ai';
import {ApiError, canManageClass, id} from '@/lib/server/policy';
import {completedAiText, providerFailure, readBoundedJson} from '@/lib/server/ai-policy';
import {addPointBalance, pointBalance} from '@/lib/server/points-policy';
import {cardsFor, DAILY_REVIEW_LIMIT, effectiveRating, finalRatings, isRating, LESSON_REWARD, LessonReviewError, nextReview, phaseComplete, publicQuestion, questionBody, reviewDate, scheduleItem, validateContent, validateMeta, weakQuestions} from './engine';
import {lessonReviewRequest, lessonReviewResult, lessonSource} from './ai-request';
import type {AnswerRecord, DueReview, Lesson, LessonRun, ReviewItem, RunView, StudentHome, TeacherReport, TeacherState} from './types';

type Data = Record<string, unknown>;
type Doc = FirebaseFirestore.DocumentSnapshot;
const json = (value: unknown, status = 200) => NextResponse.json(value, {status, headers: {'Cache-Control': 'private, no-store'}});
const now = () => new Date().toISOString();
const lessonRef = (classId: string, lessonId: string) => db().doc(`classes/${classId}/lessonReviews/${id(lessonId)}`);
const settingsRef = (classId: string) => db().doc(`classes/${classId}/settings/lessonReview`);
const NEVER = '9999-12-31';
const AI_MODEL = () => process.env.OPENAI_MODEL?.trim() || 'gpt-6-luna';

function lessonOf(doc: Doc): Lesson {
  const value = doc.data()!;
  return {id: doc.id, classId: String(value.classId), subject: String(value.subject), unit: String(value.unit), title: String(value.title), status: value.status, source: value.source,
    concepts: value.concepts, questions: value.questions, createdAt: value.createdAt, updatedAt: value.updatedAt, publishedAt: value.publishedAt ?? null};
}
async function body(request: Request, maximum = 200_000): Promise<Data> {
  const value = await readBoundedJson(request, maximum);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, '입력 내용을 확인해 주세요.');
  return value as Data;
}
async function teacherClass(ctx: Context, classId: string) {
  const cls = await db().doc(`classes/${id(classId)}`).get();
  if (!cls.exists || !canManageClass(ctx.role, ctx.uid, cls.data()?.ownerUid)) throw new ApiError(403, '우리 반 학급을 선택해 주세요.', 'FORBIDDEN');
  return cls;
}
function student(ctx: Context) {
  if (ctx.role !== 'student' || !ctx.classId || !ctx.studentId) throw new ApiError(403, '학생 화면에서 이용해 주세요.', 'FORBIDDEN');
  return db().doc(`classes/${ctx.classId}/students/${ctx.studentId}`);
}
/** Every write re-reads the pupil inside its transaction so disabled or re-linked accounts stop immediately. */
function assertPupil(ctx: Context, doc: Doc) {
  if (!doc.exists || doc.data()?.disabled || doc.data()?.authUid !== ctx.uid) throw new ApiError(403, '학생 정보를 다시 확인해 주세요.', 'FORBIDDEN');
}
function published(doc: Doc) {
  if (!doc.exists || doc.data()?.status !== 'published') throw new ApiError(404, '선생님이 열어 준 복습을 찾을 수 없어요.', 'LESSON_UNAVAILABLE');
  return lessonOf(doc);
}
const emptyRun = (lessonId: string): LessonRun => ({lessonId, phase: 'pretest', pretest: {}, retest: {}, startedAt: now(), finishedAt: null, reward: 0});
const runOf = (doc: Doc, lessonId: string): LessonRun => doc.exists ? doc.data() as LessonRun : emptyRun(lessonId);
const phaseQuestions = (lesson: Lesson, run: LessonRun) => run.phase === 'pretest' ? lesson.questions : run.phase === 'retest' ? weakQuestions(lesson, run.pretest) : [];

function runView(lesson: Lesson, run: LessonRun, nextDue: string | null): RunView {
  const twin = run.phase === 'retest', questions = phaseQuestions(lesson, run), answers = twin ? run.retest : run.pretest;
  const shown = Object.fromEntries(questions.filter(question => answers[question.id]).map(question => {const target = questionBody(question, twin); return [question.id, {...answers[question.id], answer: target.answer, explanation: target.explanation}];}));
  const ratings = run.phase === 'done' ? Object.values(finalRatings(lesson, run)) : [];
  return {lesson: {id: lesson.id, subject: lesson.subject, unit: lesson.unit, title: lesson.title}, phase: run.phase, questions: questions.map(question => publicQuestion(question, twin)), answers: shown,
    cards: run.phase === 'cards' ? cardsFor(lesson, run.pretest) : [], reward: run.reward || 0,
    summary: run.phase === 'done' ? {know: ratings.filter(value => value === 'know').length, unsure: ratings.filter(value => value === 'unsure').length, unknown: ratings.filter(value => value === 'unknown').length, nextReview: nextDue} : null};
}

// ---------- teacher ----------
async function teacherState(ctx: Context, classId: string): Promise<TeacherState> {
  await teacherClass(ctx, classId);
  const [docs, settings] = await Promise.all([db().collection(`classes/${classId}/lessonReviews`).where('ownerUid', '==', ctx.uid).limit(200).get(), settingsRef(classId).get()]);
  return {lessons: docs.docs.map(lessonOf).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), rewardsEnabled: settings.data()?.rewardsEnabled === true, aiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim())};
}
async function generate(ctx: Context, request: Request) {
  const value = await body(request, 4_400_000), classId = id(value.classId), cls = await teacherClass(ctx, classId), meta = validateMeta(value);
  const source = lessonSource(value, meta, String(cls.data()?.grade ?? ''));
  if (!process.env.OPENAI_API_KEY?.trim()) throw new ApiError(503, 'AI 연결 설정을 확인해 주세요. 문제를 직접 만들 수도 있어요.', 'AI_NOT_CONFIGURED');
  const model = AI_MODEL(), fingerprint = createHash('sha256').update(JSON.stringify(['lesson-review-v1', source])).digest('hex');
  const content = await runMeteredAi(ctx.uid, 'lesson-review', model, fingerprint, async observe => {
    const response = await fetch('https://api.openai.com/v1/responses', {method: 'POST', headers: {Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json'}, body: JSON.stringify(lessonReviewRequest(source, model)), signal: AbortSignal.timeout(110_000), cache: 'no-store'});
    if (!response.ok) {await response.body?.cancel(); throw providerFailure(response.status);}
    const payload = await readBoundedJson(response, 512 * 1024); observe(payload);
    return lessonReviewResult(completedAiText(payload));
  }, classId);
  const ref = db().collection(`classes/${classId}/lessonReviews`).doc(randomUUID()), stamp = now();
  await ref.create({...meta, ...content, classId, ownerUid: ctx.uid, status: 'draft', source: 'ai', createdAt: stamp, updatedAt: stamp, publishedAt: null});
  return json({lesson: lessonOf(await ref.get())}, 201);
}
async function save(ctx: Context, request: Request) {
  const value = await body(request), classId = id(value.classId);
  await teacherClass(ctx, classId);
  const meta = validateMeta(value), content = validateContent(value), stamp = now();
  if (value.lessonId) {
    const ref = lessonRef(classId, String(value.lessonId));
    await db().runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists || doc.data()?.ownerUid !== ctx.uid) throw new ApiError(404, '복습을 찾을 수 없어요.');
      // Published sets are frozen so pupils' recorded answers keep matching their questions.
      if (doc.data()?.status !== 'draft') throw new ApiError(409, '배포한 복습은 고칠 수 없어요. 복사해서 새로 만들어 주세요.', 'LESSON_LOCKED');
      tx.update(ref, {...meta, ...content, updatedAt: stamp});
    });
    return json({lesson: lessonOf(await ref.get())});
  }
  const ref = db().collection(`classes/${classId}/lessonReviews`).doc(randomUUID());
  await ref.create({...meta, ...content, classId, ownerUid: ctx.uid, status: 'draft', source: value.source === 'ai' ? 'ai' : 'manual', createdAt: stamp, updatedAt: stamp, publishedAt: null});
  return json({lesson: lessonOf(await ref.get())}, 201);
}
async function setStatus(ctx: Context, request: Request, action: 'publish' | 'hide' | 'delete') {
  const value = await body(request), classId = id(value.classId);
  await teacherClass(ctx, classId);
  const ref = lessonRef(classId, String(value.lessonId)), stamp = now();
  await db().runTransaction(async tx => {
    const doc = await tx.get(ref), status = doc.data()?.status;
    if (!doc.exists || doc.data()?.ownerUid !== ctx.uid) throw new ApiError(404, '복습을 찾을 수 없어요.');
    if (action === 'delete') {if (status !== 'draft') throw new ApiError(409, '배포한 복습은 지우지 않고 숨겨 주세요.'); tx.delete(ref); return;}
    if (action === 'publish') {validateContent(doc.data()); tx.update(ref, {status: 'published', publishedAt: doc.data()?.publishedAt || stamp, updatedAt: stamp}); return;}
    if (status === 'draft') throw new ApiError(409, '아직 배포하지 않은 복습이에요.');
    tx.update(ref, {status: status === 'hidden' ? 'published' : 'hidden', updatedAt: stamp});
  });
  return json({ok: true});
}
async function report(ctx: Context, classId: string, lessonId: string): Promise<TeacherReport> {
  await teacherClass(ctx, classId);
  const lessonDoc = await lessonRef(classId, lessonId).get();
  if (!lessonDoc.exists || lessonDoc.data()?.ownerUid !== ctx.uid) throw new ApiError(404, '복습을 찾을 수 없어요.');
  const lesson = lessonOf(lessonDoc), roster = (await db().collection(`classes/${classId}/students`).get()).docs.filter(doc => !doc.data().disabled);
  const runs = roster.length ? await db().getAll(...roster.map(doc => doc.ref.collection('lessonReviewRuns').doc(lessonId))) : [];
  const stats = Object.fromEntries(lesson.questions.map(question => [question.id, {id: question.id, prompt: question.prompt, know: 0, unsure: 0, unknown: 0, correct: 0, answered: 0}]));
  runs.forEach(doc => {
    if (!doc.exists) return;
    const run = doc.data() as LessonRun, ratings = run.phase === 'done' ? finalRatings(lesson, run) : {};
    for (const question of lesson.questions) {
      const first = run.pretest?.[question.id], rating = ratings[question.id] || first?.rating;
      if (first) {stats[question.id].answered++; if (first.correct) stats[question.id].correct++;}
      if (rating) stats[question.id][rating]++;
    }
  });
  return {students: roster.map((doc, index) => ({id: doc.id, name: String(doc.data().name || ''), number: Number(doc.data().number || 0), phase: runs[index]?.exists ? (runs[index].data() as LessonRun).phase : 'new' as const})).sort((a, b) => a.number - b.number), questions: Object.values(stats)};
}

// ---------- pupil ----------
async function nextDueDate(pupil: FirebaseFirestore.DocumentReference, today: string) {
  const next = await pupil.collection('lessonReviewItems').where('dueDate', '>', today).orderBy('dueDate').limit(1).get();
  const date = next.docs[0]?.data().dueDate;
  return date && date !== NEVER ? String(date) : null;
}
async function home(ctx: Context): Promise<StudentHome> {
  const pupil = student(ctx), today = reviewDate();
  const [me, lessons, due] = await Promise.all([pupil.get(), db().collection(`classes/${ctx.classId}/lessonReviews`).where('status', '==', 'published').limit(200).get(), pupil.collection('lessonReviewItems').where('dueDate', '<=', today).count().get()]);
  assertPupil(ctx, me);
  const runs = lessons.size ? await db().getAll(...lessons.docs.map(doc => pupil.collection('lessonReviewRuns').doc(doc.id))) : [];
  return {
    lessons: lessons.docs.map((doc, index) => ({id: doc.id, subject: String(doc.data().subject), unit: String(doc.data().unit), title: String(doc.data().title), publishedAt: doc.data().publishedAt ?? null, questionCount: (doc.data().questions as unknown[]).length, phase: runs[index].exists ? (runs[index].data() as LessonRun).phase : 'new' as const}))
      .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt))),
    dueCount: due.data().count, nextDue: await nextDueDate(pupil, today),
  };
}
async function openRun(ctx: Context, lessonId: string) {
  const pupil = student(ctx), [me, lessonDoc, runDoc] = await Promise.all([pupil.get(), lessonRef(ctx.classId!, lessonId).get(), pupil.collection('lessonReviewRuns').doc(id(lessonId)).get()]);
  assertPupil(ctx, me);
  const lesson = published(lessonDoc), run = runOf(runDoc, lesson.id);
  return json({run: runView(lesson, run, run.phase === 'done' ? await nextDueDate(pupil, reviewDate()) : null)});
}
async function runAction(ctx: Context, request: Request, lessonId: string, action: 'answer' | 'rate' | 'cards-done') {
  const value = action === 'cards-done' ? {} : await body(request, 4_000), pupil = student(ctx), today = reviewDate();
  const lRef = lessonRef(ctx.classId!, lessonId), rRef = pupil.collection('lessonReviewRuns').doc(id(lessonId));
  const run = await db().runTransaction(async tx => {
    const [me, lessonDoc, runDoc, settings] = await Promise.all([tx.get(pupil), tx.get(lRef), tx.get(rRef), tx.get(settingsRef(ctx.classId!))]);
    assertPupil(ctx, me);
    const lesson = published(lessonDoc), run = runOf(runDoc, lesson.id);
    if (action === 'cards-done') {
      if (run.phase !== 'cards') return run;
      const next = {...run, phase: 'retest' as const}; tx.set(rRef, next); return next;
    }
    if (run.phase !== 'pretest' && run.phase !== 'retest') throw new ApiError(409, '지금 단계에서는 문제를 풀 수 없어요.', 'LESSON_PHASE');
    const twin = run.phase === 'retest', bucket = twin ? 'retest' : 'pretest', answers = {...run[bucket]};
    const question = phaseQuestions(lesson, run).find(item => item.id === value.questionId);
    if (!question) throw new ApiError(400, '문제를 다시 골라 주세요.');
    const target = questionBody(question, twin), previous = answers[question.id];
    if (action === 'answer') {
      // The first answer is final; a retry only returns what was already recorded.
      if (previous) return run;
      const choice = Number(value.choice);
      if (!Number.isInteger(choice) || choice < 0 || choice >= target.choices.length) throw new ApiError(400, '보기를 골라 주세요.');
      const next = {...run, [bucket]: {...answers, [question.id]: {choice, correct: choice === target.answer} satisfies AnswerRecord}};
      tx.set(rRef, next); return next;
    }
    if (!previous) throw new ApiError(409, '먼저 답을 골라 주세요.');
    if (previous.rating) return run;
    if (!isRating(value.rating)) throw new ApiError(400, '이해한 정도를 골라 주세요.');
    answers[question.id] = {...previous, rating: effectiveRating(previous.correct, value.rating)};
    let next: LessonRun = {...run, [bucket]: answers};
    if (!phaseComplete(phaseQuestions(lesson, next), answers)) {tx.set(rRef, next); return next;}
    if (run.phase === 'pretest' && weakQuestions(lesson, answers).length) {next = {...next, phase: 'cards'}; tx.set(rRef, next); return next;}
    // Finishing: schedule weak points, then pay the one-time completion reward when the class turned it on.
    const receipt = pupil.collection('pointLedger').doc(`lesson-review_${lesson.id}`), paid = await tx.get(receipt);
    const reward = settings.data()?.rewardsEnabled === true && !paid.exists ? LESSON_REWARD : 0, stamp = now();
    next = {...next, phase: 'done', finishedAt: stamp, reward};
    const ratings = finalRatings(lesson, next);
    for (const item of lesson.questions) {const scheduled = scheduleItem(lesson.id, item, ratings[item.id], today); if (scheduled) tx.set(pupil.collection('lessonReviewItems').doc(scheduled.id), scheduled);}
    tx.set(rRef, next);
    if (reward) {
      const balance = addPointBalance(pointBalance(me.data()?.points), reward);
      tx.update(pupil, {points: balance, pointsEarnedTotal: addPointBalance(pointBalance(me.data()?.pointsEarnedTotal), reward)});
      tx.create(receipt, {classId: ctx.classId, studentId: ctx.studentId, amount: reward, kind: 'earn', source: 'lesson-review', sourceId: lesson.id, reason: `배움 다지기 완료 · ${lesson.title}`, actorUid: ctx.uid, balanceAfter: balance, createdAt: stamp});
    }
    return next;
  });
  const lesson = lessonOf(await lRef.get());
  return json({run: runView(lesson, run, run.phase === 'done' ? await nextDueDate(pupil, today) : null)});
}
async function dueReviews(ctx: Context): Promise<DueReview[]> {
  const pupil = student(ctx), today = reviewDate(), me = await pupil.get();
  assertPupil(ctx, me);
  const items = (await pupil.collection('lessonReviewItems').where('dueDate', '<=', today).orderBy('dueDate').limit(DAILY_REVIEW_LIMIT).get()).docs.map(doc => doc.data() as ReviewItem);
  const lessonIds = [...new Set(items.map(item => item.lessonId))];
  const lessons = new Map((lessonIds.length ? await db().getAll(...lessonIds.map(lessonId => lessonRef(ctx.classId!, lessonId))) : []).filter(doc => doc.exists && doc.data()?.status === 'published').map(doc => [doc.id, lessonOf(doc)]));
  return items.flatMap(item => {
    const lesson = lessons.get(item.lessonId), question = lesson?.questions.find(value => value.id === item.questionId);
    if (!lesson || !question) return [];
    const twin = item.reviews % 2 === 1, target = questionBody(question, twin), pending = item.pending?.date === today ? item.pending : null;
    return [{itemId: item.id, lessonTitle: lesson.title, subject: lesson.subject, question: publicQuestion(question, twin), answered: pending ? {choice: pending.choice, correct: pending.correct, answer: target.answer, explanation: target.explanation} : null}];
  });
}
async function reviewAction(ctx: Context, request: Request, itemId: string, action: 'answer' | 'rate') {
  const value = await body(request, 4_000), pupil = student(ctx), today = reviewDate(), ref = pupil.collection('lessonReviewItems').doc(id(itemId));
  const result = await db().runTransaction(async tx => {
    const [me, doc] = await Promise.all([tx.get(pupil), tx.get(ref)]);
    assertPupil(ctx, me);
    const item = doc.data() as ReviewItem | undefined;
    if (!item || item.graduated || item.dueDate > today) throw new ApiError(404, '오늘 복습할 문제가 아니에요.', 'REVIEW_NOT_DUE');
    const lesson = published(await tx.get(lessonRef(ctx.classId!, item.lessonId))), question = lesson.questions.find(entry => entry.id === item.questionId);
    if (!question) throw new ApiError(404, '복습 문제를 찾을 수 없어요.');
    const target = questionBody(question, item.reviews % 2 === 1), pending = item.pending?.date === today ? item.pending : null;
    if (action === 'answer') {
      if (pending) return {correct: pending.correct, answer: target.answer, explanation: target.explanation};
      const choice = Number(value.choice);
      if (!Number.isInteger(choice) || choice < 0 || choice >= target.choices.length) throw new ApiError(400, '보기를 골라 주세요.');
      tx.update(ref, {pending: {date: today, choice, correct: choice === target.answer}});
      return {correct: choice === target.answer, answer: target.answer, explanation: target.explanation};
    }
    if (!pending) throw new ApiError(409, '먼저 답을 골라 주세요.');
    if (!isRating(value.rating)) throw new ApiError(400, '이해한 정도를 골라 주세요.');
    const next = nextReview(item, effectiveRating(pending.correct, value.rating), today);
    tx.set(ref, next.graduated ? {...next, dueDate: NEVER} : next);
    return {graduated: next.graduated, nextDue: next.graduated ? null : next.dueDate};
  });
  return json(result);
}

export async function handleLessonReview(request: Request, segments: string[]) {
  try {
    if (request.method !== 'GET') assertOrigin(request);
    const ctx = await getContext(request), [scope, a, b, c] = segments, url = new URL(request.url);
    if (scope === 'teacher') {
      if (ctx.role === 'student') throw new ApiError(403, '선생님만 사용할 수 있어요.', 'FORBIDDEN');
      if (!a && request.method === 'GET') return json(await teacherState(ctx, id(url.searchParams.get('classId'))));
      if (a === 'report' && request.method === 'GET') return json(await report(ctx, id(url.searchParams.get('classId')), id(url.searchParams.get('lessonId'))));
      if (request.method === 'POST' && a === 'generate') return await generate(ctx, request);
      if (request.method === 'POST' && a === 'save') return await save(ctx, request);
      if (request.method === 'POST' && (a === 'publish' || a === 'hide' || a === 'delete')) return await setStatus(ctx, request, a);
      if (request.method === 'POST' && a === 'settings') {const value = await body(request, 2_000), classId = id(value.classId); await teacherClass(ctx, classId); if (typeof value.rewardsEnabled !== 'boolean') throw new ApiError(400, '설정을 확인해 주세요.'); await settingsRef(classId).set({rewardsEnabled: value.rewardsEnabled, updatedAt: now()}, {merge: true}); return json({rewardsEnabled: value.rewardsEnabled});}
    }
    if (scope === 'student') {
      if (!a && request.method === 'GET') return json(await home(ctx));
      if (a === 'lessons' && b && !c && request.method === 'GET') return await openRun(ctx, b);
      if (a === 'lessons' && b && request.method === 'POST' && (c === 'answer' || c === 'rate' || c === 'cards-done')) return await runAction(ctx, request, b, c);
      if (a === 'reviews' && !b && request.method === 'GET') return json({reviews: await dueReviews(ctx)});
      if (a === 'reviews' && b && request.method === 'POST' && (c === 'answer' || c === 'rate')) return await reviewAction(ctx, request, b, c);
    }
    throw new ApiError(404, '요청한 기능을 찾을 수 없어요.');
  } catch (error) {
    if (error instanceof LessonReviewError) return json({error: error.message, code: error.code}, error.status);
    if (error instanceof ApiError) return json({error: error.message, code: error.code}, error.status);
    console.error('Lesson review failed', (error as {code?: string}).code || 'INTERNAL');
    return json({error: '배움 다지기를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 'LESSON_REVIEW_FAILED'}, 500);
  }
}
