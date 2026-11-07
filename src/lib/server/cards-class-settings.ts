import 'server-only';
import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin';
import type { Context } from './auth';
import { ApiError, canManageClass, id } from './policy';
import { CardPlanError, parseClassDefaults, parseClassDefaultsByType, parsePlan, studentPlan, type CardClassDefaults, type CardClassSettings } from '../cards-class-plan';
import type { CardSetType } from '../cards-types';

/**
 * 우리 반 학습 기본값과 차시 메모·순서: one small doc per class, `cardClassSettings/{classId}`.
 * Only the class owner reads or writes it, through this API. A class without the doc reads as the app defaults and newest-first order.
 * A doc left behind by an earlier owner of the class is ignored.
 */
type Data = Record<string, any>;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
export const classSettingsRef = (classId: string) => db().doc(`cardClassSettings/${id(classId, '우리 반')}`);
const usable = (snap: FirebaseFirestore.DocumentSnapshot | undefined, ownerUid: unknown) => !!snap?.exists && snap.data()?.ownerUid === ownerUid;

export function readClassSettings(snap: FirebaseFirestore.DocumentSnapshot | undefined, ownerUid: unknown): CardClassSettings {
  const value = usable(snap, ownerUid) ? snap!.data()! : {};
  return { defaults: parseClassDefaultsByType(value.defaults), plan: parsePlan(value.plan), revision: usable(snap, ownerUid) ? Number(value.revision) || 0 : 0, updatedAt: value.updatedAt ?? null, saved: usable(snap, ownerUid) };
}
/** The student list in the teacher's order, hidden rows dropped, with memos in place. */
export function applyStudentPlan<T extends { id: string; createdAt: string }>(rows: T[], snap: FirebaseFirestore.DocumentSnapshot | undefined, ownerUid: unknown) {
  return studentPlan(rows, readClassSettings(snap, ownerUid).plan);
}
/** Defaults for one set type, or null when the class never saved any (Berry then keeps the app defaults it always used). */
export async function classDefaultsFor(classId: string, ownerUid: string, type: CardSetType): Promise<CardClassDefaults | null> {
  const snap = await classSettingsRef(classId).get();
  return usable(snap, ownerUid) && snap.data()?.defaults ? parseClassDefaults(snap.data()!.defaults[type]) : null;
}

async function ownedClass(ctx: Context, classId: string) {
  if (ctx.role === 'student') throw new ApiError(403, '선생님만 사용할 수 있어요.', 'FORBIDDEN');
  const snap = await db().doc(`classes/${id(classId, '우리 반')}`).get();
  if (!snap.exists || !canManageClass(ctx.role, ctx.uid, snap.data()?.ownerUid)) throw new ApiError(404, '항목을 찾을 수 없어요.', 'NOT_FOUND');
  return snap;
}
function parsed<T>(read: () => T): T {
  try { return read(); } catch (error) { if (error instanceof CardPlanError) throw new ApiError(400, error.message, 'CLASS_SETTINGS'); throw error; }
}

export async function cardClassSettings(ctx: Context, request: Request, classId: string) {
  await ownedClass(ctx, classId);
  const ref = classSettingsRef(classId);
  if (request.method === 'GET') return json({ settings: readClassSettings(await ref.get(), ctx.uid) });
  if (request.method !== 'PATCH') throw new ApiError(404, '카드놀이 기능을 찾을 수 없어요.', 'NOT_FOUND');
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > 100_000) throw new ApiError(413, '입력 내용이 너무 커요.');
  let input: Data;
  try { input = JSON.parse(raw || '{}'); } catch { throw new ApiError(400, '입력 내용을 확인해 주세요.'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, '입력 내용을 확인해 주세요.');
  if (input.defaults === undefined && input.plan === undefined) throw new ApiError(400, '바꿀 내용을 확인해 주세요.');
  if (input.allClasses !== undefined && typeof input.allClasses !== 'boolean') throw new ApiError(400, '모든 반에 적용 여부를 확인해 주세요.');
  if (input.allClasses && input.defaults === undefined) throw new ApiError(400, '모든 반에는 학습 기본값만 적용할 수 있어요.');
  const defaults = input.defaults === undefined ? undefined : parsed(() => parseClassDefaultsByType(input.defaults, true));
  const plan = input.plan === undefined ? undefined : parsed(() => parsePlan(input.plan, true));
  const stamp = new Date().toISOString();
  const saved = await db().runTransaction(async tx => {
    const snap = await tx.get(ref), current = readClassSettings(snap, ctx.uid);
    // Two open tabs: the later save is refused instead of quietly dropping the other tab's memos.
    if (input.expectedRevision !== undefined && input.expectedRevision !== current.revision) throw new ApiError(409, '다른 화면에서 먼저 바꿨어요. 새로 열어 확인해 주세요.', 'STALE_SETTINGS');
    const next = { ownerUid: ctx.uid, classId, defaults: defaults ?? current.defaults, plan: plan ?? current.plan, revision: current.revision + 1, updatedAt: stamp };
    tx.set(ref, next);
    return next;
  });
  let classes = 1;
  if (input.allClasses && defaults) {
    // Only the defaults travel; each class keeps its own memos and order. A class with someone else's old doc starts over as this teacher's.
    const owned = (await db().collection('classes').where('ownerUid', '==', ctx.uid).select('ownerUid').limit(200).get()).docs.filter(doc => doc.id !== classId);
    const others = owned.length ? await db().getAll(...owned.map(doc => classSettingsRef(doc.id))) : [];
    const batch = db().batch();
    others.forEach((snap, index) => {
      const mine = usable(snap, ctx.uid);
      batch.set(snap.ref, mine ? { defaults, revision: FieldValue.increment(1), updatedAt: stamp } : { ownerUid: ctx.uid, classId: owned[index].id, defaults, plan: [], revision: 1, updatedAt: stamp }, { merge: mine });
    });
    if (others.length) await batch.commit();
    classes += others.length;
  }
  return json({ settings: { defaults: saved.defaults, plan: saved.plan, revision: saved.revision, updatedAt: stamp, saved: true } satisfies CardClassSettings, classes });
}
