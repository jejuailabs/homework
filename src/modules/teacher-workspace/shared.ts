/**
 * Pure helpers shared by the workspace screen and the server. No Node built-ins here: the browser bundle imports this file.
 * Korea has no daylight saving, so Asia/Seoul is always UTC+9.
 */
export class WorkspaceError extends Error {constructor(message: string, public status = 400, public code = 'INVALID_REQUEST') {super(message);}}
const DAY = 86_400_000, SEOUL_OFFSET = 9 * 3_600_000, DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isoDate(value: unknown, label = '날짜'): string {
  if (typeof value !== 'string' || !DATE.test(value)) throw new WorkspaceError(`${label}를 확인해 주세요.`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < '2020-01-01' || value > '2100-12-31') throw new WorkspaceError(`${label}를 확인해 주세요.`);
  return value;
}
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
/** Seoul calendar date of an instant. */
export const seoulDate = (value: string | number) => new Date((typeof value === 'number' ? value : Date.parse(value)) + SEOUL_OFFSET).toISOString().slice(0, 10);
/** Instant of 00:00 Seoul on a date. */
export const seoulMidnight = (date: string) => Date.parse(`${date}T00:00:00Z`) - SEOUL_OFFSET;
/** Inclusive Seoul dates an event covers, for display and day grouping. */
export function eventDates(start: string, end: string, allDay: boolean) {
  const startMs = Date.parse(start), endMs = Date.parse(end);
  return {startDate: seoulDate(startMs), endDate: seoulDate(allDay ? Math.max(startMs, endMs - 1) : endMs)};
}
// ---- ISO week keys ("2026-W45"), Monday first ----
const WEEK = /^(\d{4})-W(\d{2})$/;
function isoWeekParts(date: string) {
  const d = new Date(`${date}T00:00:00Z`), day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear(), week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return {year, week};
}
export function weekKeyOf(date: string) {
  const {year, week} = isoWeekParts(isoDate(date));
  return `${year}-W${String(week).padStart(2, '0')}`;
}
/** Monday to Sunday dates of an ISO week. */
export function weekDates(value: unknown): string[] {
  const match = typeof value === 'string' ? WEEK.exec(value) : null;
  if (!match) throw new WorkspaceError('주차를 2026-W45처럼 적어 주세요.');
  const year = Number(match[1]), week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4)), monday = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * DAY + (week - 1) * 7 * DAY);
  const first = monday.toISOString().slice(0, 10);
  if (week < 1 || weekKeyOf(first) !== value) throw new WorkspaceError('없는 주차예요.');
  return Array.from({length: 7}, (_, i) => addDays(first, i));
}
export const weekKey = (value: unknown) => {weekDates(value); return value as string;};

// ---- Files ----
export const WORKSPACE_FILE_BYTES = 50 * 1024 * 1024;
const FILE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
  hwp: 'application/x-hwp', hwpx: 'application/vnd.hancom.hwpx', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain', csv: 'text/csv', zip: 'application/zip',
};
export const WORKSPACE_FILE_TYPES = [...new Set(Object.values(FILE_TYPES))];
/** Browsers often report no type for HWP and similar files: fall back to the extension, and keep a known type canonical. */
export function workspaceFileMime(file: {type: string; name: string}) {
  const byExtension = FILE_TYPES[file.name.split('.').at(-1)?.toLowerCase() ?? ''];
  return WORKSPACE_FILE_TYPES.includes(file.type) ? file.type : byExtension ?? file.type;
}
