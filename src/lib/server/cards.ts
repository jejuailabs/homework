import 'server-only';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { FieldPath } from 'firebase-admin/firestore';
import { db } from './admin';
import { assertOrigin, getContext, type Context } from './auth';
import { ApiError, id, text } from './policy';
import { cardsAiDraft } from './cards-ai';
import { CARD_DUE_GRACE_MS, CARD_REVIEW_SESSION, buildCardChoices, buildTestQuestions, cardAfterDue, cardDueState, cardMissList, cardReviewDate, cardReviewStates, dueCardIds, isTestOvertime, nextCardReview, recordCardMisses, summarizeCardMisses, testTimeLimit } from '../cards-logic';
import { answersReleased, assertDueOpen, canStudyDistribution, distributionPatch, CARD_LIST_LIMIT, cardAnswer, cardDirection, cardMode, cardMutationFingerprint, cardType, emptyModeCounts, expectedCardVersion, isCorrectCardAnswer, lateMark, object, ownsCardResource, parseAfterDue, parseCards, parseDueAt, parseRequirements, parseTestSettings, publicProgress, reportStudentIds, widenedTargets, studyResponses, testAnswers, type CardCoverage } from './cards-policy';
import type { CardDirection, CardDistribution, CardDistributionSummary, CardEntry, CardProgress, CardReportStudent, CardReviewItem, CardSet, CardSetSummary, CardSnapshot, CardTestAttempt, CardTestQuestion, CardTestResult } from '../cards-types';

type Data = Record<string, any>;
type Distribution = CardDistribution & { ownerUid: string; cardIds: string[]; targetStudents: { id: string; name: string; number: number }[] };
type Attempt = { id: string; distributionId: string; studentId: string; classId: string; versionId: string; status: 'started' | 'submitted'; number: number; retryWrong: boolean; questions: CardTestQuestion[]; score: number | null; results: CardTestResult[]; startedAt: string; submittedAt: string | null; fingerprint: string | null; timeLimitSeconds?: number | null; overtime?: boolean; direction?: CardDirection };
const now = () => new Date().toISOString();
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const setRef = (setId: unknown) => db().doc(`cardSets/${id(setId)}`);
const folderRef = (folderId: unknown) => db().doc(`cardFolders/${id(folderId)}`);
const distributionRef = (distributionId: unknown) => db().doc(`cardClassSets/${id(distributionId)}`);
const progressRef = (distributionId: string, studentId: string) => db().doc(`cardProgress/${id(distributionId)}_${id(studentId)}`);
const versionRef = (versionId: unknown) => db().doc(`cardSetVersions/${id(versionId)}`);
/** One small index per student of cards missed across all their sets, so the list never reads every snapshot to find them. */
const missRef = (classId: string, studentId: string) => db().doc(`cardMisses/${id(classId)}_${id(studentId)}`);
const REVIEW_SET_LIMIT = 5; // One review tap loads at most this many full set snapshots.
const asDistribution = (snap: FirebaseFirestore.DocumentSnapshot) => ({ ...snap.data(), id: snap.id }) as Distribution;
const asAttempt = (snap: FirebaseFirestore.DocumentSnapshot) => ({ ...snap.data(), id: snap.id }) as Attempt;
function mutationRequest(ctx: Context, operation: string, input: Data) {
  if (input.requestId === undefined) return null;
  const requestId = id(input.requestId, '저장 요청 ID'), { requestId: _requestId, ...payload } = input;
  return { ref: db().doc(`cardMutationRequests/${digest([ctx.uid, operation, requestId])}`), fingerprint: cardMutationFingerprint(payload) };
}
function sameRequest(receipt: FirebaseFirestore.DocumentSnapshot, fingerprint: string) {
  if (receipt.exists && receipt.data()!.fingerprint !== fingerprint) throw new ApiError(409, '같은 요청 ID에 다른 내용을 저장할 수 없어요.', 'REQUEST_CONFLICT');
}

