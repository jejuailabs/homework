import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from './admin';
import type { Context } from './auth';
import { ApiError, canManageClass, id, text } from './policy';
import { drillDistribution, emptyModeCounts, object, parseRequirements } from './cards-policy';
import { classSettingsRef, readClassSettings } from './cards-class-settings';
import { cardReviewStates } from '../cards-logic';
import { parsePlan } from '../cards-class-plan';
import { CARD_TRANSFER_SEEDS, CARD_TRANSFER_SETS, carriedCardStates, carriedMisses, checkStudentLinks, remapPlan, suggestStudentLinks, transferredSettings, type CardTransferLink, type CardTransferStudent } from '../cards-transfer';
import type { CardEntry, CardSnapshot } from '../cards-types';

/**
 * 다른 반에 배치·학기말 이월·클래스 복제. Both classes belong to the same teacher. The old class is only read.
 * - Sets: each chosen distribution becomes a new distribution in the target class for all its students, with the set's current
 *   version when the teacher still has the set (typo fixes travel), otherwise the old snapshot.
 * - Settings: the class defaults are copied over; the lesson order and memos are added after the target's own rows.
 * - Students (이월): for each linked pair, card mastery, starred cards and recent misses seed the new distributions. Study counts,
 *   tests, lateness, 보말, games and parent links stay on the old class's report.
 * IDs are derived from the request, so a retry after a dropped connection writes the same documents and never doubles anything.
 */
