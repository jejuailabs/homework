// 함께 모은 성장 꽃 → 학급 나눔 꽃밭. Pure rules shared by the server, the screens and the tests.
// Nothing here moves money: a class month is a settlement record the operator pays out separately.

/** A class can grow at most this many sharing points a month (1 point = 1 won, 5% of the 30,000 won plan). */
export const MONTHLY_CAP = 1500;
export const WON_PER_POINT = 1;
export const CLASS_PLAN_WON = 30000;

export type SharingConfig = {
  /** Where the money goes. Chosen by the operator each round; empty until then. */
  recipient: string;
  /** Count only classes on the paid plan. Billing does not exist yet, so every class previews the garden. */
  requirePaid: boolean;
  /** National monthly target shown on the progress bar, in won. */
  monthlyGoalWon: number;
};

export function sharingConfig(env: Record<string, string | undefined> = {}): SharingConfig {
  const goal = Number(env.SHARING_GARDEN_GOAL_WON);
  return {
    recipient: (env.SHARING_GARDEN_RECIPIENT || '').trim().slice(0, 80),
    requirePaid: env.SHARING_GARDEN_REQUIRE_PAID === 'true',
    monthlyGoalWon: Number.isSafeInteger(goal) && goal > 0 ? goal : 1_500_000,
  };
}

/** YYYY-MM in Korea time, so a check at 23:30 on the last day still counts for that month. */
export function seoulMonth(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit'}).formatToParts(at);
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}`;
}
export function validMonth(value: unknown): value is string {
  return typeof value === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
}

const whole = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

/** Adds a reward to a class month. `points` keeps everything the class grew; `credited` stops at the cap. */
export function creditMonth(previous: {points?: unknown; credited?: unknown} | undefined, amount: number) {
  const before = whole(previous?.points), add = whole(amount);
  const points = before + add;
  const creditedBefore = Math.min(MONTHLY_CAP, whole(previous?.credited));
  const credited = Math.min(MONTHLY_CAP, points);
  return {points, credited, added: credited - creditedBefore, full: credited >= MONTHLY_CAP, justFilled: creditedBefore < MONTHLY_CAP && credited >= MONTHLY_CAP};
}

/** Billing placeholder: a class becomes paid when a future billing flow sets `billing.paid`. */
export function isPaidClass(cls: {billing?: {paid?: unknown}} | undefined) { return cls?.billing?.paid === true; }

/** Teachers opt in before their class name appears anywhere public. Student names never appear. */
export function publicClassLabel(cls: {name?: unknown; grade?: unknown; sharingGarden?: {showName?: unknown}} | undefined) {
  if (cls?.sharingGarden?.showName === true && typeof cls.name === 'string' && cls.name.trim()) return cls.name.trim().slice(0, 40);
  const grade = typeof cls?.grade === 'string' ? cls.grade.replace(/[^0-9]/g, '').slice(0, 1) : '';
  return grade ? `${grade}학년 어느 반` : '이름을 숨긴 반';
}

export const GARDEN_STAGES = [
  {min: 0, label: '씨앗', emoji: '🌰'},
  {min: 300, label: '새싹', emoji: '🌱'},
  {min: 750, label: '봉오리', emoji: '🌷'},
  {min: 1200, label: '꽃', emoji: '🌸'},
  {min: MONTHLY_CAP, label: '꽃밭 완성', emoji: '💐'},
] as const;
export function gardenStage(credited: number) {
  const value = Math.min(MONTHLY_CAP, whole(credited));
  let index = 0;
  GARDEN_STAGES.forEach((stage, i) => { if (value >= stage.min) index = i; });
  const next = GARDEN_STAGES[index + 1];
  return {index, ...GARDEN_STAGES[index], next: next ? next.min : null, percent: Math.round(value / MONTHLY_CAP * 100)};
}

export function percentOf(value: number, goal: number) {
  return goal > 0 ? Math.max(0, Math.min(100, Math.round(whole(value) / goal * 1000) / 10)) : 0;
}

export type NationalView = {
  month: string; preview: boolean; recipient: string;
  monthWon: number; monthClasses: number; fullClasses: number; goalWon: number; goalPercent: number;
  totalWon: number;
  /** True when the national totals could not be read this time; the class garden still shows. */
  unavailable?: boolean;
  ranking: {rank: number; label: string; won: number; full: boolean; mine?: boolean}[];
};
export type ClassView = {month: string; points: number; credited: number; cap: number; stage: ReturnType<typeof gardenStage>; showName: boolean; label: string; paid: boolean};
