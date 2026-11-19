import 'server-only';
import {NextResponse} from 'next/server';
import {db} from './admin';
import type {Context} from './auth';
import {ApiError, canManageClass, id} from './policy';

export type Data = Record<string, any>;

export const json = (data: unknown, status = 200) => NextResponse.json(data, {status, headers: {'Cache-Control': 'private, no-store'}});
export const studentRef = (classId: string, studentId: string) => db().doc(`classes/${id(classId)}/students/${id(studentId)}`);
export const ledgerRef = (classId: string, studentId: string) => studentRef(classId, studentId).collection('pointLedger');
export async function input(request: Request): Promise<Data> {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 20000) throw new ApiError(413, '입력 내용이 너무 커요.');
  try {const body = JSON.parse(raw); if (body && typeof body === 'object' && !Array.isArray(body)) return body;} catch {}
  throw new ApiError(400, '입력 내용을 확인해 주세요.');
}
export function classOwner(ctx: Context, cls: FirebaseFirestore.DocumentSnapshot) {
  if (!cls.exists || !canManageClass(ctx.role, ctx.uid, cls.data()?.ownerUid)) throw new ApiError(403, '이 학급을 관리할 권한이 없어요.', 'FORBIDDEN');
}
export async function activeStudent(ctx: Context & {classId: string; studentId: string}, tx?: FirebaseFirestore.Transaction) {
  const refs = [db().doc(`classes/${ctx.classId}`), studentRef(ctx.classId, ctx.studentId), db().doc(`users/${ctx.uid}`)];
  const [cls, pupil, profile] = await Promise.all(refs.map(ref => tx ? tx.get(ref) : ref.get()));
  if (!cls.exists || !pupil.exists || pupil.data()?.disabled || pupil.data()?.authUid !== ctx.uid || !profile.exists || profile.data()?.disabled || profile.data()?.role !== 'student' || profile.data()?.classId !== ctx.classId || profile.data()?.studentId !== ctx.studentId) throw new ApiError(403, '학생 코드를 선생님께 다시 확인해 주세요.', 'STUDENT_UNAVAILABLE');
  return {cls, pupil};
}

