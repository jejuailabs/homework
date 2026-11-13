import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { bucket, db } from './admin';
import type { Context } from './auth';
import { ApiError, id } from './policy';
import { assertDueOpen, object } from './cards-policy';
import { cardDistributionAccess } from './cards-games';
import { stableReadUrl } from './signed-urls';
import { boundedBytes, consumeModuleRate } from '@/modules/artwork-extensions/server-utils';
import { wavDuration } from '@/modules/voice-caption/wav';
import { SPEAKING_COUNT_MAX, SPEAKING_MAX_BYTES, SPEAKING_MAX_SECONDS, SPEAKING_STEPS, SPEAKING_ZIP_MAX_BYTES, parseSpeakingCounts, parseSpeakingRequired, speakingCards, speakingComplete, speakingFileName, speakingFolderName, speakingPercent, speakingRecorded, type SpeakingFile, type SpeakingStep, type SpeakingStudentRow, type SpeakingTake, type SpeakingTakes } from '../cards-speaking';
import type { CardDistribution, CardEntry } from '../cards-types';

// 카드 스피킹 녹음. 배부 × 학생마다 문서 하나(`cardSpeaking/{배부}_{학생}`)에 카드별 최신 녹음만 적는다.
// 파일은 Firebase Storage `card-speaking/`에 두고, 다시 녹음하면 새 경로에 올린 뒤 이전 파일을 지운다.
type Distribution = CardDistribution & { ownerUid: string; speaking?: boolean };
// 스피킹 is a student study tool like 암기·리콜·스펠: on unless the teacher turned it off for this distribution.
export const speakingOn = (distribution: { type?: string; speaking?: boolean }) => distribution.type !== 'drill' && distribution.speaking !== false;
/** 낭독 takes live beside the 녹음 takes (`takes`) under `aloud`, so the teacher's list and downloads stay the 녹음 step. */
type TakeKind = 'record' | 'aloud';
const takeField = (kind: TakeKind) => kind === 'aloud' ? 'aloud' : 'takes';
type StudentContext = Context & { classId: string; studentId: string };
const DEFAULT_STORAGE_LIMIT = 10 * 1024 ** 3;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const takesRef = (distributionId: string, studentId: string) => db().doc(`cardSpeaking/${id(distributionId)}_${id(studentId)}`);
const quotaRef = (ownerUid: string) => db().doc(`cardSpeakingStorage/${ownerUid}`);
const filePath = (d: Distribution, studentId: string, cardId: string, takeId: string) => `card-speaking/${d.ownerUid}/${d.id}/${studentId}/${cardId}/${takeId}.wav`;
const takesOf = (value: unknown): SpeakingTakes => (value && typeof value === 'object' ? value : {}) as SpeakingTakes;
const removeFile = (path: string) => bucket().file(path).delete({ ignoreNotFound: true }).catch(error => console.error('Card speaking file delete failed', (error as { code?: unknown }).code ?? 'UNKNOWN'));
const storageLimit = () => Number(process.env.CARD_SPEAKING_STORAGE_LIMIT_BYTES) || DEFAULT_STORAGE_LIMIT;

