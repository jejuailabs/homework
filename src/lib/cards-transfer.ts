// 다른 반에 배치·학기말 이월·클래스 복제: pure rules shared by the transfer dialog and the server.
// What moves to the new class: the sets (as new distributions), the class defaults and lesson memos/order, and for each linked
// student the card mastery (씨앗~꽃 level, review date), starred cards and recent misses. What stays with the old class: study counts,
// test attempts and scores, lateness, 보말 receipts, game records and parent links. The old class and its report are never changed.
import type {CardMisses, CardRequiredModes, CardReviewStates, CardTestSettings} from './cards-types';
import type {CardPlanItem} from './cards-class-plan';

export const CARD_TRANSFER_SETS = 50;
export const CARD_TRANSFER_LINKS = 300;
/** Distributions × linked students: every pair seeds one progress record, so one transfer stays well inside a few batches. */
export const CARD_TRANSFER_SEEDS = 3000;
export type CardTransferStudent = {id: string; name: string; number: number; disabled?: boolean};
export type CardTransferLink = {from: string; to: string};

const nameKey = (value: string) => value.normalize('NFKC').replace(/\s+/gu, '').toLocaleLowerCase('ko-KR');
/**
 * Suggests who is who across the two rosters: the same name on exactly one student on each side. Two students sharing a name
 * stay unmatched for the teacher to pick, because a wrong guess would hand one child's record to another.
 */
export function suggestStudentLinks(from: CardTransferStudent[], to: CardTransferStudent[]): CardTransferLink[] {
  const count = (rows: CardTransferStudent[]) => rows.reduce((map, row) => map.set(nameKey(row.name), (map.get(nameKey(row.name)) ?? 0) + 1), new Map<string, number>());
  const fromCount = count(from), toCount = count(to.filter(row => !row.disabled));
  const byName = new Map(from.map(row => [nameKey(row.name), row]));
  return to.filter(row => !row.disabled && nameKey(row.name) && toCount.get(nameKey(row.name)) === 1 && fromCount.get(nameKey(row.name)) === 1).map(row => ({from: byName.get(nameKey(row.name))!.id, to: row.id}));
}
/** One target student per source student and the other way round; unknown ids are refused. */
export function checkStudentLinks(links: CardTransferLink[], from: CardTransferStudent[], to: CardTransferStudent[]) {
  const fromIds = new Set(from.map(row => row.id)), toIds = new Set(to.filter(row => !row.disabled).map(row => row.id));
  if (links.length > CARD_TRANSFER_LINKS) return `학생 기록은 한 번에 ${CARD_TRANSFER_LINKS}명까지 이을 수 있어요.`;
  if (links.some(link => !fromIds.has(link.from) || !toIds.has(link.to))) return '두 반의 학생을 다시 골라 주세요.';
  if (new Set(links.map(link => link.from)).size !== links.length || new Set(links.map(link => link.to)).size !== links.length) return '한 학생의 기록은 한 학생에게만 이을 수 있어요.';
  return null;
}

/** A set may have changed since it was given out: ranges and counts are fitted to the card count of the version being placed. */
export function fitRequirements(modes: CardRequiredModes, cardCount: number): CardRequiredModes {
  return Object.fromEntries(Object.entries(modes).map(([mode, rule]) => {
    const rangeStart = Math.min(Math.max(1, rule.rangeStart), cardCount), rangeEnd = Math.min(Math.max(rangeStart, rule.rangeEnd), cardCount);
    return [mode, {...rule, rangeStart, rangeEnd, requiredCount: Math.min(rule.requiredCount, (rangeEnd - rangeStart + 1) * 10)}];
  })) as CardRequiredModes;
}
/**
 * The settings a placed set starts with. Deadlines belong to the old class's calendar, so they are dropped unless the teacher keeps them;
 * a test that showed answers after the deadline then shows them right after submitting instead of never.
 */
export function transferredSettings(source: {requiredModes: CardRequiredModes; test: CardTestSettings; dueAt: string | null; afterDue?: string; speechRate?: number | null; planDate?: string | null}, cardCount: number, keepDue: boolean) {
  const dueAt = keepDue ? source.dueAt : null;
  const test: CardTestSettings = {...source.test, questionCount: Math.min(Math.max(1, source.test.questionCount), cardCount), ...(source.test.answerRelease === 'after-due' && !dueAt ? {answerRelease: 'immediate' as const} : {})};
  return {requiredModes: fitRequirements(source.requiredModes, cardCount), test, dueAt, afterDue: dueAt ? (source.afterDue === 'late' || source.afterDue === 'lock' ? source.afterDue : 'open') : 'late', speechRate: source.speechRate ?? null, planDate: keepDue ? source.planDate ?? null : null};
}
/** Mastery moves only for cards the placed version still has. Levels and dates are copied as they are; nothing is earned twice. */
export function carriedCardStates(states: CardReviewStates, cardIds: string[]): CardReviewStates {
  const keep = new Set(cardIds);
  return Object.fromEntries(Object.entries(states).filter(([cardId]) => keep.has(cardId)));
}
/** The misses of the moved sets, renamed to the new distributions and limited to cards they still have. */
export function carriedMisses(misses: CardMisses, idMap: Map<string, {id: string; cardIds: string[]}>): CardMisses {
  const result: CardMisses = {};
  for (const [distributionId, cards] of Object.entries(misses ?? {})) {
    const target = idMap.get(distributionId);
    if (!target || !cards || typeof cards !== 'object') continue;
    const keep = new Set(target.cardIds), rows = Object.entries(cards).filter(([cardId]) => keep.has(cardId));
    if (rows.length) result[target.id] = Object.fromEntries(rows);
  }
  return result;
}
/** The old class's order, set rows renamed to the new distributions; memos come along, rows of sets that did not move are left out. */
export function remapPlan(plan: CardPlanItem[], idMap: Map<string, string>, existing: CardPlanItem[] = []): CardPlanItem[] {
  const present = new Set(existing.map(item => `${item.kind}:${item.id}`));
  const moved = plan.flatMap((item): CardPlanItem[] => item.kind === 'set' ? (idMap.has(item.id) ? [{...item, id: idMap.get(item.id)!}] : []) : [{...item, id: `${item.id}-c`.slice(0, 128)}]);
  return [...existing, ...moved.filter(item => !present.has(`${item.kind}:${item.id}`))];
}
