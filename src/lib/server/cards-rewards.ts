import 'server-only';
import { NextResponse } from 'next/server';
import { db } from './admin';
import type { Context } from './auth';
import { ApiError, canManageClass, id } from './policy';
import { canStudyDistribution, publicProgress } from './cards-policy';
import { addPointBalance, pointBalance, pointSettings } from './points-policy';
import { CARD_REWARDS, cardRewardKinds, cardRewardLedgerId, type CardRewardKind } from './cards-share-policy';
import type { CardDistribution } from '../cards-types';

/**
 * 카드놀이 보말. 반의 보말·꾸미기가 켜져 있고 선생님이 카드놀이 보말을 켠 반에서만 준다(`classes/{classId}/settings/cards`, 기본 꺼짐).
 * 배부마다 필수 학습 첫 완료 +5, 테스트 목표 첫 달성 +10. 장부 ID가 `cards_{kind}_{distributionId}`로 고정이라 재전송·새로고침·다시 풀기로 두 번 받지 않는다.
 * 게임 점수·복습·반복 학습에는 주지 않는다. 보말은 성적이 아니며 리포트·학부모 링크에 넣지 않는다.
 * 하루·1회 지급 한도는 point.md §0에 따라 두지 않는다. 금액이 작고 배부·종류마다 한 번뿐이라 배부 하나에 최대 15개다.
 */
type Data = Record<string, any>;
type Distribution = CardDistribution & { ownerUid: string };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const settingsRef = (classId: string) => db().doc(`classes/${id(classId, '우리 반')}/settings/cards`);
const pupilRef = (classId: string, studentId: string) => db().doc(`classes/${id(classId)}/students/${id(studentId)}`);
const noop = () => {};

/**
 * Call inside the study or test transaction after every other read and before the first write.
 * `before` is the stored progress, `after` the progress about to be saved; a reward is due only when a flag turns on now.
 * Writes nothing itself: it marks `after.pointRewards` (so the progress write carries it) and returns the ledger writes to run with the rest.
 */
export async function prepareCardRewards(tx: FirebaseFirestore.Transaction, ctx: { uid: string; classId: string; studentId: string }, distribution: Distribution, before: Data | undefined, after: Data) {
  const flags = (raw: Data | undefined) => publicProgress(raw, distribution.snapshot, distribution.requiredModes, distribution.test);
  const kinds = cardRewardKinds(flags(before), flags(after), distribution.requiredModes, distribution.test.goalScore);
  if (!kinds.length) return noop;
  const pupil = pupilRef(ctx.classId, ctx.studentId), receipts = kinds.map(kind => pupil.collection('pointLedger').doc(cardRewardLedgerId(kind, distribution.id)));
  const [cls, settings, me, ...paid] = await Promise.all([tx.get(db().doc(`classes/${ctx.classId}`)), tx.get(settingsRef(ctx.classId)), tx.get(pupil), ...receipts.map(ref => tx.get(ref))]);
  if (cls.data()?.ownerUid !== distribution.ownerUid || !pointSettings(cls.data()?.pointSettings).enabled || settings.data()?.rewardsEnabled !== true || !me.exists || me.data()?.disabled) return noop;
  let balance = pointBalance(me.data()?.points), earned = pointBalance(me.data()?.pointsEarnedTotal);
  const stamp = new Date().toISOString(), writes: { ref: FirebaseFirestore.DocumentReference; record: Data }[] = [];
  kinds.forEach((kind, index) => {
    if (paid[index].exists) return;
    const amount = CARD_REWARDS[kind];
    balance = addPointBalance(balance, amount); earned = addPointBalance(earned, amount);
    writes.push({ ref: receipts[index], record: { classId: ctx.classId, studentId: ctx.studentId, amount, kind: 'earn', source: 'cards', sourceId: distribution.id, reward: kind, reason: `${kind === 'study' ? '카드놀이 필수 학습 완료' : '카드놀이 테스트 목표 달성'} · ${String(distribution.title ?? '').slice(0, 80)}`, actorUid: ctx.uid, balanceAfter: balance, createdAt: stamp } });
    after.pointRewards = { ...(after.pointRewards ?? {}), [kind]: amount };
  });
  if (!writes.length) return noop;
  return () => {
    tx.update(pupil, { points: balance, pointsEarnedTotal: earned });
    for (const write of writes) tx.create(write.ref, write.record);
  };
}

