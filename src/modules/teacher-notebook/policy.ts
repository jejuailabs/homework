import {createHmac, timingSafeEqual} from 'node:crypto';
import {NOTEBOOK_TAGS, SENSITIVE_TAGS, type NotebookAccessConfig, type NotebookStudentRef, type NotebookTag} from './types';
import {studentKey} from './mentions';
export {findMentions, mentionQuery, studentKey} from './mentions';
export {reportCsv} from './csv';

export class NotebookError extends Error {constructor(message: string, public status = 400, public code = 'INVALID_REQUEST') {super(message);}}
export const MAX_BODY = 4000, MAX_STUDENTS = 40, MAX_REPORT_DAYS = 400, MAX_REPORT_ENTRIES = 3000;
export const UNLOCK_SECONDS = 30 * 60, REAUTH_SECONDS = 5 * 60;

const DATE = /^\d{4}-\d{2}-\d{2}$/, MONTH = /^\d{4}-\d{2}$/, ID = /^[A-Za-z0-9_-]{1,200}$/;
export function notebookDate(value: unknown, label = '날짜'): string {
  if (typeof value !== 'string' || !DATE.test(value)) throw new NotebookError(`${label}를 확인해 주세요.`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < '2020-01-01' || value > '2100-12-31') throw new NotebookError(`${label}를 확인해 주세요.`);
  return value;
}
/** First and last calendar date of a YYYY-MM month. */
export function monthRange(value: unknown): {from: string; to: string} {
  if (typeof value !== 'string' || !MONTH.test(value)) throw new NotebookError('달을 확인해 주세요.');
  const [year, month] = value.split('-').map(Number);
  if (month < 1 || month > 12) throw new NotebookError('달을 확인해 주세요.');
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {from: notebookDate(`${value}-01`), to: notebookDate(`${value}-${String(last).padStart(2, '0')}`)};
}
export function daysBetween(from: string, to: string) {return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);}
export function reportRange(fromValue: unknown, toValue: unknown) {
  const from = notebookDate(fromValue, '시작일'), to = notebookDate(toValue, '종료일');
  if (to < from) throw new NotebookError('종료일이 시작일보다 앞서 있어요.');
  if (daysBetween(from, to) > MAX_REPORT_DAYS) throw new NotebookError(`리포트 기간은 ${MAX_REPORT_DAYS}일까지 고를 수 있어요.`);
  return {from, to};
}
export const isSensitive = (tags: readonly NotebookTag[], flagged: unknown) => flagged === true || tags.some(tag => SENSITIVE_TAGS.includes(tag));

export type EntryInput = {date: string; body: string; students: NotebookStudentRef[]; tags: NotebookTag[]; sensitive: boolean};
export function entryInput(value: Record<string, unknown>): EntryInput {
  const date = notebookDate(value.date);
  if (typeof value.body !== 'string' || !value.body.trim()) throw new NotebookError('기록 내용을 입력해 주세요.');
  const body = value.body.replace(/\r\n?/g, '\n').trim();
  if (body.length > MAX_BODY) throw new NotebookError(`기록은 ${MAX_BODY}자까지 쓸 수 있어요.`);
  if (value.students !== undefined && !Array.isArray(value.students)) throw new NotebookError('학생 선택을 확인해 주세요.');
  const seen = new Set<string>(), students: NotebookStudentRef[] = [];
  for (const item of (value.students as unknown[] | undefined) ?? []) {
    const ref = item as Partial<NotebookStudentRef> | null;
    if (!ref || typeof ref.classId !== 'string' || typeof ref.studentId !== 'string' || !ID.test(ref.classId) || !ID.test(ref.studentId)) throw new NotebookError('학생 선택을 확인해 주세요.');
    const key = studentKey(ref as NotebookStudentRef);
    if (!seen.has(key)) {seen.add(key); students.push({classId: ref.classId, studentId: ref.studentId});}
  }
  if (students.length > MAX_STUDENTS) throw new NotebookError(`한 기록에는 학생을 ${MAX_STUDENTS}명까지 연결할 수 있어요.`);
  if (value.tags !== undefined && !Array.isArray(value.tags)) throw new NotebookError('분류를 확인해 주세요.');
  const tags = [...new Set((value.tags as unknown[] | undefined) ?? [])];
  if (!tags.every(tag => NOTEBOOK_TAGS.includes(tag as NotebookTag))) throw new NotebookError('분류를 확인해 주세요.');
  const ordered = NOTEBOOK_TAGS.filter(tag => tags.includes(tag));
  return {date, body, students, tags: ordered, sensitive: isSensitive(ordered, value.sensitive)};
}

export function accessConfig(value: unknown): NotebookAccessConfig {
  const data = (value ?? {}) as Partial<NotebookAccessConfig>;
  const mode = data.mode === 'all' || data.mode === 'allowlist' ? data.mode : 'off';
  return {mode, teacherUids: Array.isArray(data.teacherUids) ? data.teacherUids.filter((uid): uid is string => typeof uid === 'string' && ID.test(uid)).slice(0, 500) : []};
}
/** Off by default. Platform administrators can always open their own notebook for verification. */
export function notebookAllowed(config: NotebookAccessConfig, uid: string, role: string, killSwitch?: string) {
  if (killSwitch === 'true' || role === 'student') return false;
  if (role === 'admin' || role === 'superadmin') return true;
  return config.mode === 'all' || config.mode === 'allowlist' && config.teacherUids.includes(uid);
}

const sign = (key: Buffer, payload: string) => createHmac('sha256', key).update(`teacher-notebook-unlock-v1\0${payload}`).digest('base64url');
export function unlockToken(key: Buffer, uid: string, nowSeconds: number) {
  const expires = nowSeconds + UNLOCK_SECONDS, payload = `${uid}.${expires}`;
  return {value: `${payload}.${sign(key, payload)}`, expires};
}
/** Returns the expiry (seconds) of a valid unlock token for this uid, or null. */
export function verifyUnlock(key: Buffer, token: string | undefined, uid: string, nowSeconds: number): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== uid || !/^\d{1,12}$/.test(parts[1])) return null;
  const expected = Buffer.from(sign(key, `${parts[0]}.${parts[1]}`)), actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const expires = Number(parts[1]);
  return expires > nowSeconds && expires <= nowSeconds + UNLOCK_SECONDS ? expires : null;
}
export function recentAuthentication(authTime: unknown, nowSeconds: number) {
  return typeof authTime === 'number' && Number.isFinite(authTime) && nowSeconds - authTime <= REAUTH_SECONDS && authTime <= nowSeconds + 60;
}
