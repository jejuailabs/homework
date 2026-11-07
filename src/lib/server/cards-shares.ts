import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from './admin';
import type { Context } from './auth';
import { ApiError, id } from './policy';
import { object, publicProgress, reportStudentIds } from './cards-policy';
import { cardAfterDue } from '../cards-logic';
import { isShareToken, newShareToken, practiceWords, requiredStudyPercent, shareDays, shareExpiry, shareName, shareNameMode, shareNote, shareState, shareTokenHash } from './cards-share-policy';
import type { CardDistribution } from '../cards-types';

/**
 * 학부모 링크(`cardReportShares/{토큰 해시}`). 학생 1명 × 배부 1개, 읽기 전용, 기간(기본 14일·최대 60일)이 지나거나 회수하면 바로 닫힌다.
 * 원래 토큰은 만들 때 응답으로 한 번만 나가고 저장하지 않는다. 같은 학생에게 새로 만들면 이전 링크는 회수된다.
 * 열람 기록은 횟수(`views`)만 센다. IP·기기·시각은 남기지 않는다. 클라이언트 규칙은 모두 막혀 있고 서버만 읽고 쓴다.
 */
type Data = Record<string, any>;
type Distribution = CardDistribution & { ownerUid: string; targetStudents?: { id: string; name: string; number: number }[] };
export type CardShareRow = { id: string; studentId: string; state: 'active' | 'expired' | 'revoked'; expiresAt: string; createdAt: string; revokedAt: string | null; views: number; nameMode: string };
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } });
const sharesOf = (distributionId: string) => db().collection('cardReportShares').where('distributionId', '==', distributionId).limit(1000);
const SHARE_BATCH = 200, CREATE_PARALLEL = 20;
// The student's current link (`{distributionId}_{studentId}` → share ID). Every create reads and rewrites it in one transaction,
// so two creates at once for the same student serialize and leave exactly one open link.
const currentShareRef = (distributionId: string, studentId: string) => db().doc(`cardReportSharePointers/${id(distributionId)}_${id(studentId)}`);
const RATE_WINDOW = 600_000, RATE_TOTAL = 60, RATE_FAILED = 12;
const PUBLIC_HEADERS = { 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer' };

async function teacherDistribution(ctx: Context, distributionId: string) {
  if (ctx.role === 'student') throw new ApiError(403, '선생님만 사용할 수 있어요.', 'FORBIDDEN');
  const snap = await db().doc(`cardClassSets/${id(distributionId)}`).get();
  if (!snap.exists) throw new ApiError(404, '배부한 세트를 찾을 수 없어요.', 'NOT_FOUND');
  const value = { ...snap.data(), id: snap.id } as Distribution, cls = await db().doc(`classes/${value.classId}`).get();
  if (value.ownerUid !== ctx.uid || cls.data()?.ownerUid !== ctx.uid) throw new ApiError(404, '항목을 찾을 수 없어요.', 'NOT_FOUND');
  return value;
}
function row(doc: FirebaseFirestore.DocumentSnapshot): CardShareRow {
  const value = doc.data()!;
  return { id: doc.id, studentId: value.studentId, state: shareState(value), expiresAt: value.expiresAt, createdAt: value.createdAt, revokedAt: value.revokedAt ?? null, views: Number(value.views) || 0, nameMode: value.nameMode };
}
async function readInput(request: Request): Promise<Data> {
  const raw = await request.text();
  if (raw.length > 20_000) throw new ApiError(413, '입력 내용이 너무 커요.');
  try { return object(raw ? JSON.parse(raw) : {}); } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, '입력 내용을 확인해 주세요.'); }
}