async function body(request: Request): Promise<Data> {
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > 800_000) throw new ApiError(413, '입력 내용이 너무 커요. 세트를 나누어 주세요.');
  try { return object(raw ? JSON.parse(raw) : {}); } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, '입력 내용을 확인해 주세요.'); }
}
function teacher(ctx: Context) { if (ctx.role === 'student') throw new ApiError(403, '선생님만 사용할 수 있어요.', 'FORBIDDEN'); }
function student(ctx: Context): asserts ctx is Context & { classId: string; studentId: string } {
  if (ctx.role !== 'student' || !ctx.classId || !ctx.studentId) throw new ApiError(403, '학생 화면에서 이용해 주세요.', 'FORBIDDEN');
}
function owner(ctx: Context, value: { ownerUid: string } | undefined) {
  if (!value || !ownsCardResource(ctx, value)) throw new ApiError(404, '항목을 찾을 수 없어요.', 'NOT_FOUND');
}
async function managedClass(ctx: Context, classId: string, tx?: FirebaseFirestore.Transaction) {
  teacher(ctx);
  const ref = db().doc(`classes/${id(classId)}`), snap = tx ? await tx.get(ref) : await ref.get();
  owner(ctx, snap.data() as { ownerUid: string } | undefined);
  return snap.data()!;
}
function setSummary(snap: FirebaseFirestore.DocumentSnapshot): CardSetSummary {
  const value = snap.data()!;
  return { id: snap.id, title: value.title, description: value.description, type: value.type, cardCount: value.cardCount, folderId: value.folderId, version: value.version, versionId: value.versionId, archived: !!value.archived, createdAt: value.createdAt, updatedAt: value.updatedAt };
}
function distributionSummary(value: Distribution): CardDistributionSummary {
  return { id: value.id, classId: value.classId, className: value.className, setId: value.setId, setVersion: value.setVersion, versionId: value.versionId, title: value.title, type: value.type, cardCount: value.cardCount, targetCount: value.targetCount, requiredModes: value.requiredModes, test: value.test, dueAt: value.dueAt, afterDue: cardAfterDue(value), allStudents: !!value.allStudents, active: value.active, createdAt: value.createdAt, updatedAt: value.updatedAt };
}
function visibleDistribution(value: Distribution, ctx: Context): CardDistribution {
  return { ...distributionSummary(value), snapshot: value.snapshot, targetStudentIds: ctx.role === 'student' ? [ctx.studentId!] : value.targetStudentIds };
}
function progress(value: Data | undefined, distribution: Distribution): CardProgress {
  // List queries load the small ID index, never card fronts, backs or examples.
  const snapshot = distribution.snapshot ?? { title: '', description: '', type: distribution.type, cards: distribution.cardIds.map(cardId => ({ id: cardId } as CardEntry)) };
  return publicProgress(value, snapshot, distribution.requiredModes, distribution.test, { dueAt: distribution.dueAt, afterDue: cardAfterDue(distribution) });
}
function emptyProgress(ctx: Context & { classId: string; studentId: string }, distribution: Distribution): Data {
  return { distributionId: distribution.id, ownerUid: distribution.ownerUid, classId: ctx.classId, studentId: ctx.studentId, counts: emptyModeCounts(), correctCounts: emptyModeCounts(), coverage: { memorize: {}, recall: {}, spell: {} }, cardStates: {}, mistakes: {}, attempts: 0, bestScore: null, latestScore: null, starredCardIds: [], lastPosition: null, activeAttemptId: null, lastSubmittedAttemptId: null, updatedAt: null, lateAt: null };
}
async function loadDistribution(ctx: Context, distributionId: string, tx?: FirebaseFirestore.Transaction, allowClosed = false): Promise<Distribution> {
  const ref = distributionRef(distributionId), snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists) throw new ApiError(404, '배부한 세트를 찾을 수 없어요.', 'NOT_FOUND');
  const value = asDistribution(snap);
  if (ctx.role !== 'student') {
    owner(ctx, value);
    await managedClass(ctx, value.classId, tx);
    return value;
  }
  student(ctx);
  if (!canStudyDistribution(ctx, { ...value, active: allowClosed || value.active })) throw new ApiError(404, '우리 반에 나눠 준 세트를 찾을 수 없어요.', 'NOT_FOUND');
  const refs = [db().doc(`classes/${ctx.classId}`), db().doc(`classes/${ctx.classId}/students/${ctx.studentId}`), db().doc(`users/${ctx.uid}`)];
  const [cls, pupil, profile] = await Promise.all(refs.map(reference => tx ? tx.get(reference) : reference.get()));
  if (!cls.exists || cls.data()?.ownerUid !== value.ownerUid || !pupil.exists || pupil.data()?.disabled || pupil.data()?.authUid !== ctx.uid || !profile.exists || profile.data()?.disabled || profile.data()?.studentId !== ctx.studentId || profile.data()?.classId !== ctx.classId || profile.data()?.role !== 'student') throw new ApiError(403, '학생 코드를 선생님께 다시 확인해 주세요.', 'STUDENT_UNAVAILABLE');
  return value;
}
function pageQuery(collection: string, field: string, value: string, cursor: string | null) {
  // The automatic ascending field index already ends in ascending __name__.
  // Keep one equality field plus document-ID order so pagination needs no composite index.
  let query = db().collection(collection).where(field, '==', value).orderBy(FieldPath.documentId());
  if (cursor) query = query.startAfter(id(cursor, '목록 위치'));
  return query.limit(CARD_LIST_LIMIT + 1);
}
const folderValue = (snap: FirebaseFirestore.DocumentSnapshot) => ({ id: snap.id, name: snap.data()!.name, createdAt: snap.data()!.createdAt, updatedAt: snap.data()!.updatedAt });

