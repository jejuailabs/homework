import 'server-only';
import {db} from '@/lib/server/admin';
import {dashboardFor} from '@/lib/server/teacher-dashboard';
import {teacherStorage} from '@/lib/server/teacher-storage';
import {pointBalance} from '@/lib/server/points-policy';
import {formatStorage} from '@/lib/storage-plan';
import {loadQuizRange} from '@/modules/daily-quiz/server';
import {quizCalendar} from '@/modules/daily-quiz/curriculum';
import {quizAddDays, quizWeekStart, seoulQuizDate} from '@/modules/daily-quiz/engine';
import {quizModes} from '@/modules/daily-quiz/types';
import {rankings} from '@/modules/playground/server';
import {playDate, weekStart} from '@/modules/playground/engine';
import {listCalendar} from '@/modules/teacher-workspace/server';
import {BerryError, alias, maskNames, safeId} from './policy';
import type {BearerContext, McpTool} from './types';

/**
 * "우리 반 활동 현황" (classroom:read): summaries of every ourclass menu so Berry can answer like a dashboard.
 * Students appear only as "학생 07"; free text is name-masked; secret diaries, photos, voices, board locations and
 * sensitive notebook records never leave. Scores and ranks are ourclass's own records, passed on as they are.
 */
type Data = Record<string, any>;
type Student = {id: string; number: number; name: string};
const LIST = 30;
const cls = {type: 'string', description: 'list_classes의 학급 id'};

export const CLASSROOM_TOOLS: McpTool[] = [
  {name: 'get_catalog', scope: 'classroom:read', description: '모두의 교실 핵심 분류표: 메뉴마다 담긴 것, 핵심 지표, 읽는 도구, 민감도, 읽기 비용, 대표 질문과 사용 원칙. 계획을 세울 때 먼저 봅니다. known_version이 같으면 unchanged만 돌려줍니다.', inputSchema: {type: 'object', properties: {known_version: {type: 'string'}}, additionalProperties: false}},
  {name: 'get_signals', scope: 'classroom:read', description: '모든 메뉴의 지금 숫자만 돌려줍니다: 학급별 미제출·검사 대기·마감 지남·다시 하기, 오늘·내일 퀴즈 범위 설정 여부, 진행 중 말놀이터 방, 복습 초안 수, 전시·보드 승인 대기, 저장 공간 단계, 받은 Kids Daily 공유 수, 오늘 일정 수. "지금 어때?"에 먼저 씁니다.', inputSchema: {type: 'object', properties: {}, additionalProperties: false}},
  {name: 'get_storage', scope: 'classroom:read', description: '선생님 저장 공간: 전체 용량·사용량·남은 양, 항목별 사용량(숙제 영상·사진·전시·참고 자료·보드·업무 공간), 경고 단계, 이번 이용 기간 종료일.', inputSchema: {type: 'object', properties: {}, additionalProperties: false}},
  {name: 'list_exhibitions', scope: 'classroom:read', description: '작품전시 전시실 목록: 상태(준비·열림·마감), 작품 수, 승인 대기 작품 수, QR 관람 허용, 숙제 연동 여부.', inputSchema: {type: 'object', properties: {class_id: cls}, additionalProperties: false}},
  {name: 'list_boards', scope: 'classroom:read', description: '참여보드 목록: 상태(열림·마감·보관), 게시물·참여자 수, 승인 대기 게시물 수, 숙제 연동 여부.', inputSchema: {type: 'object', properties: {class_id: cls}, additionalProperties: false}},
  {name: 'get_moderation_queue', scope: 'classroom:read', description: '선생님 승인을 기다리는 전시 작품과 보드 게시물 목록(제목·학생 가명·올린 시각).', inputSchema: {type: 'object', properties: {class_id: cls}, additionalProperties: false}},
  {name: 'get_quiz_status', scope: 'classroom:read', description: '데일리 Quiz: 오늘·내일 범위 설정 여부, 오늘 학생별 완료(영어·수학·복습), 이번 주 맞힌 문제 수. 학생은 가명.', inputSchema: {type: 'object', properties: {class_id: cls}, required: ['class_id'], additionalProperties: false}},
  {name: 'get_review_status', scope: 'classroom:read', description: '복습하기: 최근 복습 목록(초안·발행·숨김)과 발행된 복습마다 참여한 학생 수.', inputSchema: {type: 'object', properties: {class_id: cls}, required: ['class_id'], additionalProperties: false}},
  {name: 'get_playground_status', scope: 'classroom:read', description: '말놀이터: 켜짐 여부와 설정, 이번 주 혼자하기·대결·꾸준함 순위(가명, 모두의 교실 기록 그대로), 진행 중인 실시간 방.', inputSchema: {type: 'object', properties: {class_id: cls}, required: ['class_id'], additionalProperties: false}},
  {name: 'get_points', scope: 'classroom:read', description: '보말(포인트): 학급 설정과 학생별 잔액·누적 적립(가명).', inputSchema: {type: 'object', properties: {class_id: cls}, required: ['class_id'], additionalProperties: false}},
  {name: 'list_card_sets', scope: 'classroom:read', description: '카드놀이: 학급에 배부한 카드 세트(제목·마감·진행 중 여부·대상 학생 수).', inputSchema: {type: 'object', properties: {class_id: cls}, additionalProperties: false}},
  {name: 'list_class_tools', scope: 'classroom:read', description: 'Tools에서 쓰는 우리 반 캔버스와 투표(상태·마감·참여 수).', inputSchema: {type: 'object', properties: {class_id: cls}, additionalProperties: false}},
];


