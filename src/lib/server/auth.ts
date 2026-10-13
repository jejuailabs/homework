import 'server-only';
import { auth, db } from './admin';
import { ApiError, validStudentSession, type Role } from './policy';

export type Context = { uid: string; email: string | null; displayName: string | null; role: Role; studentId?: string; classId?: string };
export const cookieName = '__session';
export function assertOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site' || (origin && origin !== new URL(request.url).origin)) throw new ApiError(403, '이 화면에서 다시 시도해 주세요.', 'ORIGIN');
  // Browsers send Origin on these JSON mutations. Reject unauthenticated cross-site forms.
  if (!request.headers.get('content-type')?.includes('application/json') && request.method !== 'DELETE') throw new ApiError(415, '요청 형식을 확인해 주세요.');
}
export async function contextForUid(uid: string, authVersion?: unknown): Promise<Context> {
  const [userRecord, userDoc, roleDoc] = await Promise.all([auth().getUser(uid), db().doc(`users/${uid}`).get(), db().doc(`platformRoles/${uid}`).get()]);
  if (userRecord.disabled || userDoc.data()?.disabled) throw new ApiError(403, '이 계정은 이용이 중지되어 있어요.', 'ACCOUNT_DISABLED');
  const user = userDoc.data();
  const platformRole = roleDoc.data()?.role;
  const role: Role = platformRole === 'superadmin' || platformRole === 'admin' ? platformRole : user?.role === 'student' ? 'student' : 'teacher';
  if (role === 'student') {
    if (!user?.studentId || !user?.classId) throw new ApiError(403, '학생 계정을 다시 확인해 주세요.');
    if (!validStudentSession(authVersion, user.authVersion ?? 0)) throw new ApiError(401, '새 학생 코드로 다시 로그인해 주세요.', 'CODE_RESET');
    const student = await db().doc(`classes/${user.classId}/students/${user.studentId}`).get();
    if (!student.exists || student.data()?.authUid !== uid || student.data()?.disabled) throw new ApiError(403, '학생 코드를 선생님께 다시 확인해 주세요.');
  } else if (!userRecord.emailVerified || !userRecord.providerData.some(p => p.providerId === 'google.com')) {
    throw new ApiError(403, '선생님은 Google 계정으로 로그인해 주세요.', 'GOOGLE_REQUIRED');
  }
  return { uid, email: userRecord.email ?? null, displayName: userRecord.displayName ?? user?.displayName ?? null, role, ...(role === 'student' ? { studentId: user!.studentId, classId: user!.classId } : {}) };
}
export async function getContext(request: Request): Promise<Context> {
  const raw = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!raw) throw new ApiError(401, '로그인이 필요해요.', 'UNAUTHENTICATED');
  try {
    const decoded = await auth().verifySessionCookie(decodeURIComponent(raw), true);
    return await contextForUid(decoded.uid, decoded.authVersion);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, '로그인이 만료되었어요. 다시 로그인해 주세요.', 'UNAUTHENTICATED');
  }
}
export async function requireTeacher(request: Request) {
  const ctx = await getContext(request);
  if (ctx.role === 'student') throw new ApiError(403, '선생님만 사용할 수 있어요.', 'FORBIDDEN');
  return ctx;
}
export async function requireStudent(request: Request) {
  const ctx = await getContext(request);
  if (ctx.role !== 'student') throw new ApiError(403, '학생 화면에서 이용해 주세요.', 'FORBIDDEN');
  return ctx as Context & { studentId: string; classId: string };
}