async function library(ctx: Context, request: Request) {
  teacher(ctx);
  const params = new URL(request.url).searchParams;
  const [sets, folders] = await Promise.all([pageQuery('cardSets', 'ownerUid', ctx.uid, params.get('cursor')).get(), pageQuery('cardFolders', 'ownerUid', ctx.uid, params.get('folderCursor')).get()]);
  const visibleSets = sets.docs.slice(0, CARD_LIST_LIMIT), visibleFolders = folders.docs.slice(0, CARD_LIST_LIMIT);
  return json({ sets: visibleSets.map(setSummary), folders: visibleFolders.map(folderValue), nextCursor: sets.size > CARD_LIST_LIMIT ? visibleSets.at(-1)!.id : null, nextFolderCursor: folders.size > CARD_LIST_LIMIT ? visibleFolders.at(-1)!.id : null });
}
async function folders(ctx: Context, request: Request, folderId?: string) {
  teacher(ctx);
  if (request.method === 'GET' && !folderId) {
    const result = await pageQuery('cardFolders', 'ownerUid', ctx.uid, new URL(request.url).searchParams.get('cursor')).get();
    const rows = result.docs.slice(0, CARD_LIST_LIMIT);
    return json({ folders: rows.map(folderValue), nextCursor: result.size > CARD_LIST_LIMIT ? rows.at(-1)!.id : null });
  }
  const input = request.method === 'DELETE' ? {} : await body(request);
  const name = request.method === 'DELETE' ? '' : text(input.name, '폴더 이름', 80);
  if (!folderId && request.method === 'POST') {
    const stamp = now(), ref = db().collection('cardFolders').doc();
    const value = { ownerUid: ctx.uid, name, createdAt: stamp, updatedAt: stamp };
    await ref.create(value);
    return json({ folder: { id: ref.id, name, createdAt: stamp, updatedAt: stamp } }, 201);
  }
  if (!folderId || !['PATCH', 'DELETE'].includes(request.method)) throw new ApiError(405, '지원하지 않는 요청이에요.', 'METHOD');
  return db().runTransaction(async tx => {
    const ref = folderRef(folderId), snap = await tx.get(ref);
    owner(ctx, snap.data() as { ownerUid: string } | undefined);
    if (request.method === 'DELETE') {
      const contents = await tx.get(db().collection('cardSets').where('folderId', '==', folderId).limit(1));
      if (!contents.empty) throw new ApiError(409, '보관된 세트까지 모두 다른 곳으로 옮긴 뒤 폴더를 삭제해 주세요.', 'FOLDER_NOT_EMPTY');
      tx.delete(ref);
      return json({ ok: true });
    }
    const updatedAt = now();
    tx.update(ref, { name, updatedAt });
    return json({ folder: { ...folderValue(snap), name, updatedAt } });
  });
}
async function checkFolder(ctx: Context, folderId: string | null, tx: FirebaseFirestore.Transaction) {
  if (!folderId) return;
  const snap = await tx.get(folderRef(folderId));
  owner(ctx, snap.data() as { ownerUid: string } | undefined);
}
async function detailSet(ctx: Context, setId: string) {
  teacher(ctx);
  const snap = await setRef(setId).get();
  owner(ctx, snap.data() as { ownerUid: string } | undefined);
  const version = await versionRef(snap.data()!.versionId).get();
  if (!version.exists) throw new ApiError(409, '세트 버전을 확인해 주세요.', 'VERSION_MISSING');
  return json({ set: { ...setSummary(snap), cards: version.data()!.cards } });
}
async function saveSet(ctx: Context, request: Request, setId?: string, duplicate = false) {
  teacher(ctx);
  const input = await body(request), ref = duplicate || !setId ? db().collection('cardSets').doc() : setRef(setId);
  const requestState = mutationRequest(ctx, duplicate ? `sets/${setId}/duplicate` : setId ? `sets/${setId}/save` : 'sets/create', input);
  const result = await db().runTransaction(async tx => {
    if (requestState) {
      const receipt = await tx.get(requestState.ref);
      sameRequest(receipt, requestState.fingerprint);
      if (receipt.exists) {
        const retained = receipt.data()!.result, version = await tx.get(versionRef(retained.versionId));
        owner(ctx, version.data() as { ownerUid: string } | undefined);
        return { ...retained, cards: version.data()!.cards } as CardSet;
      }
    }
    const receiptFor = (value: CardSet & { ownerUid?: string }) => {
      if (requestState) {
        const { cards: _cards, ...retained } = value;
        tx.create(requestState.ref, { ownerUid: ctx.uid, fingerprint: requestState.fingerprint, result: retained, createdAt: now() });
      }
      return value;
    };
    const existing = setId ? await tx.get(setRef(setId)) : null;
    if (existing) owner(ctx, existing.data() as { ownerUid: string } | undefined);
    const old = existing?.data();
    const stamp = now();
    if (old && !duplicate && input.action !== undefined) {
      if (!['archive', 'restore', 'move'].includes(input.action)) throw new ApiError(400, '세트 변경 방법을 확인해 주세요.');
      const folderId = input.action === 'move' ? (input.folderId === null ? null : id(input.folderId)) : old.folderId;
      await checkFolder(ctx, folderId, tx);
      const updated = { ...old, folderId, archived: input.action === 'archive' ? true : input.action === 'restore' ? false : old.archived, updatedAt: stamp };
      const version = await tx.get(versionRef(old.versionId));
      tx.update(ref, updated);
      if (folderId) tx.update(folderRef(folderId), { updatedAt: stamp });
      return receiptFor({ ...updated, id: ref.id, cards: version.data()!.cards } as CardSet);
    }
    if (old && !duplicate && input.expectedVersion !== old.version) throw new ApiError(409, '다른 화면에서 수정된 세트예요. 새로 열어 확인해 주세요.', 'STALE_VERSION');
    if (old && duplicate) expectedCardVersion(input.expectedVersion, old.version);
    const previousVersion = old ? await tx.get(versionRef(old.versionId)) : null;
    const cards = duplicate ? parseCards(previousVersion!.data()!.cards.map((card: CardEntry) => ({ ...card, id: randomUUID() }))) : parseCards(input.cards ?? previousVersion?.data()?.cards);
    const title = text(input.title ?? (duplicate ? `${old!.title} (복사)`.slice(0, 120) : old?.title), '세트 제목', 120);
    const description = text(input.description ?? old?.description, '세트 설명', 2000, true);
    const type = cardType(input.type ?? old?.type);
    const folderId = input.folderId === undefined ? old?.folderId ?? null : input.folderId === null ? null : id(input.folderId);
    await checkFolder(ctx, folderId, tx);
    const version = old && !duplicate ? old.version + 1 : 1;
    const versionId = `${ref.id}_v${version}`;
    const value = { ownerUid: ctx.uid, title, description, type, cardCount: cards.length, folderId, version, versionId, archived: duplicate ? false : old?.archived ?? false, createdAt: old && !duplicate ? old.createdAt : stamp, updatedAt: stamp };
    tx.create(versionRef(versionId), { ownerUid: ctx.uid, setId: ref.id, version, title, description, type, cards, createdAt: stamp });
    if (old && !duplicate) tx.update(ref, value); else tx.create(ref, value);
    if (folderId) tx.update(folderRef(folderId), { updatedAt: stamp });
    return receiptFor({ ...value, id: ref.id, cards });
  });
  const { ownerUid: _ownerUid, ...set } = result as CardSet & { ownerUid: string };
  return json({ set }, duplicate || !setId ? 201 : 200);
}