async function ownedClasses(uid: string) {
  const snap = await db().collection('classes').where('ownerUid', '==', uid).select('name', 'grade', 'year', 'studentCount', 'adminStatus', 'pointSettings').get();
  return snap.docs.filter(doc => doc.data().adminStatus !== 'archived').map(doc => ({id: doc.id, ...doc.data()} as Data));
}
async function ownedClass(uid: string, classId: unknown) {
  const doc = await db().doc(`classes/${safeId(classId, '학급')}`).get();
  if (!doc.exists || doc.data()!.ownerUid !== uid) throw new BerryError('이 학급을 찾을 수 없어요.', 404, 'not_found');
  return {id: doc.id, ...doc.data()} as Data;
}
async function roster(classId: string): Promise<Student[]> {
  const snap = await db().collection(`classes/${classId}/students`).select('number', 'name', 'disabled').get();
  return snap.docs.filter(doc => !doc.data().disabled).map(doc => ({id: doc.id, number: Number(doc.data().number) || 0, name: String(doc.data().name ?? '')})).sort((a, b) => a.number - b.number);
}
const label = (students: Student[], studentId: unknown) => {const s = students.find(row => row.id === studentId); return s ? alias(s.number) : '학생';};
const count = async (query: FirebaseFirestore.Query) => (await query.count().get()).data().count;
const seoulToday = () => seoulQuizDate();

async function exhibitionsOf(uid: string, classId?: string) {
  const base = db().collection('exhibitions').where(classId ? 'classId' : 'ownerUid', '==', classId ?? uid);
  const docs = (await base.select('classId', 'className', 'title', 'status', 'artworkCount', 'approvedCount', 'publicSharingEnabled', 'linkedAssignmentId', 'updatedAt', 'ownerUid').get()).docs.filter(doc => doc.data().ownerUid === uid);
  return Promise.all(docs.map(async doc => {
    const value = doc.data(), pending = value.status === 'open' || value.status === 'draft' ? await count(doc.ref.collection('artworks').where('status', '==', 'pending')) : 0;
    return {id: doc.id, class: value.className, title: value.title, status: value.status, artworks: value.artworkCount ?? 0, approved: value.approvedCount ?? 0, pending_artworks: pending, qr_open: value.publicSharingEnabled === true, homework_linked: !!value.linkedAssignmentId, updated_at: value.updatedAt};
  }));
}
async function boardsOf(uid: string, classId?: string) {
  const docs = (await db().collection('participationBoards').where(classId ? 'classId' : 'ownerUid', '==', classId ?? uid).select('classId', 'className', 'title', 'status', 'postCount', 'participantCount', 'moderation', 'linkedAssignmentId', 'updatedAt', 'ownerUid').get()).docs.filter(doc => doc.data().ownerUid === uid);
  return Promise.all(docs.map(async doc => {
    const value = doc.data(), pending = value.status !== 'archived' && value.moderation ? await count(doc.ref.collection('posts').where('status', '==', 'pending')) : 0;
    return {id: doc.id, class: value.className, title: value.title, status: value.status, posts: value.postCount ?? 0, participants: value.participantCount ?? 0, moderation: value.moderation === true, pending_posts: pending, homework_linked: !!value.linkedAssignmentId, updated_at: value.updatedAt};
  }));
}
async function quizRanges(classValue: Data) {
  const grade = Number(classValue.grade);
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) return {today: null, tomorrow: null, note: '학급 학년이 1~6학년일 때만 Quiz를 써요.'};
  const today = seoulToday(), tomorrow = quizAddDays(today, 1);
  const [a, b] = await Promise.all([loadQuizRange(classValue.id, {grade, semester: quizCalendar(today).semester, date: today}), loadQuizRange(classValue.id, {grade, semester: quizCalendar(tomorrow).semester, date: tomorrow})]);
  return {today: !!a, tomorrow: !!b};
}
async function liveRooms(classId: string) {
  const rooms = await db().collection('playRooms').where('classId', '==', classId).limit(20).get();
  return rooms.docs.map(doc => doc.data()).filter(room => (room.expiresAtMs ?? 0) > Date.now() && room.status !== 'finished').map(room => ({mode: room.mode, status: room.status, players: Array.isArray(room.players) ? room.players.length : 0}));
}