function student(ctx: Context): StudentContext {
  if (ctx.role !== 'student' || !ctx.classId || !ctx.studentId) throw new ApiError(403, '학생 화면에서 이용해 주세요.', 'FORBIDDEN');
  return ctx as StudentContext;
}
function assertRecordable(distribution: Distribution) {
  if (distribution.type === 'drill') throw new ApiError(404, '연습문제 세트는 스피킹을 쓰지 않아요.', 'NOT_FOUND');
  if (!speakingOn(distribution)) throw new ApiError(409, '선생님이 스피킹을 꺼 두었어요.', 'SPEAKING_OFF');
}
function cardOf(distribution: Distribution, cardId: string): CardEntry {
  const card = speakingCards(distribution.snapshot.cards).find(item => item.id === cardId);
  if (!card) throw new ApiError(404, '카드를 찾을 수 없어요.', 'NOT_FOUND');
  return card;
}
const withUrl = async (distribution: Distribution, studentId: string, cardId: string, take: SpeakingTake): Promise<SpeakingTake> => ({ ...take, url: await stableReadUrl(filePath(distribution, studentId, cardId, take.takeId)) });
async function takesWithUrls(distribution: Distribution, studentId: string, takes: SpeakingTakes) {
  const known = new Set(speakingCards(distribution.snapshot.cards).map(card => card.id));
  return Object.fromEntries(await Promise.all(Object.entries(takes).filter(([cardId]) => known.has(cardId)).map(async ([cardId, take]) => [cardId, await withUrl(distribution, studentId, cardId, take)]))) as SpeakingTakes;
}
/** The download list for one student, in the order of the set. */
async function studentFiles(distribution: Distribution, studentId: string, takes: SpeakingTakes, folder = ''): Promise<SpeakingFile[]> {
  const cards = speakingCards(distribution.snapshot.cards);
  const rows = await Promise.all(cards.map(async (card, position) => {
    const take = takes[card.id];
    if (!take) return null;
    return { path: `${folder ? `${folder}/` : ''}${speakingFileName(position, card.front)}`, bytes: take.bytes, url: await stableReadUrl(filePath(distribution, studentId, card.id, take.takeId)) };
  }));
  return rows.filter((row): row is SpeakingFile => !!row);
}
function assertZipSize(files: SpeakingFile[]) {
  if (files.reduce((total, file) => total + file.bytes, 0) > SPEAKING_ZIP_MAX_BYTES) throw new ApiError(413, '녹음이 많아 한 번에 받을 수 없어요. 학생별로 내려받아 주세요.', 'SPEAKING_ZIP_LARGE');
}
async function classRows(distribution: Distribution) {
  const [roster, saved] = await Promise.all([
    db().collection(`classes/${distribution.classId}/students`).select('name', 'number', 'disabled').limit(500).get(),
    db().collection('cardSpeaking').where('distributionId', '==', distribution.id).limit(500).get(),
  ]);
  const mine = saved.docs.filter(doc => doc.data().classId === distribution.classId);
  const byStudent = new Map(mine.map(doc => [String(doc.data().studentId), takesOf(doc.data().takes)]));
  const countsOf = new Map(mine.map(doc => [String(doc.data().studentId), parseSpeakingCounts(doc.data().counts)]));
  const targets = new Set(distribution.targetStudentIds ?? []);
  return roster.docs
    .filter(pupil => !pupil.data().disabled && (distribution.allStudents || targets.has(pupil.id) || byStudent.has(pupil.id)))
    .map(pupil => {
      const takes = byStudent.get(pupil.id) ?? {};
      return { id: pupil.id, number: Number(pupil.data().number) || 0, name: String(pupil.data().name || '').trim() || `${pupil.data().number ?? ''}번`, takes, counts: countsOf.get(pupil.id) ?? {} };
    })
    .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name, 'ko'));
}

