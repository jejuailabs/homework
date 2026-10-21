/** English vocabulary and legacy pack preparation use a shared school calendar.
 * Student arithmetic uses completion-based progress below. */
export const ANNUAL_QUIZ_VERSION = 'annual-v1';
export const ANNUAL_STAGES = 12;
export const MATH_PRACTICE_VERSION = 'practice-v1';
export const MATH_DAYS_PER_STAGE = 10;
/** Attendance/completion, never the calendar month, determines arithmetic progress. */
export function quizMathProgress(completedDays: number) {
  const completed = Number.isSafeInteger(completedDays) && completedDays > 0 ? completedDays : 0;
  return {completedDays: completed, stage: Math.min(ANNUAL_STAGES - 1, Math.floor(completed / MATH_DAYS_PER_STAGE)), cumulative: completed >= ANNUAL_STAGES * MATH_DAYS_PER_STAGE};
}
export function quizPracticeMathStage(completedDays: number, index: number) {
  const plan = quizMathProgress(completedDays);
  if (plan.cumulative) return (plan.completedDays * 10 + index) % ANNUAL_STAGES;
  if (index < 6 || !plan.stage) return plan.stage;
  if (index < 9) return plan.stage - 1;
  return plan.completedDays % plan.stage;
}
export function quizCalendar(date: string) {
  const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7));
  const schoolYear = month < 3 ? year - 1 : year;
  const day = Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${schoolYear}-03-01T00:00:00Z`)) / 86400000);
  const rampDays = Math.floor((Date.parse(`${schoolYear}-12-01T00:00:00Z`) - Date.parse(`${schoolYear}-03-01T00:00:00Z`)) / 86400000);
  return {schoolYear, day, stage: Math.min(11, Math.floor(day * ANNUAL_STAGES / rampDays)), cumulative: day >= rampDays, semester: month >= 8 || month < 3 ? 2 : 1};
}
export function quizMathStage(date: string, index: number) {
  const plan = quizCalendar(date);
  if (plan.cumulative) return (plan.day * 10 + index) % ANNUAL_STAGES;
  if (index < 6 || !plan.stage) return plan.stage;
  if (index < 9) return Math.max(0, plan.stage - 1);
  return plan.day % plan.stage;
}
/** The word indices a calendar stage opens, matching the blocks used by quizWordIndices. */
export function quizStageWordIndices(stage: number, count: number) {
  const block = Math.ceil(count / ANNUAL_STAGES);
  return Array.from({length: Math.max(0, Math.min(block, count - stage * block))}, (_, i) => stage * block + i);
}
export function quizWordIndices(date: string, count: number) {
  const plan = quizCalendar(date), block = Math.ceil(count / ANNUAL_STAGES);
  const current = Array.from({length: Math.min(block, count - plan.stage * block)}, (_, i) => plan.stage * block + i);
  if (plan.cumulative) return Array.from({length: 10}, (_, i) => (plan.day * 10 + i) % count);
  const selected: number[] = [];
  const take = (pool: number[], amount: number, offset: number) => {
    for (let n = 0; n < pool.length && amount; n++) {
      const value = pool[(offset + n) % pool.length];
      if (!selected.includes(value)) {selected.push(value); amount--;}
    }
  };
  take(current, plan.stage ? 6 : 10, plan.day % current.length);
  const recent = Array.from({length: Math.min(block, plan.stage * block)}, (_, i) => (plan.stage - 1) * block + i);
  take(recent, 3, plan.day % (recent.length || 1));
  const learned = Array.from({length: Math.min(count, (plan.stage + 1) * block)}, (_, i) => i);
  take(learned, 10 - selected.length, plan.day % learned.length);
  return selected;
}