async function signals(ctx: BearerContext) {
  const classes = await ownedClasses(ctx.uid), today = seoulToday();
  const [dashboard, storage, exhibitions, boards, diaries, calendar] = await Promise.all([
    dashboardFor({uid: ctx.uid, role: ctx.role}), teacherStorage(ctx.uid, 60_000), exhibitionsOf(ctx.uid), boardsOf(ctx.uid),
    count(db().collection('diaryShares').where('recipientUid', '==', ctx.uid)).catch(() => null),
    listCalendar(ctx.uid, today, today, {deadlines: false, maxDays: 1}).catch(() => ({events: []})),
  ]);
  const assignments = (dashboard.assignments ?? []) as Data[];
  const perClass = await Promise.all(classes.slice(0, 20).map(async value => {
    const tasks = assignments.filter(task => task.classId === value.id);
    const [quiz, rooms, drafts] = await Promise.all([quizRanges(value).catch(() => null), liveRooms(value.id).catch(() => []), count(db().collection(`classes/${value.id}/lessonReviews`).where('status', '==', 'draft')).catch(() => 0)]);
    const sum = (key: string) => tasks.reduce((total, task) => total + (Number(task[key]) || 0), 0);
    return {id: value.id, name: value.name, missing: sum('pending'), waiting_review: sum('submitted'), overdue_missing: sum('overdue'), revision: sum('revision'), quiz_today_set: quiz?.today ?? null, quiz_tomorrow_set: quiz?.tomorrow ?? null, live_rooms: rooms.length, review_drafts: drafts};
  }));
  return {
    date: today,
    storage: {percent: Math.round(storage.usedBytes / Math.max(1, storage.quotaBytes) * 100), level: storage.level, days_left: storage.daysLeft},
    classes: perClass,
    exhibitions: {open: exhibitions.filter(row => row.status === 'open').length, pending_artworks: exhibitions.reduce((sum, row) => sum + row.pending_artworks, 0)},
    boards: {open: boards.filter(row => row.status === 'open').length, pending_posts: boards.reduce((sum, row) => sum + row.pending_posts, 0)},
    kids_daily_shared: diaries, today_events: calendar.events.length,
  };
}

export function menuFlags() {
  const tools = (process.env.TOOLS_DISABLED ?? '').split(',').map(value => value.trim()).filter(Boolean);
  return {
    homework: true, exhibitions: true, boards: true, quiz: true, lesson_review: true,
    playground: process.env.PLAYGROUND_DISABLED !== 'true', playground_live: process.env.PLAYGROUND_DISABLED !== 'true' && process.env.PLAYGROUND_LIVE_DISABLED !== 'true',
    kids_daily: process.env.MY_SPACE_DISABLED !== 'true', tools: true, tools_disabled: tools, points: true,
    cards: false, notebook: process.env.TEACHER_NOTEBOOK_DISABLED !== 'true', workspace: process.env.TEACHER_WORKSPACE_DISABLED !== 'true',
  };
}

async function quizStatus(ctx: BearerContext, classId: unknown) {
  const value = await ownedClass(ctx.uid, classId), students = await roster(value.id), today = seoulToday(), week = quizWeekStart(today);
  const ranges = await quizRanges(value);
  const year = String(quizCalendar(today).schoolYear);
  const rows = await Promise.all(students.slice(0, 60).map(async student => {
    const pupil = db().doc(`classes/${value.id}/students/${student.id}`);
    const [sessions, score] = await Promise.all([db().getAll(...quizModes.map(mode => pupil.collection('dailyQuizYears').doc(year).collection('sessions').doc(`${today}_${mode}`))), pupil.collection('dailyQuizScores').doc(week).get()]);
    const entries = Object.values(score.data()?.entries ?? {}) as {correct?: number}[];
    return {student: alias(student.number), done_today: sessions.filter(doc => doc.data()?.completed).map(doc => doc.data()!.mode), week_correct: entries.reduce((sum, row) => sum + (row.correct ?? 0), 0)};
  }));
  return {class: value.name, date: today, range_set: ranges, students: rows, completed_all_today: rows.filter(row => row.done_today.length === quizModes.length).length, total: rows.length};
}

