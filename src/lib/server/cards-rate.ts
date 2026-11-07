import 'server-only';
import { db } from './admin';
import { ApiError, id } from './policy';
import { CARD_TEACHER_LIMITS, hourlyRate, type CardTeacherAction } from '../cards-rate';

/**
 * Per-teacher hourly limit, one small doc per teacher and action (`cardRateLimits/{uid}_{action}`), like `playRoomLimits`.
 * Counted in a transaction so parallel tabs cannot slip past it. Server-only under the default-deny rules.
 */
export async function assertTeacherRate(uid: string, action: CardTeacherAction) {
  const ref = db().doc(`cardRateLimits/${id(uid)}_${action}`), limit = CARD_TEACHER_LIMITS[action];
  await db().runTransaction(async tx => {
    const now = Date.now(), rate = hourlyRate((await tx.get(ref)).data()?.recent, now, limit);
    if (!rate.allowed) throw new ApiError(429, `한 시간에 ${limit}번까지 할 수 있어요. 잠시 뒤 다시 해 주세요.`, 'TEACHER_RATE');
    tx.set(ref, { uid, action, recent: [...rate.kept, now], expiresAt: new Date(now + 3600_000) });
  });
}