/** Teacher routes under `distributions/{id}/shares`: GET list (no tokens), POST create, DELETE revoke one (`shares/{shareId}`) or all. */
export async function cardShares(ctx: Context, request: Request, distributionId: string, shareId?: string) {
  const distribution = await teacherDistribution(ctx, distributionId), method = request.method;
  if (method === 'GET' && !shareId) {
    const rows = (await sharesOf(distribution.id).get()).docs.filter(doc => doc.data().ownerUid === ctx.uid).map(row).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ shares: rows });
  }
  if (method === 'DELETE') {
    const stamp = new Date().toISOString(), docs = shareId ? [await db().doc(`cardReportShares/${id(shareId)}`).get()] : (await sharesOf(distribution.id).get()).docs;
    const open = docs.filter(doc => doc.exists && doc.data()!.ownerUid === ctx.uid && doc.data()!.distributionId === distribution.id && shareState(doc.data()!) === 'active');
    if (shareId && !docs[0].exists) throw new ApiError(404, '링크를 찾을 수 없어요.', 'NOT_FOUND');
    for (let index = 0; index < open.length; index += 400) { const batch = db().batch(); open.slice(index, index + 400).forEach(doc => batch.update(doc.ref, { revokedAt: stamp })); await batch.commit(); }
    return json({ revoked: open.length });
  }
  if (method !== 'POST' || shareId) throw new ApiError(404, '카드놀이 기능을 찾을 수 없어요.', 'NOT_FOUND');
  const input = await readInput(request), days = shareDays(input.days), nameMode = shareNameMode(input.nameMode), note = shareNote(input.note);
  const roster = await db().collection(`classes/${distribution.classId}/students`).select('name', 'number', 'disabled').get();
  const active = new Map(roster.docs.filter(doc => !doc.data().disabled).map(doc => [doc.id, doc.data()]));
  const eligible = reportStudentIds(distribution, [...active.keys()]).filter(studentId => active.has(studentId));
  let chosen: string[];
  if (input.studentIds === 'all') chosen = eligible;
  else {
    if (!Array.isArray(input.studentIds) || !input.studentIds.length || input.studentIds.length > SHARE_BATCH) throw new ApiError(400, '링크를 만들 학생을 골라 주세요.', 'SHARE_STUDENTS');
    chosen = [...new Set(input.studentIds.map((value: unknown) => id(value, '학생')))];
    if (chosen.some(studentId => !eligible.includes(studentId))) throw new ApiError(400, '이 세트를 받은 지금 우리 반 학생만 고를 수 있어요.', 'SHARE_STUDENTS');
  }
  if (!chosen.length) throw new ApiError(400, '링크를 만들 학생이 없어요.', 'SHARE_STUDENTS');
  if (chosen.length > SHARE_BATCH) chosen = chosen.slice(0, SHARE_BATCH);
  const stamp = new Date().toISOString(), expiresAt = shareExpiry(days);
  const links = chosen.map(studentId => {
    const pupil = active.get(studentId)!, token = newShareToken();
    return { token, studentId, number: Number(pupil.number) || 0, name: String(pupil.name ?? ''), record: { ownerUid: ctx.uid, classId: distribution.classId, distributionId: distribution.id, studentId, nameMode, displayName: shareName(pupil.name, nameMode), note, expiresAt, createdAt: stamp, revokedAt: null, views: 0 } };
  });
  // A new link replaces the student's open one: the old token cannot be shown again, so it should not stay usable.
  // One transaction per student: the current-link pointer, plus any open link made before pointers existed, are revoked with the create.
  let replaced = 0;
  const replace = (link: typeof links[number]) => db().runTransaction(async tx => {
    const pointer = currentShareRef(distribution.id, link.studentId);
    const [current, older] = await Promise.all([tx.get(pointer), tx.get(db().collection('cardReportShares').where('distributionId', '==', distribution.id).where('studentId', '==', link.studentId).limit(50))]);
    const pointed = current.data()?.shareId ? await tx.get(db().doc(`cardReportShares/${id(current.data()!.shareId)}`)) : null;
    const open = new Map([...older.docs, ...(pointed?.exists ? [pointed] : [])].filter(doc => doc.data()?.ownerUid === ctx.uid && shareState(doc.data()!) === 'active').map(doc => [doc.id, doc.ref]));
    open.forEach(ref => tx.update(ref, { revokedAt: stamp }));
    const shareId = shareTokenHash(link.token);
    tx.create(db().doc(`cardReportShares/${shareId}`), link.record);
    tx.set(pointer, { ownerUid: ctx.uid, distributionId: distribution.id, studentId: link.studentId, shareId, updatedAt: stamp });
    return open.size;
  });
  for (let index = 0; index < links.length; index += CREATE_PARALLEL) replaced += (await Promise.all(links.slice(index, index + CREATE_PARALLEL).map(replace))).reduce((sum, count) => sum + count, 0);
  return json({ links: links.sort((a, b) => a.number - b.number).map(link => ({ studentId: link.studentId, number: link.number, name: link.name, displayName: link.record.displayName, path: `/family/cards/${link.token}`, expiresAt })), replaced, expiresAt }, 201);
}

/** Share and reward counts for Berry: numbers only, never tokens or names. */
export async function cardShareCounts(distributionId: string, ownerUid: string) {
  const rows = (await db().collection('cardReportShares').where('distributionId', '==', distributionId).select('ownerUid', 'expiresAt', 'revokedAt', 'views').limit(1000).get()).docs.filter(doc => doc.data().ownerUid === ownerUid);
  return { active: rows.filter(doc => shareState(doc.data()) === 'active').length, opened: rows.filter(doc => shareState(doc.data()) === 'active' && Number(doc.data().views) > 0).length };
}