async function reviewStatus(ctx: BearerContext, classId: unknown) {
  const value = await ownedClass(ctx.uid, classId), students = await roster(value.id);
  const lessons = (await db().collection(`classes/${value.id}/lessonReviews`).where('ownerUid', '==', ctx.uid).limit(200).get()).docs.map(doc => ({id: doc.id, ...doc.data()} as Data))
    .sort((a, b) => String(b.publishedAt ?? b.createdAt).localeCompare(String(a.publishedAt ?? a.createdAt))).slice(0, 10);
  const rows = await Promise.all(lessons.map(async lesson => {
    const runs = lesson.status === 'published' && students.length ? await db().getAll(...students.map(student => db().doc(`classes/${value.id}/students/${student.id}/lessonReviewRuns/${lesson.id}`))) : [];
    return {id: lesson.id, title: maskNames(String(lesson.title ?? ''), students), subject: lesson.subject, status: lesson.status, published_at: lesson.publishedAt ?? null, joined: runs.filter(doc => doc.exists).length, students: students.length};
  }));
  return {class: value.name, reviews: rows, drafts: rows.filter(row => row.status === 'draft').length};
}

async function playgroundStatus(ctx: BearerContext, classId: unknown) {
  const value = await ownedClass(ctx.uid, classId), students = await roster(value.id), week = weekStart(playDate());
  const [settings, ranks, rooms] = await Promise.all([db().doc(`classes/${value.id}/settings/playground`).get(), rankings(value.id, week), liveRooms(value.id)]);
  const top = (rows: {id: string; score: number; rank?: number}[]) => rows.slice(0, 10).map(row => ({student: label(students, row.id), score: row.score, rank: row.rank ?? null}));
  const s = settings.data() ?? {};
  return {class: value.name, week, enabled: s.enabled !== false && process.env.PLAYGROUND_DISABLED !== 'true', settings: {duels: s.allowDuels ?? null, rankings_shown: s.showRankings ?? null, rewards: s.rewardsEnabled ?? null}, rankings: {solo: top(ranks.solo), duel: top(ranks.duel), steady: top(ranks.steady)}, live_rooms: rooms};
}

async function points(ctx: BearerContext, classId: unknown) {
  const value = await ownedClass(ctx.uid, classId);
  const pupils = (await db().collection(`classes/${value.id}/students`).select('number', 'disabled', 'points', 'pointsEarnedTotal').get()).docs.filter(doc => !doc.data().disabled);
  const rows = pupils.map(doc => ({student: alias(Number(doc.data().number) || 0), balance: pointBalance(doc.data().points), earned_total: Number(doc.data().pointsEarnedTotal) || 0})).sort((a, b) => a.student.localeCompare(b.student));
  return {class: value.name, enabled: value.pointSettings?.enabled === true, label: value.pointSettings?.label ?? '보말', students: rows, total_balance: rows.reduce((sum, row) => sum + row.balance, 0)};
}

async function cardSets(ctx: BearerContext, classId?: unknown) {
  const classes = classId === undefined ? await ownedClasses(ctx.uid) : [await ownedClass(ctx.uid, classId)];
  const lists = await Promise.all(classes.map(value => db().collection('cardClassSets').where('classId', '==', value.id).limit(LIST).get()));
  return {card_sets: lists.flatMap((snap, index) => snap.docs.map(doc => ({id: doc.id, class: classes[index].name, title: doc.data().title, due_at: doc.data().dueAt ?? null, active: doc.data().active !== false, students: doc.data().targetCount ?? null}))).slice(0, LIST * 2)};
}

async function classTools(ctx: BearerContext, classId?: unknown) {
  const classes = classId === undefined ? await ownedClasses(ctx.uid) : [await ownedClass(ctx.uid, classId)];
  const ids = new Set(classes.map(value => value.id)), names = new Map(classes.map(value => [value.id, value.name]));
  const [canvases, polls] = await Promise.all([
    db().collection('classCanvases').where('ownerUid', '==', ctx.uid).select('classId', 'title', 'status', 'studentIds', 'updatedAt').limit(100).get(),
    Promise.all(classes.map(value => db().collection('classPolls').where('classId', '==', value.id).select('classId', 'title', 'question', 'status', 'closesAt', 'totalVotes', 'createdAt').limit(LIST).get())),
  ]);
  return {
    canvases: canvases.docs.filter(doc => ids.has(doc.data().classId)).map(doc => ({id: doc.id, class: names.get(doc.data().classId), title: doc.data().title ?? '', status: doc.data().status, students: Array.isArray(doc.data().studentIds) ? doc.data().studentIds.length : null, updated_at: doc.data().updatedAt})).slice(0, LIST),
    polls: polls.flatMap(snap => snap.docs.map(doc => ({id: doc.id, class: names.get(doc.data().classId), title: doc.data().title ?? doc.data().question ?? '', status: doc.data().status, closes_at: doc.data().closesAt ?? null, votes: doc.data().totalVotes ?? 0}))).slice(0, LIST),
  };
}