async function readStudent(ctx: StudentContext, distribution: Distribution, all: boolean) {
  const saved = (await takesRef(distribution.id, ctx.studentId).get()).data(), takes = takesOf(saved?.takes), aloud = takesOf(saved?.aloud);
  if (all) {
    if (!speakingComplete(distribution.snapshot.cards, takes)) throw new ApiError(409, '모든 카드를 녹음하면 내려받을 수 있어요.', 'SPEAKING_INCOMPLETE');
    const files = await studentFiles(distribution, ctx.studentId, takes);
    assertZipSize(files);
    return json({ files });
  }
  let canRecord = speakingOn(distribution);
  if (canRecord) try { assertDueOpen(distribution); } catch { canRecord = false; }
  return json({ enabled: speakingOn(distribution), canRecord, required: parseSpeakingRequired(distribution.speakingRequired), counts: parseSpeakingCounts(saved?.counts), takes: await takesWithUrls(distribution, ctx.studentId, takes), aloud: await takesWithUrls(distribution, ctx.studentId, aloud) });
}
async function readTeacher(distribution: Distribution, request: Request) {
  const query = new URL(request.url).searchParams, wanted = query.get('student') ? id(query.get('student')) : '', all = query.get('all') === '1';
  const rows = await classRows(distribution);
  if (wanted) {
    const row = rows.find(item => item.id === wanted);
    if (!row) throw new ApiError(404, '학생을 찾을 수 없어요.', 'NOT_FOUND');
    if (all) {
      const files = await studentFiles(distribution, row.id, row.takes);
      assertZipSize(files);
      return json({ files, name: row.name });
    }
    return json({ takes: await takesWithUrls(distribution, row.id, row.takes) });
  }
  if (all) {
    const files = (await Promise.all(rows.map(row => studentFiles(distribution, row.id, row.takes, speakingFolderName(row.number, row.name))))).flat();
    assertZipSize(files);
    return json({ files });
  }
  const cards = distribution.snapshot.cards;
  const required = parseSpeakingRequired(distribution.speakingRequired);
  const students: SpeakingStudentRow[] = rows.map(row => ({ id: row.id, number: row.number, name: row.name, recorded: speakingRecorded(cards, row.takes), lastAt: Object.values(row.takes).map(take => take.at).sort().pop() ?? null, percent: speakingPercent(cards, row.counts, required) }));
  return json({ enabled: speakingOn(distribution), required, total: speakingCards(cards).length, students });
}

async function saveTake(ctx: StudentContext, request: Request, distributionId: string, rawCardId: string, kind: TakeKind) {
  const cardId = id(rawCardId, '카드');
  const bytes = await boundedBytes(request, SPEAKING_MAX_BYTES);
  let seconds: number;
  try { seconds = wavDuration(bytes); } catch { throw new ApiError(400, `${SPEAKING_MAX_SECONDS}초 이내로 다시 녹음해 주세요.`, 'AUDIO_INVALID'); }
  if (seconds > SPEAKING_MAX_SECONDS) throw new ApiError(400, `${SPEAKING_MAX_SECONDS}초 이내로 다시 녹음해 주세요.`, 'AUDIO_INVALID');
  const before = await cardDistributionAccess(ctx, distributionId) as Distribution;
  assertRecordable(before); assertDueOpen(before); cardOf(before, cardId);
  await consumeModuleRate([{ key: `card-speaking:${ctx.studentId}`, limit: 600, windowMs: 86_400_000 }]);
  const take: SpeakingTake = { takeId: randomUUID(), bytes: bytes.length, seconds: Math.round(seconds * 10) / 10, at: new Date().toISOString() };
  const path = filePath(before, ctx.studentId, cardId, take.takeId), file = bucket().file(path);
  await file.save(Buffer.from(bytes), { resumable: false, metadata: { contentType: 'audio/wav', cacheControl: 'private,max-age=86400' } });
  let outcome: { previous?: SpeakingTake; recorded: number };
  try {
    outcome = await db().runTransaction(async tx => {
      const distribution = await cardDistributionAccess(ctx, distributionId, tx) as Distribution;
      assertRecordable(distribution); assertDueOpen(distribution);
      const ref = takesRef(distributionId, ctx.studentId), quota = quotaRef(distribution.ownerUid);
      const [saved, usage] = await Promise.all([tx.get(ref), tx.get(quota)]);
      const takes = takesOf(saved.data()?.[takeField(kind)]), previous = takes[cardId], used = Number(usage.data()?.usedBytes) || 0, nextUsed = Math.max(0, used - (previous?.bytes ?? 0)) + take.bytes;
      if (nextUsed > storageLimit()) throw new ApiError(413, '스피킹 저장 공간이 가득 찼어요. 선생님께 알려 주세요.', 'SPEAKING_STORAGE_FULL');
      const next = { ...takes, [cardId]: take };
      tx.set(ref, { distributionId, classId: ctx.classId, studentId: ctx.studentId, ownerUid: distribution.ownerUid, [takeField(kind)]: next, updatedAt: take.at }, { merge: true });
      tx.set(quota, { usedBytes: nextUsed, updatedAt: take.at }, { merge: true });
      return { previous, recorded: speakingRecorded(distribution.snapshot.cards, kind === 'record' ? next : takesOf(saved.data()?.takes)) };
    });
  } catch (error) {
    await removeFile(path);
    throw error;
  }
  if (outcome.previous) await removeFile(filePath(before, ctx.studentId, cardId, outcome.previous.takeId));
  return json({ take: { ...take, url: await stableReadUrl(path) }, recorded: outcome.recorded }, 201);
}