type Data = Record<string, any>;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const digest = (...parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const now = () => new Date().toISOString();
const ALREADY_EXISTS = 6; // gRPC status of create() on an existing document

async function ownedClass(ctx: Context, classId: unknown) {
  if (ctx.role === 'student') throw new ApiError(403, '선생님만 사용할 수 있어요.', 'FORBIDDEN');
  const snap = await db().doc(`classes/${id(classId, '우리 반')}`).get();
  if (!snap.exists || !canManageClass(ctx.role, ctx.uid, snap.data()?.ownerUid)) throw new ApiError(404, '항목을 찾을 수 없어요.', 'NOT_FOUND');
  return snap;
}
async function roster(classId: string): Promise<CardTransferStudent[]> {
  const snap = await db().collection(`classes/${classId}/students`).get();
  return snap.docs.map(doc => ({ id: doc.id, name: String(doc.data().name ?? ''), number: Number(doc.data().number ?? 0), disabled: !!doc.data().disabled })).sort((a, b) => a.number - b.number);
}
async function sourceDistributions(ctx: Context, classId: string) {
  const snap = await db().collection('cardClassSets').where('classId', '==', classId).select('ownerUid', 'title', 'type', 'cardCount', 'active', 'dueAt', 'createdAt', 'setId').limit(500).get();
  return snap.docs.filter(doc => doc.data().ownerUid === ctx.uid).map(doc => ({ id: doc.id, title: String(doc.data().title ?? ''), type: doc.data().type, cardCount: Number(doc.data().cardCount ?? 0), active: doc.data().active !== false, dueAt: doc.data().dueAt ?? null, createdAt: String(doc.data().createdAt ?? '') })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** GET classes/{from}/transfer?toClassId=: what can move, both rosters and the suggested student links. Names stay on the teacher's screen. */
export async function transferPreview(ctx: Context, request: Request, fromClassId: string) {
  const from = await ownedClass(ctx, fromClassId), toClassId = new URL(request.url).searchParams.get('toClassId');
  const [distributions, fromRoster] = await Promise.all([sourceDistributions(ctx, from.id), roster(from.id)]);
  if (!toClassId) return json({ distributions, from: fromRoster, to: [], links: [] });
  const to = await ownedClass(ctx, toClassId);
  if (to.id === from.id) throw new ApiError(400, '다른 반을 골라 주세요.', 'TRANSFER_SAME');
  const toRoster = await roster(to.id), links = await db().getAll(...(toRoster.length ? toRoster.map(row => db().doc(`cardStudentLinks/${to.id}_${row.id}`)) : [db().doc('cardStudentLinks/_none')]));
  // A student already linked from this class keeps that link as the suggestion.
  const kept = links.filter(link => link.exists && link.data()?.ownerUid === ctx.uid && link.data()?.fromClassId === from.id).map(link => ({ from: String(link.data()!.fromStudentId), to: link.id.slice(to.id.length + 1) })).filter(link => fromRoster.some(row => row.id === link.from));
  const suggested = suggestStudentLinks(fromRoster, toRoster).filter(link => !kept.some(row => row.to === link.to || row.from === link.from));
  return json({ distributions, from: fromRoster, to: toRoster, links: [...kept, ...suggested] });
}

function parseLinks(value: unknown): CardTransferLink[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ApiError(400, '이을 학생을 확인해 주세요.');
  return value.map(entry => { const raw = object(entry); return { from: id(raw.from, '원래 반 학생'), to: id(raw.to, '받을 반 학생') }; });
}

export type TransferInput = { toClassId: string; distributionIds: string[]; settings: boolean; keepDue: boolean; links: CardTransferLink[]; requestId: string };
export function parseTransferInput(input: Data, toClassId?: string): TransferInput {
  const ids = input.distributionIds ?? [];
  if (!Array.isArray(ids) || ids.length > CARD_TRANSFER_SETS) throw new ApiError(400, `세트는 한 번에 ${CARD_TRANSFER_SETS}개까지 옮길 수 있어요.`);
  for (const key of ['settings', 'keepDue'] as const) if (input[key] !== undefined && typeof input[key] !== 'boolean') throw new ApiError(400, '옮길 내용을 확인해 주세요.');
  const distributionIds = [...new Set(ids.map(value => id(value, '세트')))];
  if (!distributionIds.length && !input.settings) throw new ApiError(400, '옮길 세트나 학습 기본값을 골라 주세요.', 'TRANSFER_EMPTY');
  return { toClassId: toClassId ?? id(input.toClassId, '받을 반'), distributionIds, settings: input.settings === true, keepDue: input.keepDue === true, links: parseLinks(input.links), requestId: id(input.requestId, '요청 ID') };
}

/** The chosen distributions, each this teacher's and from this class; anything else refuses the whole request before a write. */
async function sourceSnaps(ctx: Context, fromClassId: string, ids: string[]) {
  const sources = ids.length ? await db().getAll(...ids.map(value => db().doc(`cardClassSets/${value}`))) : [];
  if (sources.some(snap => !snap.exists || snap.data()?.ownerUid !== ctx.uid || snap.data()?.classId !== fromClassId)) throw new ApiError(404, '옮길 세트를 다시 골라 주세요.', 'NOT_FOUND');
  return sources;
}
/** Runs one transfer into a class this teacher owns. Used by the transfer dialog and by 클래스 복제 (into the class it just made). */
export async function runTransfer(ctx: Context, fromClassId: string, input: TransferInput) {
  const [from, to] = await Promise.all([ownedClass(ctx, fromClassId), ownedClass(ctx, input.toClassId)]);
  if (from.id === to.id) throw new ApiError(400, '다른 반을 골라 주세요.', 'TRANSFER_SAME');
  const [fromRoster, toRoster] = await Promise.all([roster(from.id), roster(to.id)]);
  const problem = checkStudentLinks(input.links, fromRoster, toRoster);
  if (problem) throw new ApiError(400, problem, 'TRANSFER_LINKS');
  if (input.distributionIds.length * input.links.length > CARD_TRANSFER_SEEDS) throw new ApiError(400, '한 번에 옮기기에 너무 많아요. 세트를 나누어 옮겨 주세요.', 'TRANSFER_TOO_MANY');

  const sources = await sourceSnaps(ctx, from.id, input.distributionIds);
  // The set's current version when the teacher still has it and it is not archived; the old snapshot otherwise.
  const setIds = [...new Set(sources.map(snap => String(snap.data()!.setId ?? '')).filter(Boolean))];
  const sets = new Map((setIds.length ? await db().getAll(...setIds.map(value => db().doc(`cardSets/${value}`))) : []).filter(snap => snap.exists && snap.data()?.ownerUid === ctx.uid && !snap.data()?.archived).map(snap => [snap.id, snap.data()!]));
  const versionIds = [...new Set([...sets.values()].map(set => String(set.versionId)))];
  const versions = new Map((versionIds.length ? await db().getAll(...versionIds.map(value => db().doc(`cardSetVersions/${value}`))) : []).filter(snap => snap.exists).map(snap => [snap.id, snap.data()!]));

  const stamp = now(), activeIds = toRoster.filter(row => !row.disabled).map(row => row.id);
  const planned = sources.map(snap => {
    const source = snap.data()!, set = sets.get(source.setId), version = set ? versions.get(set.versionId) : undefined;
    const snapshot: CardSnapshot = version ? { title: version.title, description: version.description, type: version.type, cards: version.cards } : source.snapshot;
    const carried = transferredSettings(source as Parameters<typeof transferredSettings>[0], snapshot.cards.length, input.keepDue);
    // A drill set keeps the drill rules (no study modes, front→back tests): a back→front test would hand its answers out through the redacted snapshot.
    const settings = { ...carried, ...drillDistribution(snapshot.type, carried.requiredModes, carried.test, () => parseRequirements(undefined, snapshot.cards.length)) };
    const newId = digest(ctx.uid, 'transfer', input.requestId, snap.id).slice(0, 24);
    const value: Data = {
      ownerUid: ctx.uid, classId: to.id, className: to.data()!.name, setId: source.setId, setVersion: version ? set!.version : source.setVersion, versionId: version ? set!.versionId : source.versionId,
      title: snapshot.title, type: snapshot.type, cardCount: snapshot.cards.length, cardIds: snapshot.cards.map((card: CardEntry) => card.id),
      targetStudentIds: activeIds, targetStudents: toRoster.filter(row => !row.disabled).map(row => ({ id: row.id, name: row.name, number: row.number })), targetCount: activeIds.length, allStudents: true,
      requiredModes: settings.requiredModes, test: settings.test, dueAt: settings.dueAt, afterDue: settings.afterDue, speechRate: settings.speechRate, ...(settings.planDate ? { planDate: settings.planDate } : {}),
      active: true, snapshot, createdAt: stamp, updatedAt: stamp, carriedFrom: { distributionId: snap.id, classId: from.id, className: String(from.data()!.name ?? '') },
    };
    return { sourceId: snap.id, newId, value };
  });
  const idMap = new Map(planned.map(row => [row.sourceId, row.newId]));
  const cardMap = new Map(planned.map(row => [row.sourceId, { id: row.newId, cardIds: row.value.cardIds as string[] }]));

  // New distributions and progress seeds are created, never set: a document that already exists (a retry, or a record the student
  // started in the new class meanwhile) is left exactly as it is. Settings and links are plain writes; misses merge below.
  const creates: { ref: FirebaseFirestore.DocumentReference; data: Data; kind: 'distribution' | 'seed' }[] = [], writes: { ref: FirebaseFirestore.DocumentReference; data: Data }[] = [];
  planned.forEach(row => creates.push({ ref: db().doc(`cardClassSets/${row.newId}`), data: row.value, kind: 'distribution' }));
  const carriedMissesFor: { ref: FirebaseFirestore.DocumentReference; studentId: string; misses: Record<string, Record<string, string>> }[] = [];
  if (input.links.length) {
    const progressPairs = planned.flatMap(row => input.links.map(link => ({ row, link })));
    const oldStates = progressPairs.length ? await db().getAll(...progressPairs.map(pair => db().doc(`cardProgress/${pair.row.sourceId}_${pair.link.from}`))) : [];
    progressPairs.forEach((pair, index) => {
      const old = oldStates[index].data();
      // Only a student with something to carry gets a record.
      if (!old || old.classId !== from.id) return;
      const cards = pair.row.value.cardIds as string[], states = carriedCardStates(cardReviewStates(old.cardStates), cards), starred = (Array.isArray(old.starredCardIds) ? old.starredCardIds : []).filter((cardId: string) => cards.includes(cardId));
      if (!Object.keys(states).length && !starred.length) return;
      creates.push({ ref: db().doc(`cardProgress/${pair.row.newId}_${pair.link.to}`), kind: 'seed', data: { distributionId: pair.row.newId, ownerUid: ctx.uid, classId: to.id, studentId: pair.link.to, counts: emptyModeCounts(), correctCounts: emptyModeCounts(), coverage: { memorize: {}, recall: {}, spell: {} }, cardStates: states, mistakes: {}, attempts: 0, bestScore: null, latestScore: null, starredCardIds: starred, lastPosition: null, activeAttemptId: null, lastSubmittedAttemptId: null, updatedAt: null, lateAt: null, carriedFrom: { distributionId: pair.row.sourceId, classId: from.id, studentId: pair.link.from } } });
    });
    const oldMisses = await db().getAll(...input.links.map(link => db().doc(`cardMisses/${from.id}_${link.from}`)));
    input.links.forEach((link, index) => {
      const carried = carriedMisses(oldMisses[index].data()?.misses ?? {}, cardMap);
      if (Object.keys(carried).length) carriedMissesFor.push({ ref: db().doc(`cardMisses/${to.id}_${link.to}`), studentId: link.to, misses: carried });
      writes.push({ ref: db().doc(`cardStudentLinks/${to.id}_${link.to}`), data: { ownerUid: ctx.uid, classId: to.id, studentId: link.to, fromClassId: from.id, fromStudentId: link.from, linkedAt: stamp } });
    });
  }
  if (input.settings) {
    const [source, target] = await db().getAll(classSettingsRef(from.id), classSettingsRef(to.id));
    const read = readClassSettings(source, ctx.uid), current = readClassSettings(target, ctx.uid);
    writes.push({ ref: classSettingsRef(to.id), data: { ownerUid: ctx.uid, classId: to.id, defaults: read.defaults, plan: parsePlan(remapPlan(read.plan, idMap, current.plan)), revision: current.revision + 1, updatedAt: stamp } });
  }
  const writer = db().bulkWriter();
  writer.onWriteError(error => error.code !== ALREADY_EXISTS && error.failedAttempts < 3);
  const made = creates.map(write => writer.create(write.ref, write.data).then(() => write.kind, (error: { code?: number }) => { if (error.code === ALREADY_EXISTS) return 'kept' as const; throw error; }));
  const plain = writes.map(write => writer.set(write.ref, write.data));
  await writer.close();
  const outcomes = await Promise.all(made);
  await Promise.all(plain);
  // Carried misses are added entry by entry inside a transaction: a newer miss the student made in the new class (or one an earlier
  // run already added) is never replaced.
  for (const item of carriedMissesFor) {
    await db().runTransaction(async tx => {
      const snap = await tx.get(item.ref), merged: Record<string, Record<string, string>> = structuredClone(snap.data()?.misses ?? {});
      let added = 0;
      for (const [distributionId, cards] of Object.entries(item.misses)) for (const [cardId, date] of Object.entries(cards)) {
        if (merged[distributionId]?.[cardId]) continue;
        (merged[distributionId] ??= {})[cardId] = date; added++;
      }
      if (added) tx.set(item.ref, { classId: to.id, studentId: item.studentId, misses: merged, updatedAt: stamp }, { merge: true });
    });
  }
  return { distributions: planned.length, created: outcomes.filter(kind => kind === 'distribution').length, students: input.links.length, seeded: outcomes.filter(kind => kind === 'seed').length, settings: input.settings, toClassId: to.id, toClassName: String(to.data()!.name ?? '') };
}

/** POST classes/{from}/transfer. */
export async function transferClass(ctx: Context, request: Request, fromClassId: string, input: Data) {
  if (request.method === 'GET') return transferPreview(ctx, request, fromClassId);
  const parsed = parseTransferInput(input);
  return json({ result: await runTransfer(ctx, fromClassId, parsed) }, 201);
}

/**
 * POST classes/{from}/clone: 클래스 복제. Makes a new class for this teacher (the same fields the class dashboard writes, no students)
 * and places the chosen sets and the class defaults in it. Students are added on the class dashboard as usual; sets given to all
 * students reach them as they join. The class ID comes from the request, so a retry never makes a second class.
 */
export async function cloneClass(ctx: Context, fromClassId: string, input: Data) {
  const from = await ownedClass(ctx, fromClassId), requestId = id(input.requestId, '요청 ID');
  const name = text(input.name, '학급 이름', 80), grade = text(String(input.grade ?? from.data()!.grade ?? ''), '학년', 20, true), year = Number(input.year ?? new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new ApiError(400, '학년도를 확인해 주세요.');
  const ref = db().doc(`classes/${digest(ctx.uid, 'clone', requestId).slice(0, 20)}`);
  // Everything is checked before the class exists, so a bad request never leaves an empty class behind.
  const parsed = parseTransferInput({ ...input, links: undefined }, ref.id);
  await sourceSnaps(ctx, from.id, parsed.distributionIds);
  const made = await db().runTransaction(async tx => {
    const existing = await tx.get(ref);
    if (existing.exists) { if (existing.data()?.ownerUid !== ctx.uid) throw new ApiError(409, '다시 시도해 주세요.', 'REQUEST_CONFLICT'); return false; }
    tx.create(ref, { adminStatus: 'active', name, grade, year, ownerUid: ctx.uid, studentCount: 0, createdAt: now(), clonedFrom: from.id });
    return true;
  });
  try {
    return json({ result: await runTransfer(ctx, from.id, parsed), classId: ref.id }, 201);
  } catch (error) {
    // A class this call just made and nobody has used yet is taken back, so a failed clone leaves nothing behind.
    if (made) {
      const pupils = await ref.collection('students').limit(1).get(), placed = await db().collection('cardClassSets').where('classId', '==', ref.id).limit(1).get();
      if (pupils.empty && placed.empty) await ref.delete();
    }
    throw error;
  }
}