async function moderationQueue(ctx: BearerContext, classId?: unknown) {
  const filterClass = classId === undefined ? undefined : (await ownedClass(ctx.uid, classId)).id;
  const [exhibitions, boards] = await Promise.all([exhibitionsOf(ctx.uid, filterClass), boardsOf(ctx.uid, filterClass)]);
  const rosters = new Map<string, Student[]>();
  const studentsOf = async (id: string) => {if (!rosters.has(id)) rosters.set(id, await roster(id)); return rosters.get(id)!;};
  const artworks = await Promise.all(exhibitions.filter(row => row.pending_artworks).map(async room => {
    const doc = await db().doc(`exhibitions/${room.id}`).get(), students = await studentsOf(doc.data()!.classId);
    const items = await db().collection(`exhibitions/${room.id}/artworks`).where('status', '==', 'pending').limit(LIST).get();
    return items.docs.map(item => ({exhibition: room.title, exhibition_id: room.id, artwork_id: item.id, title: maskNames(String(item.data().title ?? ''), students), student: label(students, item.data().studentId), uploaded_at: item.data().createdAt}));
  }));
  const posts = await Promise.all(boards.filter(row => row.pending_posts).map(async board => {
    const doc = await db().doc(`participationBoards/${board.id}`).get(), students = await studentsOf(doc.data()!.classId);
    const items = await db().collection(`participationBoards/${board.id}/posts`).where('status', '==', 'pending').limit(LIST).get();
    return items.docs.filter(item => !item.data().deleted).map(item => ({board: board.title, board_id: board.id, post_id: item.id, title: maskNames(String(item.data().title ?? ''), students), preview: maskNames(String(item.data().body ?? '').slice(0, 120), students), student: item.data().authorStudentId ? label(students, item.data().authorStudentId) : '선생님', posted_at: item.data().createdAt}));
  }));
  return {artworks: artworks.flat(), posts: posts.flat(), note: '사진·영상 원본은 모두의 교실 화면에서 확인해 주세요.'};
}

async function storageView(ctx: BearerContext) {
  const plan = await teacherStorage(ctx.uid, 30_000);
  return {
    quota: formatStorage(plan.quotaBytes), used: formatStorage(plan.usedBytes), reserved: formatStorage(plan.reservedBytes), remaining: formatStorage(plan.remainingBytes),
    percent: Math.round(plan.usedBytes / Math.max(1, plan.quotaBytes) * 100), level: plan.level, period_end: plan.periodEnd, days_left: plan.daysLeft,
    categories: Object.fromEntries(Object.entries(plan.categories ?? {}).map(([key, bytes]) => [key, formatStorage(Number(bytes) || 0)])),
  };
}

export async function callClassroomTool(name: string, args: Data, ctx: BearerContext) {
  switch (name) {
    case 'get_signals': return signals(ctx);
    case 'get_storage': return storageView(ctx);
    case 'list_exhibitions': return {exhibitions: (await exhibitionsOf(ctx.uid, args.class_id === undefined ? undefined : (await ownedClass(ctx.uid, args.class_id)).id)).slice(0, LIST * 2)};
    case 'list_boards': return {boards: (await boardsOf(ctx.uid, args.class_id === undefined ? undefined : (await ownedClass(ctx.uid, args.class_id)).id)).slice(0, LIST * 2)};
    case 'get_moderation_queue': return moderationQueue(ctx, args.class_id);
    case 'get_quiz_status': return quizStatus(ctx, args.class_id);
    case 'get_review_status': return reviewStatus(ctx, args.class_id);
    case 'get_playground_status': return playgroundStatus(ctx, args.class_id);
    case 'get_points': return points(ctx, args.class_id);
    case 'list_card_sets': return cardSets(ctx, args.class_id);
    case 'list_class_tools': return classTools(ctx, args.class_id);
  }
  throw new BerryError(`알 수 없는 도구예요: ${name}`, 404, 'not_found');
}