async function deleteTake(ctx: StudentContext, distributionId: string, rawCardId: string) {
  const cardId = id(rawCardId, '카드');
  const outcome = await db().runTransaction(async tx => {
    const distribution = await cardDistributionAccess(ctx, distributionId, tx) as Distribution;
    const ref = takesRef(distributionId, ctx.studentId), quota = quotaRef(distribution.ownerUid);
    const [saved, usage] = await Promise.all([tx.get(ref), tx.get(quota)]);
    const takes = takesOf(saved.data()?.takes), previous = takes[cardId];
    if (!previous) return { distribution, previous: undefined };
    const { [cardId]: _removed, ...next } = takes;
    tx.set(ref, { ...saved.data(), takes: next, updatedAt: new Date().toISOString() });
    tx.set(quota, { usedBytes: Math.max(0, (Number(usage.data()?.usedBytes) || 0) - previous.bytes) }, { merge: true });
    return { distribution, previous };
  });
  if (outcome.previous) await removeFile(filePath(outcome.distribution, ctx.studentId, cardId, outcome.previous.takeId));
  return json({ ok: true });
}

/** Teacher only: every recording of this distribution, files first so a failure can be retried. */
async function deleteAll(distribution: Distribution) {
  const saved = await db().collection('cardSpeaking').where('distributionId', '==', distribution.id).limit(500).get();
  let freed = 0;
  for (const doc of saved.docs) {
    if (doc.data().classId !== distribution.classId) continue;
    const takes = [...Object.entries(takesOf(doc.data().takes)), ...Object.entries(takesOf(doc.data().aloud))], studentId = String(doc.data().studentId);
    await Promise.all(takes.map(([cardId, take]) => removeFile(filePath(distribution, studentId, cardId, take.takeId))));
    freed += takes.reduce((total, [, take]) => total + (Number(take.bytes) || 0), 0);
    await doc.ref.delete();
  }
  if (freed) await db().runTransaction(async tx => {
    const quota = quotaRef(distribution.ownerUid), usage = await tx.get(quota);
    tx.set(quota, { usedBytes: Math.max(0, (Number(usage.data()?.usedBytes) || 0) - freed), updatedAt: new Date().toISOString() }, { merge: true });
  });
  return json({ ok: true });
}

async function setEnabled(distribution: Distribution, request: Request) {
  if (distribution.type === 'drill') throw new ApiError(400, '연습문제 세트는 스피킹을 쓰지 않아요.', 'SPEAKING_DRILL');
  const raw = await request.text();
  let input: Record<string, unknown>;
  try { input = object(raw ? JSON.parse(raw) : {}); } catch { throw new ApiError(400, '스피킹 설정을 확인해 주세요.', 'SPEAKING_INPUT'); }
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') throw new ApiError(400, '스피킹 설정을 확인해 주세요.', 'SPEAKING_INPUT');
    patch.speaking = input.enabled;
  }
  if (input.required !== undefined) patch.speakingRequired = parseSpeakingRequired(input.required);
  if (Object.keys(patch).length < 2) throw new ApiError(400, '스피킹 설정을 확인해 주세요.', 'SPEAKING_INPUT');
  await db().doc(`cardClassSets/${distribution.id}`).update(patch);
  const next = { ...distribution, ...patch } as Distribution;
  return json({ enabled: speakingOn(next), required: parseSpeakingRequired(next.speakingRequired) });
}