function clientAddress(request: Request) {
  return (request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
}
const rateRef = (kind: string, request: Request) => db().doc(`rateLimits/${createHash('sha256').update(`cards-parent-${kind}:${clientAddress(request)}:${Math.floor(Date.now() / RATE_WINDOW)}`).digest('hex')}`);
async function rateLimit(request: Request) {
  const total = rateRef('total', request), failed = rateRef('failed', request);
  await db().runTransaction(async tx => {
    const [all, misses] = await Promise.all([tx.get(total), tx.get(failed)]);
    if ((all.data()?.count ?? 0) >= RATE_TOTAL || (misses.data()?.count ?? 0) >= RATE_FAILED) throw new ApiError(429, '잠시 뒤 다시 열어 주세요.', 'RATE_LIMITED');
    tx.set(total, { count: (all.data()?.count ?? 0) + 1, expiresAt: Timestamp.fromMillis(Date.now() + 3_600_000) });
  });
}
async function notFound(request: Request): Promise<never> {
  await rateRef('failed', request).set({ count: FieldValue.increment(1), expiresAt: Timestamp.fromMillis(Date.now() + 3_600_000) }, { merge: true });
  // One answer for a wrong, expired or revoked link, so the page never says which.
  throw new ApiError(404, '열 수 없는 링크예요. 기간이 끝났거나 선생님이 닫았을 수 있어요.', 'NOT_FOUND');
}

/** GET `/api/cards-parent/{token}` with no login: one student's progress on one distribution, nothing about anyone else. */
export async function publicCardShare(request: Request, token: string) {
  try {
    await rateLimit(request);
    if (!isShareToken(token)) await notFound(request);
    const ref = db().doc(`cardReportShares/${shareTokenHash(token)}`), share = await ref.get(), value = share.data();
    if (!share.exists || !value || shareState(value) !== 'active') return await notFound(request);
    const [distributionSnap, cls, pupil, progressSnap] = await db().getAll(db().doc(`cardClassSets/${id(value.distributionId)}`), db().doc(`classes/${id(value.classId)}`), db().doc(`classes/${id(value.classId)}/students/${id(value.studentId)}`), db().doc(`cardProgress/${id(value.distributionId)}_${id(value.studentId)}`));
    const distribution = distributionSnap.exists ? { ...distributionSnap.data(), id: distributionSnap.id } as Distribution : null;
    // A link stops working when the class changes hands, the student leaves, or the set no longer reaches them.
    if (!distribution || distribution.ownerUid !== value.ownerUid || distribution.classId !== value.classId || cls.data()?.ownerUid !== value.ownerUid || !pupil.exists || pupil.data()?.disabled || !reportStudentIds(distribution, [value.studentId]).includes(value.studentId)) return await notFound(request);
    const raw = progressSnap.data()?.classId === value.classId ? progressSnap.data() : undefined;
    const progress = publicProgress(raw, distribution.snapshot, distribution.requiredModes, distribution.test, { dueAt: distribution.dueAt ?? null, afterDue: cardAfterDue(distribution) });
    const tests = raw ? (await progressSnap.ref.collection('tests').where('status', '==', 'submitted').select('number', 'score', 'submittedAt', 'retryWrong', 'overtime').get()).docs.filter(doc => doc.data().overtime !== true).map(doc => ({ number: Number(doc.data().number) || 0, score: Number(doc.data().score) || 0, submittedAt: String(doc.data().submittedAt ?? ''), retry: !!doc.data().retryWrong })).sort((a, b) => a.number - b.number) : [];
    // While a test is open on the child's device, the words to practise wait: they would be the answers.
    const testOpen = !!raw?.activeAttemptId;
    await ref.update({ views: FieldValue.increment(1) });
    return json({
      student: { name: String(value.displayName ?? '') },
      note: String(value.note ?? ''),
      expiresAt: value.expiresAt,
      set: { title: distribution.title, type: distribution.type, cardCount: distribution.cardCount, dueAt: distribution.dueAt ?? null },
      progress: { mastery: progress.mastery, studyPercent: requiredStudyPercent(progress.completedCounts, distribution.requiredModes), studyComplete: progress.studyComplete, lastStudiedAt: progress.updatedAt },
      test: { goalScore: distribution.test.goalScore, maxAttempts: distribution.test.maxAttempts, bestScore: progress.bestScore, latestScore: progress.latestScore, goalReached: progress.goalReached, scores: tests },
      practice: testOpen ? { words: [], hidden: true } : { words: practiceWords(raw?.mistakes, distribution.snapshot.cards), hidden: false },
    }, 200, PUBLIC_HEADERS);
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message, code: error.code }, error.status, PUBLIC_HEADERS);
    console.error('Card parent link failed', (error as { code?: string }).code ?? 'INTERNAL');
    return json({ error: '링크를 열지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 'INTERNAL_ERROR' }, 500, PUBLIC_HEADERS);
  }
}
