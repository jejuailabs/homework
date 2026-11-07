import { cardDueState } from './cards-logic';
import type { CardAfterDue, CardProgress, CardRequiredModes, CardStudyMode, CardTestSettings } from './cards-types';

// 예상 소요시간: 남은 필수량 × 모드별 한 장 시간. 한 곳에서만 고친다(학생 목록·상세, 배부 창, 베리가 같은 값).
export const CARD_SECONDS: Record<CardStudyMode | 'test', number> = { memorize: 4, recall: 6, spell: 10, test: 15 };
/** Above this many minutes in one day the student list shows a gentle warning, and the publish dialog a note. */
export const CARD_DAY_MINUTES = 30;
const MODES: CardStudyMode[] = ['memorize', 'recall', 'spell'];

type Plan = { requiredModes: CardRequiredModes; test: Pick<CardTestSettings, 'questionCount' | 'maxAttempts'> };
type Done = Partial<Pick<CardProgress, 'completedCounts' | 'attempts' | 'goalReached'>> | null | undefined;

/** What is left: required cards per mode not yet credited, and the test's questions until the goal is met or attempts run out. */
export function cardRemaining(plan: Plan, progress?: Done): Record<CardStudyMode | 'test', number> {
  const left = Object.fromEntries(MODES.map(mode => [mode, Math.max(0, (plan.requiredModes[mode]?.requiredCount ?? 0) - (progress?.completedCounts?.[mode] ?? 0))])) as Record<CardStudyMode, number>;
  const attemptsLeft = !plan.test.maxAttempts || (progress?.attempts ?? 0) < plan.test.maxAttempts;
  return { ...left, test: progress?.goalReached || !attemptsLeft ? 0 : Math.max(0, plan.test.questionCount || 0) };
}
/** Whole minutes, rounded up; anything left reads at least 1 minute, nothing left reads 0. */
export function cardEstimateMinutes(plan: Plan, progress?: Done) {
  const left = cardRemaining(plan, progress);
  const seconds = (Object.keys(left) as (CardStudyMode | 'test')[]).reduce((total, key) => total + left[key] * CARD_SECONDS[key], 0);
  return seconds ? Math.ceil(seconds / 60) : 0;
}
type Row = Plan & { id: string; title: string; dueAt: string | null; afterDue?: CardAfterDue; progress?: Done };
/** Today's load on the student list: sets still open with something left, nearest deadline first (no deadline last). */
export function cardDayLoad<T extends Row>(rows: T[], time: number) {
  const open = rows.map(row => ({ row, minutes: cardEstimateMinutes(row, row.progress) }))
    .filter(item => item.minutes > 0 && cardDueState(item.row, time) !== 'lock')
    .sort((a, b) => (a.row.dueAt ? Date.parse(a.row.dueAt) : Infinity) - (b.row.dueAt ? Date.parse(b.row.dueAt) : Infinity) || a.row.title.localeCompare(b.row.title));
  const minutes = open.reduce((total, item) => total + item.minutes, 0);
  return { minutes, heavy: minutes > CARD_DAY_MINUTES, order: open };
}