async function ownedClass(ctx: Context, classId: string) {
  if (ctx.role === 'student') throw new ApiError(403, '선생님만 사용할 수 있어요.', 'FORBIDDEN');
  const snap = await db().doc(`classes/${id(classId, '우리 반')}`).get();
  if (!snap.exists || !canManageClass(ctx.role, ctx.uid, snap.data()?.ownerUid)) throw new ApiError(404, '항목을 찾을 수 없어요.', 'NOT_FOUND');
  return snap;
}
/** GET/PATCH `classes/{classId}/rewards`: the class's 카드놀이 보말 switch, with the class 보말 state so the screen can say why nothing is paid. */
export async function cardRewardSettings(ctx: Context, request: Request, classId: string) {
  const cls = await ownedClass(ctx, classId), points = pointSettings(cls.data()?.pointSettings);
  let enabled = (await settingsRef(classId).get()).data()?.rewardsEnabled === true;
  if (request.method === 'PATCH') {
    const raw = await request.text();
    if (raw.length > 1_000) throw new ApiError(413, '입력 내용이 너무 커요.');
    let input: Data;
    try { input = JSON.parse(raw || '{}'); } catch { throw new ApiError(400, '입력 내용을 확인해 주세요.'); }
    if (typeof input?.rewardsEnabled !== 'boolean') throw new ApiError(400, '보말 설정을 확인해 주세요.', 'REWARD_SETTINGS');
    enabled = input.rewardsEnabled;
    await settingsRef(classId).set({ rewardsEnabled: enabled, updatedAt: new Date().toISOString() }, { merge: true });
  } else if (request.method !== 'GET') throw new ApiError(404, '카드놀이 기능을 찾을 수 없어요.', 'NOT_FOUND');
  return json({ rewardsEnabled: enabled, pointsEnabled: points.enabled, label: points.label, amounts: CARD_REWARDS });
}

/** GET `distributions/{id}/rewards` for the student: the two fixed receipts of this distribution, so the screen can show a reward moment once. */
export async function studentCardRewards(ctx: Context, distributionId: string) {
  if (ctx.role !== 'student' || !ctx.classId || !ctx.studentId) throw new ApiError(403, '학생 화면에서 이용해 주세요.', 'FORBIDDEN');
  const snap = await db().doc(`cardClassSets/${id(distributionId)}`).get(), value = snap.data() as Distribution | undefined;
  if (!snap.exists || !canStudyDistribution(ctx, { ...value!, active: true })) throw new ApiError(404, '우리 반에 나눠 준 세트를 찾을 수 없어요.', 'NOT_FOUND');
  const pupil = pupilRef(ctx.classId, ctx.studentId), kinds: CardRewardKind[] = ['study', 'goal'];
  const [cls, me, ...receipts] = await db().getAll(db().doc(`classes/${ctx.classId}`), pupil, ...kinds.map(kind => pupil.collection('pointLedger').doc(cardRewardLedgerId(kind, snap.id))));
  if (!cls.exists || cls.data()?.ownerUid !== value!.ownerUid || !me.exists || me.data()?.disabled || me.data()?.authUid !== ctx.uid) throw new ApiError(403, '학생 코드를 선생님께 다시 확인해 주세요.', 'STUDENT_UNAVAILABLE');
  const rewards = receipts.flatMap((receipt, index) => receipt.exists ? [{ id: receipt.id, kind: kinds[index], amount: Number(receipt.data()!.amount) || 0, at: String(receipt.data()!.createdAt ?? '') }] : []);
  return json({ label: pointSettings(cls.data()?.pointSettings).label, rewards });
}
