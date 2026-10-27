import 'server-only';
import {createHash, randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import {db} from '@/lib/server/admin';
import {assertOrigin, getContext, type Context} from '@/lib/server/auth';
import {ApiError, id} from '@/lib/server/policy';
import {addPointBalance, pointBalance} from '@/lib/server/points-policy';
import {answerScore, choicesFor, emptyScore, gradeBand, hintsFor, nextPlaySkill, normalizeAnswer, PlayError, playDate, publicSession, rankRows, schoolYear, validateItem, validateSettings, weekStart} from './engine';
import {playKinds, type PlayHome, type PlayItem, type PlayKind, type PlayRankings, type PlayReport, type PlayScore, type PlaySession, type PlaySkill, type PlayTeacherState} from './types';
import {accessStudent, loadItems, requirePlayEnabled, settingsOf, settingsRef, teacherClass, type PlayAccess} from './server-access';
import {handleRoomRequest} from './rooms-server';
import {handleSocialRequest} from './social-server';

const json = (data: unknown, status = 200) => NextResponse.json(data, {status, headers: {'Cache-Control': 'private, no-store'}});
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const rootRef = (a: PlayAccess) => a.pupil.ref.collection('playgroundYears').doc(a.year);
const scoreRef = (pupil: FirebaseFirestore.DocumentReference, week: string) => pupil.collection('playgroundScores').doc(week);
const liveEnabled = () => process.env.PLAYGROUND_LIVE_DISABLED !== 'true';
function kindOf(raw: unknown): PlayKind {
  if (!playKinds.includes(raw as PlayKind)) throw new ApiError(400, '놀이 종류를 확인해 주세요.', 'PLAY_KIND');
  return raw as PlayKind;
}
function weekOf(raw: string | null) {
  if (!raw) return weekStart(playDate());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(Date.parse(raw)) || new Date(raw).toISOString().slice(0, 10) !== raw || raw > playDate()) throw new ApiError(400, '주간 날짜를 확인해 주세요.', 'PLAY_DATE');
  return weekStart(raw);
}
function scoreOf(value?: FirebaseFirestore.DocumentData): PlayScore {
  return {...emptyScore(), ...value, days: Array.isArray(value?.days) ? value.days : []};
}
async function input(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length')) > 50000) throw new ApiError(413, '입력 내용이 너무 길어요.', 'PLAY_INPUT');
  const text = await request.text();
  if (text.length > 50000) throw new ApiError(413, '입력 내용이 너무 길어요.', 'PLAY_INPUT');
  try {const value = JSON.parse(text || '{}'); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value;}
  catch {throw new ApiError(400, '입력 내용을 확인해 주세요.', 'PLAY_INPUT');}
}
async function rankings(classId: string, week: string): Promise<PlayRankings> {
  const students = await db().collection(`classes/${classId}/students`).limit(500).get();
  const pupils = students.docs.filter(row => !row.data().disabled);
  if (!pupils.length) return {solo: [], duel: [], steady: []};
  const docs = await db().getAll(...pupils.map(row => scoreRef(row.ref, week)));
  const rows = pupils.map((pupil, index) => ({id: pupil.id, name: String(pupil.data().name || ''), score: scoreOf(docs[index].data())}));
  return {
    solo: rankRows(rows.map(row => ({...row, score: row.score.solo}))),
    duel: rankRows(rows.map(row => ({...row, score: row.score.wins * 3 + row.score.draws}))),
    steady: rankRows(rows.map(row => ({...row, score: new Set(row.score.days).size}))),
  };
}
function studentRanks(all: PlayRankings, studentId: string): PlayRankings {
  const visible = (rows: PlayRankings['solo']) => rows.filter((row, index) => index < 5 || row.id === studentId);
  return {solo: visible(all.solo), duel: visible(all.duel), steady: visible(all.steady)};
}
async function home(ctx: Context): Promise<PlayHome> {
  const a = await accessStudent(ctx), root = rootRef(a);
  const [items, attempts, skills, day, score, ranking] = await Promise.all([
    loadItems(a.ctx.classId, a.gradeBand), root.collection('attempts').get(), root.collection('spelling').get(),
    root.collection('days').doc(a.date).get(), scoreRef(a.pupil.ref, a.week).get(),
    a.settings.enabled && a.settings.showRankings ? rankings(a.ctx.classId, a.week) : Promise.resolve({solo: [], duel: [], steady: []}),
  ]);
  const seen = new Set(attempts.docs.map(row => row.id)), available = new Set(items.map(item => item.id));
  return {date: a.date, weekStart: a.week, studentId: a.ctx.studentId, name: String(a.pupil.data()?.name || ''), className: String(a.cls.data()?.name || ''), gradeBand: a.gradeBand, settings: a.settings, liveEnabled: liveEnabled(), scoredToday: Number(day.data()?.scored || 0), dailyLimit: 30,
    dueCount: skills.docs.filter(row => available.has(row.id) && row.data().dueDate <= a.date && row.data().lastDate < a.date).length,
    score: scoreOf(score.data()), menus: playKinds.map(kind => ({kind, total: items.filter(item => item.kind === kind).length, remaining: items.filter(item => item.kind === kind && !seen.has(item.id)).length})), ranking: studentRanks(ranking, a.ctx.studentId)};
}
async function next(ctx: Context, kind: PlayKind, data: Record<string, unknown>) {
  if (typeof data.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(data.requestId)) throw new ApiError(400, '다음 문제 버튼을 다시 눌러 주세요.', 'PLAY_REQUEST');
  if (data.review !== undefined && typeof data.review !== 'boolean') throw new ApiError(400, '복습 선택을 확인해 주세요.');
  const requestId = data.requestId, review = data.review === true;
  const practiceItemId = data.practiceItemId === undefined ? null : id(data.practiceItemId);
  return db().runTransaction(async tx => {
    const a = await accessStudent(ctx, tx); requirePlayEnabled(a);
    const root = rootRef(a), ref = root.collection('sessions').doc(hash(`${a.date}:${kind}:${review ? 'review' : 'solo'}:${requestId}`));
    const activeRef = root.collection('active').doc(`${kind}_${review ? 'review' : 'solo'}`);
    const [existing, active] = await Promise.all([tx.get(ref), tx.get(activeRef)]);
    if (existing.exists) return {session: publicSession(existing.data() as PlaySession)};
    if (active.data()?.sessionId) {
      const open = await tx.get(root.collection('sessions').doc(id(active.data()!.sessionId)));
      if (open.exists && open.data()!.date === a.date && !open.data()!.result && open.data()!.review === review && (!practiceItemId || open.data()!.item.id === practiceItemId)) return {session: publicSession(open.data() as PlaySession)};
    }
    const [items, attempts, skills, list] = await Promise.all([
      loadItems(a.ctx.classId, a.gradeBand, tx), tx.get(root.collection('attempts')), tx.get(root.collection('spelling')),
      tx.get(db().doc(`classes/${a.ctx.classId}/playgroundLists/${a.week}`)),
    ]);
    const seen = new Set(attempts.docs.map(row => row.id));
    let pool = items.filter(item => item.kind === kind);
    if (review) {
      if (kind !== 'spelling') throw new ApiError(400, '맞춤법에서 복습할 수 있어요.');
      const due = new Set(skills.docs.filter(row => row.data().dueDate <= a.date && row.data().lastDate < a.date).map(row => row.id));
      pool = pool.filter(item => due.has(item.id));
    } else if (practiceItemId) {
      if (!seen.has(practiceItemId)) throw new ApiError(400, '먼저 풀어 본 문제만 다시 연습할 수 있어요.');
      pool = pool.filter(item => item.id === practiceItemId);
    } else {
      const selected = list.data()?.itemIds;
      if (kind === 'spelling' && Array.isArray(selected) && selected.length) pool = pool.filter(item => selected.includes(item.id));
      const fresh = pool.filter(item => !seen.has(item.id));
      if (fresh.length) pool = fresh;
      else if (pool.length > 1) pool = pool.filter(item => item.id !== active.data()?.itemId);
    }
    if (!pool.length) throw new ApiError(409, review ? '오늘 다시 볼 맞춤법을 모두 풀었어요.' : '아직 이 범위의 문제가 없어요. 선생님께 알려 주세요.', review ? 'PLAY_NO_REVIEW' : 'PLAY_EMPTY');
    pool.sort((left, right) => hash(`${requestId}:${left.id}`).localeCompare(hash(`${requestId}:${right.id}`)));
    const item = pool[0];
    const session: PlaySession = {id: ref.id, kind, item, date: a.date, gradeBand: a.gradeBand, seed: hash(`${ctx.uid}:${item.id}:${a.date}`), hintsUsed: 0, review, createdAt: new Date().toISOString()};
    tx.create(ref, session); tx.set(activeRef, {sessionId: ref.id, itemId: item.id, date: a.date});
    return {session: publicSession(session)};
  });
}
async function study(ctx: Context, kind: PlayKind, phase: 'hint' | 'answer', data: Record<string, unknown>) {
  return db().runTransaction(async tx => {
    const a = await accessStudent(ctx, tx); requirePlayEnabled(a);
    const root = rootRef(a), ref = root.collection('sessions').doc(id(data.sessionId)), snapshot = await tx.get(ref);
    if (!snapshot.exists || snapshot.data()!.kind !== kind) throw new ApiError(404, '풀고 있는 문제를 다시 열어 주세요.', 'PLAY_SESSION');
    const session = snapshot.data() as PlaySession;
    if (session.date !== a.date) throw new ApiError(409, '날짜가 바뀌었어요. 새 문제를 열어 주세요.', 'PLAY_DATE');
    if (session.result) return {session: publicSession(session)};
    if (phase === 'hint') {
      session.hintsUsed = Math.min(hintsFor(session.item).length, session.hintsUsed + 1);
      tx.update(ref, {hintsUsed: session.hintsUsed}); return {session: publicSession(session)};
    }
    let answer: string;
    if (data.choiceId !== undefined) {
      const choice = choicesFor(session.item, session.seed).find(row => row.id === data.choiceId);
      if (!choice) throw new ApiError(400, '보기 중 하나를 골라 주세요.', 'PLAY_CHOICE');
      answer = choice.label;
    } else {
      if (typeof data.answer !== 'string' || !data.answer.trim() || data.answer.length > 200) throw new ApiError(400, '답을 200자 이내로 적어 주세요.', 'PLAY_ANSWER');
      answer = data.answer.trim();
    }
    if (data.unsure !== undefined && typeof data.unsure !== 'boolean') throw new ApiError(400, '복습 선택을 확인해 주세요.');
    const attemptRef = root.collection('attempts').doc(session.item.id), dayRef = root.collection('days').doc(a.date), rankRef = scoreRef(a.pupil.ref, a.week), skillRef = root.collection('spelling').doc(session.item.id);
    const [attempt, day, ranking, skill] = await Promise.all([tx.get(attemptRef), tx.get(dayRef), tx.get(rankRef), tx.get(skillRef)]);
    const correct = session.item.answers.some(expected => normalizeAnswer(expected, kind) === normalizeAnswer(answer, kind));
    const scoredBefore = Number(day.data()?.scored || 0), eligible = !attempt.exists && !session.review && scoredBefore < 30;
    const scored = scoredBefore + (eligible ? 1 : 0), score = eligible ? answerScore(correct, session.hintsUsed) : 0;
    const paidBefore = Number(day.data()?.soloRewarded || 0);
    const milestone = eligible && scored % 10 === 0;
    const receipt = a.pupil.ref.collection('pointLedger').doc(`playground_solo_${a.date}_${Math.floor(scored / 10)}`);
    const paid = milestone ? await tx.get(receipt) : null;
    const reward = milestone && a.settings.rewardsEnabled && !paid?.exists ? Math.max(0, Math.min(a.settings.soloReward, 3 - paidBefore)) : 0;
    const previous = skill.exists ? skill.data() as PlaySkill : undefined;
    // Replaying the same item on the same day cannot move the due date outwards.
    const nextSkill = kind === 'spelling' ? nextPlaySkill(session.item.id, correct, data.unsure === true, a.date, previous) : null;
    const result = {answer, correct, expected: session.item.answers[0], reveal: session.item.reveal, score, practice: !eligible, reward, ...(nextSkill ? {dueDate: nextSkill.dueDate} : {})};
    session.result = result;
    const at = new Date().toISOString(), totals = scoreOf(ranking.data());
    totals.solo += score; totals.days = [...new Set([...totals.days, a.date])];
    if (!attempt.exists) {totals.answered++; if (correct) totals.correct++;}
    tx.update(ref, {result});
    if (!attempt.exists) tx.create(attemptRef, {itemId: session.item.id, version: session.item.version, kind, date: a.date, answer, correct, hintsUsed: session.hintsUsed, score, createdAt: at});
    tx.set(dayRef, {...day.data(), scored, soloRewarded: paidBefore + reward, updatedAt: at});
    tx.set(rankRef, {...totals, updatedAt: at});
    if (nextSkill) tx.set(skillRef, nextSkill);
    if (reward) {
      const balance = addPointBalance(pointBalance(a.pupil.data()?.points), reward);
      tx.update(a.pupil.ref, {points: balance, pointsEarnedTotal: addPointBalance(pointBalance(a.pupil.data()?.pointsEarnedTotal), reward)});
      tx.create(receipt, {classId: a.ctx.classId, studentId: a.ctx.studentId, amount: reward, kind: 'earn', source: 'playground', sourceId: ref.id, reason: '말놀이터 처음 푼 문제 10개', actorUid: ctx.uid, balanceAfter: balance, createdAt: at});
    }
    return {session: publicSession(session)};
  });
}
async function teacherState(ctx: Context, classId: string, week: string): Promise<PlayTeacherState> {
  const cls = await teacherClass(ctx, classId), band = gradeBand(cls.data()?.grade);
  const [settings, items, hidden, list] = await Promise.all([settingsRef(classId).get(), loadItems(classId, band), db().collection(`classes/${classId}/playgroundItems`).get(), db().doc(`classes/${classId}/playgroundLists/${week}`).get()]);
  const all = new Map(items.map(item => [item.id, item]));
  for (const row of hidden.docs) all.set(row.id, {...row.data(), id: row.id} as PlayItem);
  return {classId, className: String(cls.data()?.name || ''), gradeBand: band, weekStart: week, settings: settingsOf(settings.data()), items: [...all.values()], spellingIds: list.data()?.itemIds || [], liveEnabled: liveEnabled()};
}
async function teacherReport(ctx: Context, classId: string, week: string): Promise<PlayReport> {
  await teacherClass(ctx, classId);
  const [pupils, items, ranking] = await Promise.all([db().collection(`classes/${classId}/students`).limit(500).get(), loadItems(classId), rankings(classId, week)]);
  const errors = new Map<string, number>();
  const students = await Promise.all(pupils.docs.filter(row => !row.data().disabled).map(async pupil => {
    const [score, skills] = await Promise.all([scoreRef(pupil.ref, week).get(), pupil.ref.collection('playgroundYears').doc(String(schoolYear(playDate()))).collection('spelling').get()]);
    skills.docs.forEach(row => errors.set(row.id, (errors.get(row.id) || 0) + Number(row.data().errors || 0)));
    return {id: pupil.id, name: String(pupil.data().name || ''), number: Number(pupil.data().number || 0), score: scoreOf(score.data()), dueCount: skills.docs.filter(row => row.data().dueDate <= playDate() && row.data().lastDate < playDate()).length};
  }));
  return {students: students.sort((a, b) => a.number - b.number), spelling: items.filter(item => item.kind === 'spelling' && errors.has(item.id)).map(item => ({id: item.id, prompt: item.prompt, errors: errors.get(item.id)!})).sort((a, b) => b.errors - a.errors), ranking};
}
async function saveTeacher(ctx: Context, path: string, classId: string, data: Record<string, unknown>, week: string, method: string) {
  return db().runTransaction(async tx => {
    const cls = await teacherClass(ctx, classId, tx);
    if (path === 'teacher/settings' && method === 'PUT') {
      const settings = validateSettings(data); tx.set(settingsRef(classId), {...settings, updatedBy: ctx.uid, updatedAt: new Date().toISOString()}); return {settings};
    }
    if (path === 'teacher/items' && (method === 'POST' || method === 'PATCH')) {
      const itemId = method === 'POST' ? `t_${randomUUID()}` : id(data.id);
      if (!itemId.startsWith('t_')) throw new ApiError(400, '우리 반에서 만든 문제만 수정할 수 있어요.');
      const ref = cls.ref.collection('playgroundItems').doc(itemId), existing = await tx.get(ref);
      if (method === 'PATCH' && !existing.exists) throw new ApiError(404, '문제를 찾을 수 없어요.');
      if (method === 'POST') {const count = await tx.get(cls.ref.collection('playgroundItems').limit(500)); if (count.size >= 500) throw new ApiError(409, '우리 반 문제는 500개까지 보관할 수 있어요.');}
      const item = validateItem(data.item, itemId);
      item.id = itemId; item.source = 'teacher'; item.version = `teacher-${Number(existing.data()?.revision || 0) + 1}`;
      tx.set(ref, {...item, revision: Number(existing.data()?.revision || 0) + 1, updatedBy: ctx.uid, updatedAt: new Date().toISOString()}); return {item};
    }
    if (path === 'teacher/spelling-list' && method === 'PUT') {
      const itemIds = data.itemIds;
      if (!Array.isArray(itemIds) || itemIds.some(value => typeof value !== 'string') || (itemIds.length !== 0 && (itemIds.length < 5 || itemIds.length > 40)) || new Set(itemIds).size !== itemIds.length) throw new ApiError(400, '맞춤법은 5~40개를 고르거나 선택을 모두 해제해 주세요.');
      const items = await loadItems(classId, gradeBand(cls.data()?.grade), tx), allowed = new Set(items.filter(item => item.kind === 'spelling').map(item => item.id));
      if (itemIds.some(value => !allowed.has(value))) throw new ApiError(400, '우리 반 학년에 맞는 맞춤법 문제를 골라 주세요.');
      tx.set(cls.ref.collection('playgroundLists').doc(week), {itemIds, updatedAt: new Date().toISOString(), updatedBy: ctx.uid}); return {itemIds};
    }
    throw new ApiError(404, '요청한 기능을 찾을 수 없어요.', 'NOT_FOUND');
  });
}
export async function handlePlayground(request: Request, segments: string[]) {
  try {
    if (process.env.PLAYGROUND_DISABLED === 'true') throw new ApiError(404, '요청한 기능을 찾을 수 없어요.', 'NOT_FOUND');
    const ctx = await getContext(request), path = segments.join('/'), url = new URL(request.url);
    if (request.method !== 'GET') assertOrigin(request);
    const data = request.method === 'GET' ? {} : await input(request);
    if (request.method === 'GET' && path === 'home') return json(await home(ctx));
    if (segments[0] === 'solo' && segments.length === 3 && request.method === 'POST') {
      const kind = kindOf(segments[1]);
      if (segments[2] === 'next') return json(await next(ctx, kind, data));
      if (segments[2] === 'hint' || segments[2] === 'answer') return json(await study(ctx, kind, segments[2], data));
    }
    if (path === 'ranking' && request.method === 'GET') {
      const week = weekOf(url.searchParams.get('week'));
      if (ctx.role === 'student') {const a = await accessStudent(ctx); requirePlayEnabled(a); return json({ranking: a.settings.showRankings ? studentRanks(await rankings(a.ctx.classId, week), a.ctx.studentId) : {solo: [], duel: [], steady: []}});}
      const cls = await teacherClass(ctx, id(url.searchParams.get('classId'))); return json({ranking: await rankings(cls.id, week)});
    }
    if (segments[0] === 'teacher') {
      const classId = id(url.searchParams.get('classId') || data.classId), week = weekOf(url.searchParams.get('week'));
      if (request.method === 'GET' && (path === 'teacher/settings' || path === 'teacher/items' || path === 'teacher/spelling-list')) return json(await teacherState(ctx, classId, week));
      if (request.method === 'GET' && path === 'teacher/report') return json(await teacherReport(ctx, classId, week));
      return json(await saveTeacher(ctx, path, classId, data, week, request.method));
    }
    const socialResponse = await handleSocialRequest(request, ctx, segments, data);
    if (socialResponse !== undefined) return json(socialResponse);
    const roomResponse = await handleRoomRequest(request, ctx, segments, data);
    if (roomResponse !== undefined) return json(roomResponse);
    throw new ApiError(404, '요청한 기능을 찾을 수 없어요.', 'NOT_FOUND');
  } catch (error) {
    if (error instanceof ApiError || error instanceof PlayError) return json({error: error.message, code: error.code}, error.status);
    console.error('Playground request failed', (error as {code?: string}).code || 'INTERNAL');
    return json({error: '처리하지 못했어요. 잠시 후 다시 시도해 주세요.', code: 'INTERNAL_ERROR'}, 500);
  }
}