/** targetCount is the count at distribution. While a set is open to all students the real number moves with the roster, so it is worked out on read. */
async function liveTargetCounts<T extends Pick<Distribution, 'allStudents' | 'targetStudentIds' | 'targetCount'>>(classId: string, rows: T[]) {
  if (!rows.some(row => row.allStudents)) return rows;
  const roster = await db().collection(`classes/${classId}/students`).select('disabled').get(), activeIds = roster.docs.filter(pupil => !pupil.data().disabled).map(pupil => pupil.id);
  return rows.map(row => row.allStudents ? { ...row, targetCount: reportStudentIds(row, activeIds).length } : row);
}
async function distributions(ctx: Context, request: Request) {
  teacher(ctx);
  if (request.method === 'GET') {
    const params = new URL(request.url).searchParams, classId = id(params.get('classId'), '우리 반');
    await managedClass(ctx, classId);
    const result = await pageQuery('cardClassSets', 'classId', classId, params.get('cursor')).select('classId', 'className', 'setId', 'setVersion', 'versionId', 'ownerUid', 'title', 'type', 'cardCount', 'targetCount', 'targetStudentIds', 'requiredModes', 'test', 'dueAt', 'afterDue', 'allStudents', 'active', 'createdAt', 'updatedAt').get();
    const rows = result.docs.slice(0, CARD_LIST_LIMIT).map(asDistribution).filter(value => value.ownerUid === ctx.uid);
    return json({ distributions: (await liveTargetCounts(classId, rows)).map(distributionSummary), nextCursor: result.size > CARD_LIST_LIMIT ? rows.at(-1)?.id ?? null : null });
  }
  const input = await body(request), classId = id(input.classId), ref = db().collection('cardClassSets').doc();
  const requestState = mutationRequest(ctx, 'distributions/create', input);
  const distribution = await db().runTransaction(async tx => {
    const cls = await managedClass(ctx, classId, tx);
    if (requestState) {
      const receipt = await tx.get(requestState.ref);
      sameRequest(receipt, requestState.fingerprint);
      if (receipt.exists) return loadDistribution(ctx, receipt.data()!.distributionId, tx);
    }
    const set = await tx.get(setRef(input.setId));
    owner(ctx, set.data() as { ownerUid: string } | undefined);
    expectedCardVersion(input.expectedVersion, set.data()!.version);
    if (set.data()!.archived) throw new ApiError(409, '보관된 세트를 먼저 복구해 주세요.', 'SET_ARCHIVED');
    const [version, roster] = await Promise.all([tx.get(versionRef(set.data()!.versionId)), tx.get(db().collection(`classes/${classId}/students`))]);
    if (!version.exists) throw new ApiError(409, '세트 버전을 확인해 주세요.', 'VERSION_MISSING');
    const activeIds = roster.docs.filter(pupil => !pupil.data().disabled).map(pupil => pupil.id);
    const requested = input.targetStudentIds ?? [];
    if (!Array.isArray(requested) || requested.length > 300) throw new ApiError(400, '배부할 학생을 확인해 주세요.');
    // Saying nothing about the targets has always meant the whole class.
    if (input.allStudents !== undefined && typeof input.allStudents !== 'boolean') throw new ApiError(400, '배부할 학생을 확인해 주세요.');
    const allStudents: boolean = input.allStudents ?? !requested.length;
    const targetStudentIds: string[] = allStudents || !requested.length ? activeIds : requested.map(value => id(value));
    if (!targetStudentIds.length || new Set(targetStudentIds).size !== targetStudentIds.length || targetStudentIds.some(value => !activeIds.includes(value))) throw new ApiError(400, '우리 반의 이용 가능한 학생을 선택해 주세요.', 'DISTRIBUTION_TARGETS');
    const data = version.data()!, snapshot: CardSnapshot = { title: data.title, description: data.description, type: data.type, cards: data.cards };
    const requiredModes = parseRequirements(input.requiredModes, snapshot.cards.length), test = parseTestSettings(input.test, snapshot.cards.length), dueAt = parseDueAt(input.dueAt), afterDue = parseAfterDue(input.afterDue);
    if (test.answerRelease === 'after-due' && !dueAt) throw new ApiError(400, '마감 후 정답 공개에는 마감 날짜가 필요해요.');
    const stamp = now();
    const targetStudents = roster.docs.filter(pupil => targetStudentIds.includes(pupil.id)).map(pupil => ({ id: pupil.id, name: String(pupil.data().name ?? ''), number: Number(pupil.data().number ?? 0) }));
    const value: Distribution = { id: ref.id, ownerUid: ctx.uid, classId, className: cls.name, setId: set.id, setVersion: set.data()!.version, versionId: version.id, title: snapshot.title, type: snapshot.type, cardCount: snapshot.cards.length, cardIds: snapshot.cards.map(card => card.id), targetStudentIds, targetStudents, targetCount: targetStudentIds.length, allStudents, requiredModes, test, dueAt, afterDue, active: true, snapshot, createdAt: stamp, updatedAt: stamp };
    tx.create(ref, value);
    if (requestState) tx.create(requestState.ref, { ownerUid: ctx.uid, fingerprint: requestState.fingerprint, distributionId: ref.id, createdAt: stamp });
    return value;
  });
  return json({ distribution: visibleDistribution(distribution, ctx) }, 201);
}
async function distributionDetail(ctx: Context, request: Request, distributionId: string) {
  if (request.method === 'PATCH') {
    teacher(ctx);
    const input = await body(request);
    const distribution = await db().runTransaction(async tx => {
      const value = await loadDistribution(ctx, distributionId, tx);
      const update: Data = distributionPatch(input, value), updatedAt = now();
      if (value.allStudents && update.allStudents === false) {
        const roster = await tx.get(db().collection(`classes/${value.classId}/students`));
        Object.assign(update, widenedTargets(value, roster.docs.filter(pupil => !pupil.data().disabled).map(pupil => ({ id: pupil.id, name: String(pupil.data().name ?? ''), number: Number(pupil.data().number ?? 0) }))));
      }
      tx.update(distributionRef(distributionId), { ...update, updatedAt });
      return { ...value, ...update, updatedAt };
    });
    return json({ distribution: visibleDistribution((await liveTargetCounts(distribution.classId, [distribution]))[0], ctx) });
  }
  const loaded = await loadDistribution(ctx, distributionId), distribution = ctx.role === 'student' ? loaded : (await liveTargetCounts(loaded.classId, [loaded]))[0];
  const state = ctx.role === 'student' ? await progressRef(distributionId, ctx.studentId!).get() : null;
  return json({ distribution: visibleDistribution(distribution, ctx), ...(ctx.role === 'student' ? { progress: progress(state?.data(), distribution), coverage: state?.data()?.coverage ?? { memorize: {}, recall: {}, spell: {} }, cardStates: cardReviewStates(state?.data()?.cardStates), serverTime: now() } : {}) });
}

