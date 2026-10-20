/** A broad March–November ramp, followed by cumulative practice through February.
 * Shared calendar progression never depends on an individual pupil's attendance. */
export const ANNUAL_QUIZ_VERSION = 'annual-v1';
export const ANNUAL_STAGES = 12;
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
