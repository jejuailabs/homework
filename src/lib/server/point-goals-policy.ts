import {ApiError, text} from './policy';
import {POINT_GOAL_OPEN_LIMIT, type PointGoal, type PointGoalDonor, type PointGoalStatus} from '../points-types';

type Data = Record<string, any>;
const STATUSES: PointGoalStatus[] = ['open', 'reached', 'rewarded', 'failed'];
const MAX_TARGET = 1_000_000;

/** 보상 이름·설명·목표 보말·마감(선택). The deadline must be in the future. */
export function parsePointGoal(value: Data, now: Date) {
  const title = text(value.title, '보상 이름', 60);
  const description = value.description === undefined || value.description === null || value.description === '' ? '' : text(value.description, '설명', 300);
  const target = value.target;
  if (typeof target !== 'number' || !Number.isSafeInteger(target) || target < 1 || target > MAX_TARGET) throw new ApiError(400, '목표 보말을 1~1,000,000 사이로 정해 주세요.', 'GOAL_TARGET');
  let dueAt: string | null = null;
  if (value.dueAt !== undefined && value.dueAt !== null && value.dueAt !== '') {
    const due = typeof value.dueAt === 'string' ? new Date(value.dueAt) : new Date(NaN);
    if (Number.isNaN(due.getTime()) || due.getTime() <= now.getTime()) throw new ApiError(400, '마감은 지금보다 뒤로 정해 주세요.', 'GOAL_DUE');
    dueAt = due.toISOString();
  }
  return {title, description, target, dueAt};
}
/**
 * 선생님이 연 기부 고치기. 모으는 중이면 보상·설명·목표·마감을 모두 바꿀 수 있고, 목표는 이미 모인 보말보다 커야 해요(바꾸자마자 달성되지 않게).
 * 이미 끝난 기부(달성·보상 완료·실패)는 이름과 설명만 고쳐요.
 */
export function parsePointGoalEdit(value: Data, current: Data, now: Date) {
  if (current.status !== 'open') {
    const title = text(value.title, '보상 이름', 60);
    const description = value.description === undefined || value.description === null || value.description === '' ? '' : text(value.description, '설명', 300);
    return {title, description};
  }
  const parsed = parsePointGoal(value, now), raised = Number.isSafeInteger(current.raised) ? current.raised : 0;
  if (parsed.target <= raised) throw new ApiError(400, `이미 ${raised}개가 모였어요. 목표는 ${raised + 1}개 이상으로 정해 주세요.`, 'GOAL_TARGET_BELOW');
  return parsed;
}
export function assertGoalSlot(openCount: number) {
  if (openCount >= POINT_GOAL_OPEN_LIMIT) throw new ApiError(409, `진행 중인 기부는 ${POINT_GOAL_OPEN_LIMIT}개까지 열 수 있어요.`, 'GOAL_LIMIT');
}
export function goalOverdue(goal: {status?: unknown; dueAt?: unknown}, now: Date) {
  return goal.status === 'open' && typeof goal.dueAt === 'string' && new Date(goal.dueAt).getTime() <= now.getTime();
}
function donorMap(value: unknown): Record<string, PointGoalDonor> {
  const result: Record<string, PointGoalDonor> = {};
  if (!value || typeof value !== 'object') return result;
  for (const [studentId, raw] of Object.entries(value as Data)) {
    if (!raw || typeof raw !== 'object' || !Number.isSafeInteger(raw.amount) || raw.amount <= 0) continue;
    result[studentId] = {studentId, name: String(raw.name ?? ''), number: Number(raw.number) || 0, amount: raw.amount};
  }
  return result;
}
/**
 * One donation. "딱 맞게": a student cannot give more than what is still missing, nor more than their balance.
 * Returns the new goal totals and the student's balance afterwards.
 */
export function goalDonationDecision(goal: Data, balance: number, amount: unknown, now: Date) {
  if (goal.status !== 'open') throw new ApiError(409, '이미 끝난 기부예요.', 'GOAL_CLOSED');
  if (goalOverdue(goal, now)) throw new ApiError(409, '마감이 지나 기부를 받을 수 없어요.', 'GOAL_CLOSED');
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 1) throw new ApiError(400, '기부할 보말 수를 확인해 주세요.', 'POINT_AMOUNT');
  const raised = Number.isSafeInteger(goal.raised) ? goal.raised : 0, remaining = Math.max(0, goal.target - raised);
  if (amount > remaining) throw new ApiError(409, `남은 보말은 ${remaining}개예요. 딱 맞게만 낼 수 있어요.`, 'GOAL_OVER');
  if (amount > balance) throw new ApiError(409, '가진 보말보다 많이 낼 수 없어요.', 'POINTS_INSUFFICIENT');
  const next = raised + amount;
  return {raised: next, remaining: remaining - amount, reached: next >= goal.target, balance: balance - amount};
}
/** Who gets what back when a mission fails: every donor, their whole amount. */
export function goalRefunds(goal: Data) {
  return Object.values(donorMap(goal.donors));
}
export function publicPointGoal(goalId: string, value: Data): PointGoal {
  const status = STATUSES.includes(value.status) ? value.status as PointGoalStatus : 'open';
  return {
    id: goalId, title: String(value.title ?? ''), description: String(value.description ?? ''), target: Number(value.target) || 0, raised: Number.isSafeInteger(value.raised) ? value.raised : 0, status,
    dueAt: typeof value.dueAt === 'string' ? value.dueAt : null,
    donors: Object.values(donorMap(value.donors)).sort((a, b) => b.amount - a.amount || a.number - b.number),
    createdAt: String(value.createdAt ?? ''), reachedAt: value.reachedAt ?? null, rewardedAt: value.rewardedAt ?? null, failedAt: value.failedAt ?? null,
    failReason: value.failReason === 'teacher' || value.failReason === 'deadline' ? value.failReason : null,
  };
}
