export function diaryToday(now = Date.now()) {return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);}
export function diaryMonthLabel(month: string) {const [year, value] = month.split('-'); return `${Number(year)}년 ${Number(value)}월`;}
export function moveDiaryMonth(month: string, delta: number) {const [year, value] = month.split('-').map(Number); return new Date(Date.UTC(year, value - 1 + delta, 1)).toISOString().slice(0, 7);}
/** Stable civil-date keys; the host timezone never changes the chosen day. */
export function diaryCalendarDays(month: string): (string | null)[] {
  if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('달력을 다시 선택해 주세요.');
  const [year, value] = month.split('-').map(Number), start = new Date(Date.UTC(year, value - 1, 1)).getUTCDay(), count = new Date(Date.UTC(year, value, 0)).getUTCDate();
  const cells: (string | null)[] = Array(start).fill(null);
  for (let day = 1; day <= count; day++) cells.push(`${month}-${String(day).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}