/** A student finished cards in a step (입해석·입영작·집중듣기·쉐도잉, or the count after a 낭독·녹음 upload). Counts only grow. */
async function addCounts(ctx: StudentContext, request: Request, distributionId: string) {
  let input: Record<string, unknown>;
  try { input = object(await request.json()); } catch { throw new ApiError(400, '스피킹 기록을 확인해 주세요.', 'SPEAKING_INPUT'); }
  const step = String(input.step) as SpeakingStep, cardIds = Array.isArray(input.cardIds) ? [...new Set(input.cardIds.map(value => id(value, '카드')))] : [];
  if (!SPEAKING_STEPS.includes(step) || !cardIds.length || cardIds.length > 50) throw new ApiError(400, '스피킹 기록을 확인해 주세요.', 'SPEAKING_INPUT');
  await consumeModuleRate([{ key: `card-speaking-count:${ctx.studentId}`, limit: 3000, windowMs: 86_400_000 }]);
  const counts = await db().runTransaction(async tx => {
    const distribution = await cardDistributionAccess(ctx, distributionId, tx) as Distribution;
    assertRecordable(distribution); assertDueOpen(distribution);
    for (const cardId of cardIds) cardOf(distribution, cardId);
    const ref = takesRef(distributionId, ctx.studentId), saved = await tx.get(ref), current = parseSpeakingCounts(saved.data()?.counts), row = { ...(current[step] ?? {}) };
    for (const cardId of cardIds) row[cardId] = Math.min(SPEAKING_COUNT_MAX, (row[cardId] ?? 0) + 1);
    const next = { ...current, [step]: row };
    tx.set(ref, { distributionId, classId: ctx.classId, studentId: ctx.studentId, ownerUid: distribution.ownerUid, counts: next, updatedAt: new Date().toISOString() }, { merge: true });
    return next;
  });
  return json({ counts });
}

/**
 * GET: a student's own recordings, or the teacher's class summary (`?student=` one student, `?all=1` the download list).
 * PATCH (teacher): 스피킹 켜기·끄기 and 단계별 필수 횟수. POST/DELETE with a card (student): save or remove that card's 녹음 (`?kind=aloud`: 낭독).
 * POST without a card (student): add one to a step's count for some cards.
 * DELETE without a card (teacher): remove every recording of this distribution.
 */
export async function cardSpeaking(ctx: Context, request: Request, distributionId: string, cardId?: string) {
  if (ctx.role === 'student') {
    const me = student(ctx);
    if (cardId && request.method === 'POST') return saveTake(me, request, distributionId, cardId, new URL(request.url).searchParams.get('kind') === 'aloud' ? 'aloud' : 'record');
    if (!cardId && request.method === 'POST') return addCounts(me, request, distributionId);
    if (cardId && request.method === 'DELETE') return deleteTake(me, distributionId, cardId);
    if (!cardId && request.method === 'GET') {
      const distribution = await cardDistributionAccess(ctx, distributionId) as Distribution;
      return readStudent(me, distribution, new URL(request.url).searchParams.get('all') === '1');
    }
    throw new ApiError(404, '카드놀이 기능을 찾을 수 없어요.', 'NOT_FOUND');
  }
  if (cardId) throw new ApiError(403, '학생 화면에서 이용해 주세요.', 'FORBIDDEN');
  const distribution = await cardDistributionAccess(ctx, distributionId) as Distribution;
  if (request.method === 'GET') return readTeacher(distribution, request);
  if (request.method === 'PATCH') return setEnabled(distribution, request);
  if (request.method === 'DELETE') return deleteAll(distribution);
  throw new ApiError(404, '카드놀이 기능을 찾을 수 없어요.', 'NOT_FOUND');
}