async function studentList(ctx: Context, request: Request) {
  student(ctx);
  const selected = new URL(request.url).searchParams.get('classId');
  if (selected && selected !== ctx.classId) throw new ApiError(403, '우리 반 세트만 볼 수 있어요.', 'FORBIDDEN');
  const [result, cls, pupil, missed] = await Promise.all([
    pageQuery('cardClassSets', 'classId', ctx.classId, new URL(request.url).searchParams.get('cursor')).select('classId', 'className', 'setId', 'setVersion', 'versionId', 'ownerUid', 'title', 'type', 'cardCount', 'cardIds', 'targetCount', 'targetStudentIds', 'requiredModes', 'test', 'dueAt', 'afterDue', 'allStudents', 'active', 'createdAt', 'updatedAt').get(),
    db().doc(`classes/${ctx.classId}`).get(), db().doc(`classes/${ctx.classId}/students/${ctx.studentId}`).get(), missRef(ctx.classId, ctx.studentId).get(),
  ]);
  if (!cls.exists || !pupil.exists || pupil.data()?.disabled || pupil.data()?.authUid !== ctx.uid) throw new ApiError(403, '우리 반 정보를 확인해 주세요.', 'STUDENT_UNAVAILABLE');
  const page = result.docs.slice(0, CARD_LIST_LIMIT);
  const rows = page.map(asDistribution).filter(value => canStudyDistribution(ctx, value) && cls.data()!.ownerUid === value.ownerUid);
  const states = rows.length ? await db().getAll(...rows.map(value => progressRef(value.id, ctx.studentId))) : [];
  const reviewable = new Set(rows.filter(value => cardDueState(value, Date.now(), CARD_DUE_GRACE_MS) !== 'lock').map(value => value.id));
  return json({ distributions: rows.map((value, index) => ({ ...distributionSummary(value), progress: progress(states[index]?.data(), value) })), review: summarizeCardMisses(missed.data()?.misses, cardReviewDate(), reviewable), profile: { id: ctx.studentId, name: pupil.data()!.name, character: pupil.data()!.character ?? 'cat', className: cls.data()!.name }, nextCursor: result.size > CARD_LIST_LIMIT ? page.at(-1)!.id : null, serverTime: now() });
}
function progressPreferences(input: Data, distribution: Distribution) {
  const update: Data = {}, ids = new Set(distribution.snapshot.cards.map(card => card.id));
  if (input.starredCardIds !== undefined) {
    if (!Array.isArray(input.starredCardIds) || input.starredCardIds.length > ids.size) throw new ApiError(400, '별표 카드를 확인해 주세요.');
    const starred = input.starredCardIds.map((value: unknown) => id(value));
    if (new Set(starred).size !== starred.length || starred.some((value: string) => !ids.has(value))) throw new ApiError(400, '별표 카드가 세트에 없어요.');
    update.starredCardIds = starred;
  }
  if (input.lastPosition !== undefined) {
    if (input.lastPosition === null) update.lastPosition = null;
    else {
      const value = object(input.lastPosition), mode = cardMode(value.mode), cardId = id(value.cardId);
      if (!ids.has(cardId)) throw new ApiError(400, '이어서 학습할 카드를 확인해 주세요.');
      update.lastPosition = { mode, cardId };
    }
  }
  return update;
}
async function updateProgress(ctx: Context, request: Request, distributionId: string) {
  student(ctx);
  const input = await body(request);
  return db().runTransaction(async tx => {
    const distribution = await loadDistribution(ctx, distributionId, tx), ref = progressRef(distributionId, ctx.studentId), saved = await tx.get(ref);
    const state = { ...(saved.data() ?? emptyProgress(ctx, distribution)), ...progressPreferences(input, distribution), updatedAt: now() };
    tx.set(ref, state);
    return json({ progress: progress(state, distribution) });
  });
}
function saveMisses(tx: FirebaseFirestore.Transaction, ctx: Context & { classId: string; studentId: string }, snap: FirebaseFirestore.DocumentSnapshot, distributionId: string, missed: string[], cleared: string[], today: string, stamp: string) {
  tx.set(missRef(ctx.classId, ctx.studentId), { classId: ctx.classId, studentId: ctx.studentId, misses: recordCardMisses(snap.data()?.misses, distributionId, missed, cleared, today), updatedAt: stamp });
}
async function study(ctx: Context, request: Request, distributionId: string) {
  student(ctx);
  const input = await body(request), requestId = id(input.requestId, '저장 요청 ID'), mode = cardMode(input.mode), direction = cardDirection(input.direction);
  if (input.review !== undefined && typeof input.review !== 'boolean') throw new ApiError(400, '복습 설정을 확인해 주세요.');
  const review = input.review === true;
  if (review && mode === 'memorize') throw new ApiError(400, '복습은 리콜이나 스펠로 해 주세요.');
  return db().runTransaction(async tx => {
    const distribution = await loadDistribution(ctx, distributionId, tx), ref = progressRef(distributionId, ctx.studentId), batchRef = ref.collection('batches').doc(requestId);
    const [saved, batch] = await Promise.all([tx.get(ref), tx.get(batchRef)]);
    // A batch that already landed keeps its receipt even if the teacher has since changed the range or direction.
    // A review is not assignment work: any card of the set in any direction, and no credit toward the required counts.
    const requirements = batch.exists || review ? { ...distribution.requiredModes, [mode]: { requiredCount: 0, direction, rangeStart: 1, rangeEnd: distribution.snapshot.cards.length } } : distribution.requiredModes;
    const responses = studyResponses(input.responses, distribution.snapshot, mode, direction, requirements);
    const preferences = progressPreferences(input, distribution);
    if (input.lastCardId !== undefined) {
      const cardId = id(input.lastCardId);
      if (!responses.some(response => response.cardId === cardId)) throw new ApiError(400, '마지막 학습 카드를 확인해 주세요.');
      preferences.lastPosition = { mode, cardId };
    }
    const fingerprint = digest({ mode, direction, responses: responses.map(({ cardId, answer }) => ({ cardId, answer })), preferences, ...(review ? { review } : {}) });
    if (batch.exists) {
      if (batch.data()!.fingerprint !== fingerprint) throw new ApiError(409, '같은 요청 ID에 다른 답을 저장할 수 없어요.', 'REQUEST_CONFLICT');
      return json({ progress: progress(saved.data(), distribution), results: responses.map(({ cardId, correct, expectedAnswer }) => ({ cardId, correct, expectedAnswer })), duplicate: true });
    }
    // Checked after the receipt, so a retry of an answer batch that already landed still gets its result.
    assertDueOpen(distribution);
    const state = saved.data() ?? emptyProgress(ctx, distribution);
    const coverage = state.coverage as CardCoverage, today = cardReviewDate(), cardStates = cardReviewStates(state.cardStates);
    for (const response of responses) {
      if (!review) {
        state.counts[mode]++;
        if (response.correct) {
          state.correctCounts[mode]++;
          coverage[mode][response.cardId] = Math.min(10, (coverage[mode][response.cardId] ?? 0) + 1);
        }
      }
      if (!response.correct) state.mistakes[response.cardId] = (state.mistakes[response.cardId] ?? 0) + 1;
      // Memorize is self-marked, so only answers the server graded move mastery and the review date.
      if (mode !== 'memorize') cardStates[response.cardId] = nextCardReview(cardStates[response.cardId], response.correct, today);
    }
    const missed = responses.filter(response => !response.correct).map(response => response.cardId), cleared = review ? responses.filter(response => response.correct).map(response => response.cardId) : [];
    const misses = missed.length || cleared.length ? await tx.get(missRef(ctx.classId, ctx.studentId)) : null;
    const updatedAt = now();
    Object.assign(state, preferences, { cardStates, updatedAt, lateAt: review ? state.lateAt ?? null : lateMark(state.lateAt, distribution, updatedAt) });
    const results = responses.map(({ cardId, correct, expectedAnswer }) => ({ cardId, correct, expectedAnswer }));
    tx.set(ref, state);
    if (misses) saveMisses(tx, ctx, misses, distributionId, missed, cleared, today, updatedAt);
    // Keep a small receipt for the lifetime of the record: expiring it could count an old retry twice.
    // Raw practice answers are graded in memory and are not retained in these receipts.
    tx.create(batchRef, { distributionId, studentId: ctx.studentId, versionId: distribution.versionId, fingerprint, createdAt: state.updatedAt });
    return json({ progress: progress(state, distribution), results });
  });
}

