import 'server-only';
import {db} from './admin';
import {requireStudent, requireTeacher, type Context} from './auth';
import {ApiError, id} from './policy';
import {addPointBalance, pointBalance, pointLedgerId, pointSettings} from './points-policy';
import {assertGoalSlot, goalDonationDecision, goalOverdue, goalRefunds, parsePointGoal, publicPointGoal} from './point-goals-policy';
import {activeStudent, classOwner, input, json, ledgerRef, studentRef, type Data} from './points-access';
import type {PointGoal} from '../points-types';

/**
 * 보말 기부. A teacher opens up to three goals (보상 + 목표 보말 + 선택 마감); students give exactly what is still missing at most;
 * a reached goal is rewarded in the classroom and marked 보상 완료; a failed one (선생님 or 마감) gives every donor their 보말 back.
 * Each goal is one document with its donor list, so every change is one transaction.
 */
const goalsRef = (classId: string) => db().collection(`classes/${id(classId)}/pointGoals`);
const LIST_LIMIT = 20;

/** Gives every donor back what they gave and closes the goal. Safe to call twice: a closed goal is left alone. */
async function failGoal(classId: string, goalId: string, reason: 'teacher' | 'deadline', actor: Context | null) {
  const ref = goalsRef(classId).doc(id(goalId)), at = new Date();
  return db().runTransaction(async tx => {
    const [cls, goal] = await Promise.all([tx.get(db().doc(`classes/${id(classId)}`)), tx.get(ref)]);
    if (actor) classOwner(actor, cls);
    if (!goal.exists) throw new ApiError(404, '기부를 찾을 수 없어요.', 'GOAL_NOT_FOUND');
    const value = goal.data()!;
    if (value.status !== 'open' || (reason === 'deadline' && !goalOverdue(value, at))) {
      if (actor && value.status !== 'failed') throw new ApiError(409, '진행 중인 기부만 미션 실패로 정리할 수 있어요.', 'GOAL_CLOSED');
      return publicPointGoal(goal.id, value);
    }
    const refunds = goalRefunds(value);
    const pupils = refunds.length ? await tx.getAll(...refunds.map(donor => studentRef(classId, donor.studentId))) : [];
    const ledgers = refunds.map(donor => ledgerRef(classId, donor.studentId).doc(pointLedgerId('donation-refund', goal.id, donor.studentId)));
    const prior = ledgers.length ? await tx.getAll(...ledgers) : [];
    refunds.forEach((donor, index) => {
      const pupil = pupils[index];
      if (!pupil.exists || prior[index].exists) return;
      const balance = addPointBalance(pointBalance(pupil.data()?.points), donor.amount);
      tx.update(pupil.ref, {points: balance});
      tx.create(ledgers[index], {classId, studentId: donor.studentId, amount: donor.amount, kind: 'earn', source: 'donation-refund', sourceId: goal.id, reason: `기부 환불 · ${value.title}`, actorUid: actor?.uid ?? 'system', balanceAfter: balance, createdAt: at.toISOString()});
    });
    const next = {status: 'failed', failedAt: at.toISOString(), failReason: reason};
    tx.update(ref, next);
    return publicPointGoal(goal.id, {...value, ...next});
  });
}
/** A goal whose deadline passed before it filled fails the first time anyone opens the list. */
async function expireOverdue(classId: string) {
  const open = await goalsRef(classId).where('status', '==', 'open').get(), now = new Date();
  await Promise.all(open.docs.filter(doc => goalOverdue(doc.data(), now)).map(doc => failGoal(classId, doc.id, 'deadline', null)));
}
async function listGoals(classId: string): Promise<PointGoal[]> {
  await expireOverdue(classId);
  const page = await goalsRef(classId).orderBy('createdAt', 'desc').limit(LIST_LIMIT).get();
  return page.docs.map(doc => publicPointGoal(doc.id, doc.data()));
}

