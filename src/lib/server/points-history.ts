import type {TeacherPointLedgerEntry} from '../points-types';
import {ApiError, id} from './policy';

type Position = {createdAt: string; studentId: string; id: string};
export function comparePointHistory(a: Position, b: Position) {
  for (const key of ['createdAt', 'studentId', 'id'] as const) {
    if (a[key] !== b[key]) return a[key] > b[key] ? -1 : 1;
  }
  return 0;
}
export function pointHistoryCursor(classId: string, studentFilter: string, row: TeacherPointLedgerEntry) {
  return Buffer.from(JSON.stringify({classId, studentFilter, createdAt: row.createdAt, studentId: row.studentId, id: row.id})).toString('base64url');
}
export function parsePointHistoryCursor(value: string | null, classId: string, studentFilter: string): Position | null {
  if (!value) return null;
  try {
    if (value.length > 2048 || !/^[\w-]+$/.test(value)) throw new Error();
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (cursor.classId !== classId || cursor.studentFilter !== studentFilter || typeof cursor.createdAt !== 'string' || new Date(cursor.createdAt).toISOString() !== cursor.createdAt) throw new Error();
    return {createdAt: cursor.createdAt, studentId: id(cursor.studentId), id: id(cursor.id)};
  } catch {throw new ApiError(400, '목록 위치를 확인해 주세요.', 'INVALID_CURSOR');}
}
/** Global order is time, student ID, entry ID, all descending. Keep equal-time
 * entries from students below the cursor while skipping those already shown. */
export function pointHistoryBoundary(cursor: Position, studentId: string) {
  if (studentId === cursor.studentId) return {inclusive: false, values: [cursor.createdAt, cursor.id]};
  return {inclusive: studentId < cursor.studentId, values: [cursor.createdAt]};
}