function visibleAttempt(value: Attempt, distribution: Distribution, isTeacher = false): CardTestAttempt {
  const answersVisible = value.status === 'submitted' && (isTeacher || answersReleased(distribution.test, distribution.dueAt));
  return { id: value.id, status: value.status, number: value.number, retryWrong: value.retryWrong, questions: value.questions, score: value.score, answersVisible, ...(value.status === 'submitted' ? { results: value.results.map(result => answersVisible ? result : { questionId: result.questionId, answer: result.answer, correct: result.correct }) } : {}), startedAt: value.startedAt, submittedAt: value.submittedAt, timeLimitSeconds: value.timeLimitSeconds ?? null, ...(isTeacher && value.overtime ? { overtime: true } : {}) };
}
function shuffled<T>(values: T[]) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) { const other = randomInt(index + 1); [result[index], result[other]] = [result[other], result[index]]; }
  return result;
}
const secureRandom = (max: number) => randomInt(max);
async function tests(ctx: Context, request: Request, distributionId: string) {
  student(ctx);
  if (request.method === 'GET') {
    const distribution = await loadDistribution(ctx, distributionId);
    const result = await progressRef(distributionId, ctx.studentId).collection('tests').get();
    return json({ attempts: result.docs.map(asAttempt).sort((a, b) => b.number - a.number).map(value => visibleAttempt(value, distribution)), serverTime: now() });
  }
  const input = await body(request), requestId = id(input.requestId, '응시 요청 ID');
  if (input.retryWrong !== undefined && typeof input.retryWrong !== 'boolean') throw new ApiError(400, '오답 재시험 설정을 확인해 주세요.');
  const retryWrong = !!input.retryWrong;
  return db().runTransaction(async tx => {
    const distribution = await loadDistribution(ctx, distributionId, tx), ref = progressRef(distributionId, ctx.studentId), requestRef = ref.collection('testRequests').doc(requestId);
    const [saved, previousRequest] = await Promise.all([tx.get(ref), tx.get(requestRef)]), state = saved.data() ?? emptyProgress(ctx, distribution);
    if (previousRequest.exists) {
      if (previousRequest.data()!.retryWrong !== retryWrong) throw new ApiError(409, '같은 요청 ID에 다른 응시 설정을 사용할 수 없어요.', 'REQUEST_CONFLICT');
      const attempt = await tx.get(ref.collection('tests').doc(previousRequest.data()!.attemptId));
      return json({ attempt: visibleAttempt(asAttempt(attempt), distribution), progress: progress(state, distribution), serverTime: now() });
    }
    if (state.activeAttemptId) {
      const attempt = await tx.get(ref.collection('tests').doc(state.activeAttemptId));
      if (attempt.exists && attempt.data()!.status === 'started') {
        tx.create(requestRef, { attemptId: attempt.id, retryWrong, createdAt: now() });
        return json({ attempt: visibleAttempt(asAttempt(attempt), distribution), progress: progress(state, distribution), serverTime: now() });
      }
    }
    assertDueOpen(distribution);
    if (distribution.test.requireStudy && !progress(state, distribution).studyComplete) throw new ApiError(403, '필수 학습을 마친 뒤 테스트에 도전해 주세요.', 'STUDY_REQUIRED');
    if (state.attempts >= distribution.test.maxAttempts) throw new ApiError(409, '선생님이 정한 테스트 응시 횟수를 모두 사용했어요.', 'ATTEMPT_LIMIT');
    let cards = distribution.snapshot.cards;
    if (retryWrong) {
      if (!state.lastSubmittedAttemptId) throw new ApiError(409, '먼저 테스트를 완료해 주세요.', 'NO_PREVIOUS_TEST');
      const last = await tx.get(ref.collection('tests').doc(state.lastSubmittedAttemptId));
      const value = asAttempt(last), wrongIds = new Set(value.results.filter(result => !result.correct).map(result => value.questions.find(question => question.id === result.questionId)!.cardId));
      cards = cards.filter(card => wrongIds.has(card.id));
      if (!cards.length) throw new ApiError(409, '직전 테스트에 틀린 문제가 없어요.', 'NO_WRONG_ANSWERS');
    }
    const attemptRef = ref.collection('tests').doc(), stamp = now();
    // Distractors come from the whole snapshot, so a short retest of wrong answers still gets full choices.
    const questions = buildTestQuestions(shuffled(cards).slice(0, distribution.test.questionCount), distribution.snapshot.cards, distribution.test, randomUUID, secureRandom);
    const attempt: Attempt = { id: attemptRef.id, distributionId, studentId: ctx.studentId, classId: ctx.classId, versionId: distribution.versionId, status: 'started', number: state.attempts + 1, retryWrong, questions, score: null, results: [], startedAt: stamp, submittedAt: null, fingerprint: null, timeLimitSeconds: testTimeLimit(distribution.test), direction: distribution.test.direction };
    state.attempts++;
    state.activeAttemptId = attempt.id;
    state.updatedAt = stamp;
    state.lateAt = lateMark(state.lateAt, distribution, stamp);
    tx.create(attemptRef, attempt);
    tx.create(requestRef, { attemptId: attempt.id, retryWrong, createdAt: stamp });
    tx.set(ref, state);
    return json({ attempt: visibleAttempt(attempt, distribution), progress: progress(state, distribution), serverTime: stamp }, 201);
  });
}
async function submitTest(ctx: Context, request: Request, distributionId: string, attemptId: string) {
  student(ctx);
  const input = await body(request);
  return db().runTransaction(async tx => {
    const distribution = await loadDistribution(ctx, distributionId, tx), ref = progressRef(distributionId, ctx.studentId), attemptRef = ref.collection('tests').doc(id(attemptId));
    const [saved, savedAttempt] = await Promise.all([tx.get(ref), tx.get(attemptRef)]);
    if (!savedAttempt.exists) throw new ApiError(404, '테스트를 찾을 수 없어요.', 'NOT_FOUND');
    const attempt = asAttempt(savedAttempt), state = saved.data()!;
    if (attempt.distributionId !== distributionId || attempt.studentId !== ctx.studentId || attempt.classId !== ctx.classId || attempt.versionId !== distribution.versionId) throw new ApiError(409, '테스트 버전이 일치하지 않아요.', 'TEST_VERSION');
    const answers = testAnswers(input.answers, attempt.questions.map(question => question.id));
    const fingerprint = digest(attempt.questions.map(question => ({ questionId: question.id, answer: answers.get(question.id)! })));
    if (attempt.status === 'submitted') {
      if (attempt.fingerprint !== fingerprint) throw new ApiError(409, '이미 제출한 테스트의 답은 변경할 수 없어요.', 'TEST_SUBMITTED');
      return json({ attempt: visibleAttempt(attempt, distribution), progress: progress(state, distribution), duplicate: true });
    }
    if (state.activeAttemptId !== attempt.id) throw new ApiError(409, '현재 진행 중인 테스트를 확인해 주세요.', 'STALE_ATTEMPT');
    // Graded the way it was asked: a teacher may change the test direction while this attempt is open.
    const cards = new Map(distribution.snapshot.cards.map(card => [card.id, card])), direction = attempt.direction ?? distribution.test.direction;
    const results = attempt.questions.map(question => {
      const card = cards.get(question.cardId)!, answer = answers.get(question.id)!;
      return { questionId: question.id, answer, correct: isCorrectCardAnswer(card, direction, answer), expectedAnswer: cardAnswer(card, direction) };
    });
    const score = Math.round(results.filter(result => result.correct).length / results.length * 100), stamp = now();
    const today = cardReviewDate(), cardStates = cardReviewStates(state.cardStates), missed: string[] = [];
    for (const [index, result] of results.entries()) {
      const cardId = attempt.questions[index].cardId;
      cardStates[cardId] = nextCardReview(cardStates[cardId], result.correct, today);
      if (!result.correct) { state.mistakes[cardId] = (state.mistakes[cardId] ?? 0) + 1; missed.push(cardId); }
    }
    const misses = missed.length ? await tx.get(missRef(ctx.classId, ctx.studentId)) : null;
    const updated: Attempt = { ...attempt, status: 'submitted', score, results, fingerprint, submittedAt: stamp, ...(isTestOvertime(attempt.startedAt, attempt.timeLimitSeconds, Date.parse(stamp)) ? { overtime: true } : {}) };
    Object.assign(state, { cardStates, activeAttemptId: null, lastSubmittedAttemptId: attempt.id, bestScore: Math.max(state.bestScore ?? 0, score), latestScore: score, updatedAt: stamp, lateAt: lateMark(state.lateAt, distribution, stamp) });
    tx.update(attemptRef, updated);
    tx.set(ref, state);
    if (misses) saveMisses(tx, ctx, misses, distributionId, missed, [], today, stamp);
    return json({ attempt: visibleAttempt(updated, distribution), progress: progress(state, distribution) });
  });
}
async function report(ctx: Context, distributionId: string) {
  teacher(ctx);
  const distribution = await loadDistribution(ctx, distributionId);
  const [roster, states] = await Promise.all([db().collection(`classes/${distribution.classId}/students`).get(), db().collection('cardProgress').where('distributionId', '==', distributionId).get()]);
  const pupils = new Map(roster.docs.map(pupil => [pupil.id, pupil.data()])), records = new Map(states.docs.filter(state => state.data().classId === distribution.classId).map(state => [state.data().studentId, state]));
  const activeIds = roster.docs.filter(pupil => !pupil.data().disabled).map(pupil => pupil.id);
  const students: CardReportStudent[] = await Promise.all(reportStudentIds(distribution, activeIds).map(async studentId => {
    const pupil = pupils.get(studentId), original = distribution.targetStudents?.find(value => value.id === studentId), record = records.get(studentId);
    const attempts = record ? await record.ref.collection('tests').get() : null;
    return { id: studentId, name: pupil?.name ?? original?.name ?? '삭제된 학생', number: pupil?.number ?? original?.number ?? 0, disabled: !pupil || !!pupil.disabled, progress: progress(record?.data(), distribution), attempts: (attempts?.docs ?? []).map(asAttempt).sort((a, b) => b.number - a.number).map(value => visibleAttempt(value, distribution, true)), mistakes: Object.entries(record?.data()?.mistakes ?? {}).map(([cardId, count]) => ({ cardId, count: count as number })).sort((a, b) => b.count - a.count), levels: Object.fromEntries(Object.entries(cardReviewStates(record?.data()?.cardStates)).map(([cardId, value]) => [cardId, value.l])) };
  }));
  return json({ distribution: visibleDistribution({ ...distribution, targetCount: students.length }, ctx), students: students.sort((a, b) => a.number - b.number) });
}