async function teacherGoals(request: Request, classId: string) {
  const ctx = await requireTeacher(request), cls = await db().doc(`classes/${id(classId)}`).get(); classOwner(ctx, cls);
  return json({goals: await listGoals(classId), settings: pointSettings(cls.data()?.pointSettings)});
}
async function createGoal(request: Request, classId: string) {
  const ctx = await requireTeacher(request), data = await input(request), at = new Date(), parsed = parsePointGoal(data, at), requestId = id(data.requestId);
  await expireOverdue(classId);
  const ref = goalsRef(classId).doc(pointLedgerId('goal', `${classId}:${ctx.uid}:${requestId}`, 'goal').slice(0, 32));
  const goal = await db().runTransaction(async tx => {
    const [cls, prior, open] = await Promise.all([tx.get(db().doc(`classes/${id(classId)}`)), tx.get(ref), tx.get(goalsRef(classId).where('status', '==', 'open'))]);
    classOwner(ctx, cls);
    if (prior.exists) return publicPointGoal(prior.id, prior.data()!);
    if (!pointSettings(cls.data()?.pointSettings).enabled) throw new ApiError(409, '보말 사용을 먼저 켜 주세요.', 'POINTS_DISABLED');
    assertGoalSlot(open.size);
    const value = {classId, ...parsed, raised: 0, status: 'open', donors: {}, createdBy: ctx.uid, createdAt: at.toISOString(), reachedAt: null, rewardedAt: null, failedAt: null, failReason: null};
    tx.create(ref, value);
    return publicPointGoal(ref.id, value);
  });
  return json({goal}, 201);
}
async function rewardGoal(request: Request, classId: string, goalId: string) {
  const ctx = await requireTeacher(request), ref = goalsRef(classId).doc(id(goalId));
  const goal = await db().runTransaction(async tx => {
    const [cls, snap] = await Promise.all([tx.get(db().doc(`classes/${id(classId)}`)), tx.get(ref)]);
    classOwner(ctx, cls);
    if (!snap.exists) throw new ApiError(404, '기부를 찾을 수 없어요.', 'GOAL_NOT_FOUND');
    const value = snap.data()!;
    if (value.status === 'rewarded') return publicPointGoal(snap.id, value);
    if (value.status !== 'reached') throw new ApiError(409, '목표를 채운 기부만 보상 완료로 표시할 수 있어요.', 'GOAL_NOT_REACHED');
    const next = {status: 'rewarded', rewardedAt: new Date().toISOString()};
    tx.update(ref, next);
    return publicPointGoal(snap.id, {...value, ...next});
  });
  return json({goal});
}

async function studentGoals(request: Request) {
  const ctx = await requireStudent(request), {cls, pupil} = await activeStudent(ctx);
  return json({goals: await listGoals(ctx.classId), settings: pointSettings(cls.data()?.pointSettings), studentId: ctx.studentId, points: pointBalance(pupil.data()?.points)});
}
async function donate(request: Request, goalId: string) {
  const ctx = await requireStudent(request), data = await input(request), requestId = id(data.requestId), at = new Date();
  const ref = goalsRef(ctx.classId).doc(id(goalId)), ledger = ledgerRef(ctx.classId, ctx.studentId).doc(pointLedgerId('donation', `${goalId}:${requestId}`, ctx.studentId));
  const result = await db().runTransaction(async tx => {
    const {cls, pupil} = await activeStudent(ctx, tx), [goal, prior] = await Promise.all([tx.get(ref), tx.get(ledger)]);
    if (!goal.exists) throw new ApiError(404, '기부를 찾을 수 없어요.', 'GOAL_NOT_FOUND');
    const value = goal.data()!;
    if (prior.exists) return {goal: publicPointGoal(goal.id, value), points: pointBalance(pupil.data()?.points), reached: false, repeated: true};
    if (!pointSettings(cls.data()?.pointSettings).enabled) throw new ApiError(409, '선생님이 보말을 켜면 기부할 수 있어요.', 'POINTS_DISABLED');
    const decision = goalDonationDecision(value, pointBalance(pupil.data()?.points), data.amount, at), amount = data.amount as number;
    const student = pupil.data()!, before = value.donors?.[ctx.studentId]?.amount;
    const donor = {name: String(student.name ?? ''), number: Number(student.number) || 0, amount: (Number.isSafeInteger(before) ? before : 0) + amount};
    const next: Data = {raised: decision.raised, [`donors.${ctx.studentId}`]: donor, ...(decision.reached ? {status: 'reached', reachedAt: at.toISOString(), reachedBy: ctx.studentId} : {})};
    tx.update(pupil.ref, {points: decision.balance});
    tx.create(ledger, {classId: ctx.classId, studentId: ctx.studentId, amount: -amount, kind: 'spend', source: 'donation', sourceId: goal.id, reason: `기부 · ${value.title}`, actorUid: ctx.uid, balanceAfter: decision.balance, createdAt: at.toISOString()});
    tx.update(ref, next);
    const merged = {...value, raised: decision.raised, donors: {...(value.donors ?? {}), [ctx.studentId]: donor}, ...(decision.reached ? {status: 'reached', reachedAt: at.toISOString()} : {})};
    return {goal: publicPointGoal(goal.id, merged), points: decision.balance, reached: decision.reached, repeated: false};
  });
  return json(result);
}

/** Routes under /api/points that belong to 보말 기부; null when the path is not one of them. */
export async function handlePointGoals(request: Request, segments: string[]) {
  if (segments[0] === 'goals') {
    if (segments.length === 1 && request.method === 'GET') return studentGoals(request);
    if (segments.length === 3 && segments[2] === 'donate' && request.method === 'POST') return donate(request, segments[1]);
  }
  if (segments[0] === 'classes' && segments[2] === 'goals') {
    const classId = id(segments[1]);
    if (segments.length === 3 && request.method === 'GET') return teacherGoals(request, classId);
    if (segments.length === 3 && request.method === 'POST') return createGoal(request, classId);
    if (segments.length === 5 && segments[4] === 'fail' && request.method === 'POST') {
      const ctx = await requireTeacher(request);
      return json({goal: await failGoal(classId, segments[3], 'teacher', ctx)});
    }
    if (segments.length === 5 && segments[4] === 'rewarded' && request.method === 'POST') return rewardGoal(request, classId, segments[3]);
  }
  return null;
}