function reviewItem(distribution: Distribution, card: CardEntry, missedOn: string | null): CardReviewItem {
  const direction = distribution.requiredModes.recall?.direction ?? 'front-back';
  return { distributionId: distribution.id, title: distribution.title, direction, card, choices: buildCardChoices(card, distribution.snapshot.cards, direction, secureRandom), missedOn };
}
/** Cards for one review session: today's due cards in one set, or the newest misses across the student's sets. */
async function reviewCards(ctx: Context, request: Request) {
  student(ctx);
  const params = new URL(request.url).searchParams, today = cardReviewDate(), selected = params.get('distributionId'), week = params.get('week');
  if (selected) {
    const distribution = await loadDistribution(ctx, id(selected, '세트'));
    assertDueOpen(distribution);
    const saved = await progressRef(distribution.id, ctx.studentId).get(), cards = new Map(distribution.snapshot.cards.map(card => [card.id, card]));
    return json({ items: dueCardIds([...cards.keys()], cardReviewStates(saved.data()?.cardStates), today).map(cardId => reviewItem(distribution, cards.get(cardId)!, null)), serverTime: now() });
  }
  if (week !== null && !/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new ApiError(400, '복습할 주를 확인해 주세요.');
  const [cls, pupil, profile, index] = await db().getAll(db().doc(`classes/${ctx.classId}`), db().doc(`classes/${ctx.classId}/students/${ctx.studentId}`), db().doc(`users/${ctx.uid}`), missRef(ctx.classId, ctx.studentId));
  if (!cls.exists || !pupil.exists || pupil.data()?.disabled || pupil.data()?.authUid !== ctx.uid || !profile.exists || profile.data()?.disabled || profile.data()?.studentId !== ctx.studentId || profile.data()?.classId !== ctx.classId) throw new ApiError(403, '학생 코드를 선생님께 다시 확인해 주세요.', 'STUDENT_UNAVAILABLE');
  const rows = cardMissList(index.data()?.misses, today, undefined, week ?? undefined), chosen: typeof rows = [], sets = new Set<string>();
  // Newest misses first, but from no more than REVIEW_SET_LIMIT sets, so one tap never loads many full snapshots.
  for (const row of rows) {
    if (chosen.length >= CARD_REVIEW_SESSION) break;
    if (!sets.has(row.distributionId) && sets.size >= REVIEW_SET_LIMIT) continue;
    sets.add(row.distributionId); chosen.push(row);
  }
  const snaps = sets.size ? await db().getAll(...[...sets].map(distributionRef)) : [];
  const usable = new Map(snaps.filter(snap => snap.exists).map(asDistribution).filter(value => canStudyDistribution(ctx, value) && value.ownerUid === cls.data()!.ownerUid && cardDueState(value, Date.now(), CARD_DUE_GRACE_MS) !== 'lock').map(value => [value.id, value]));
  const items = chosen.flatMap(row => { const distribution = usable.get(row.distributionId), card = distribution?.snapshot.cards.find(entry => entry.id === row.cardId); return distribution && card ? [reviewItem(distribution, card, row.missedOn)] : []; });
  return json({ items, serverTime: now() });
}

export async function handleCards(request: Request, segments: string[] = []) {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) assertOrigin(request);
    const ctx = await getContext(request), [resource, resourceId, operation, operationId, action] = segments;
    if (segments.length > 5) throw new ApiError(404, '카드놀이 기능을 찾을 수 없어요.', 'NOT_FOUND');
    if (resourceId) id(resourceId);
    if (operationId) id(operationId);
    const method = request.method;
    if (resource === 'ai-draft' && segments.length === 1 && method === 'POST') return json(await cardsAiDraft(ctx, request));
    if (resource === 'library' && segments.length === 1 && method === 'GET') return await library(ctx, request);
    if (resource === 'student' && segments.length === 1 && method === 'GET') return await studentList(ctx, request);
    if (resource === 'review' && segments.length === 1 && method === 'GET') return await reviewCards(ctx, request);
    if (resource === 'folders' && segments.length <= 2 && ['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) return await folders(ctx, request, resourceId);
    if (resource === 'sets') {
      if (!resourceId && method === 'POST') return await saveSet(ctx, request);
      if (resourceId && segments.length === 2 && method === 'GET') return await detailSet(ctx, resourceId);
      if (resourceId && segments.length === 2 && method === 'PATCH') return await saveSet(ctx, request, resourceId);
      if (resourceId && operation === 'duplicate' && segments.length === 3 && method === 'POST') return await saveSet(ctx, request, resourceId, true);
    }
    if (resource === 'distributions' && resourceId && operation === 'games' && segments.length === 3) return await (await import('./cards-games')).cardGames(ctx, request, resourceId);
    if (resource === 'distributions') {
      if (!resourceId && ['GET', 'POST'].includes(method)) return await distributions(ctx, request);
      if (resourceId && segments.length === 2 && ['GET', 'PATCH'].includes(method)) return await distributionDetail(ctx, request, resourceId);
      if (resourceId && segments.length === 3) {
        if (operation === 'report' && method === 'GET') return await report(ctx, resourceId);
        if (operation === 'progress' && method === 'PATCH') return await updateProgress(ctx, request, resourceId);
        if (operation === 'study' && method === 'POST') return await study(ctx, request, resourceId);
        if (operation === 'tests' && ['GET', 'POST'].includes(method)) return await tests(ctx, request, resourceId);
      }
      if (resourceId && operation === 'tests' && operationId && action === 'submit' && segments.length === 5 && method === 'POST') return await submitTest(ctx, request, resourceId, operationId);
    }
    throw new ApiError(404, '카드놀이 기능을 찾을 수 없어요.', 'NOT_FOUND');
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message, code: error.code }, error.status);
    console.error('Cards operation failed', segments[0] ?? 'unknown', (error as { code?: string }).code ?? 'INTERNAL');
    return json({ error: '카드놀이 요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 'INTERNAL_ERROR' }, 500);
  }
}
