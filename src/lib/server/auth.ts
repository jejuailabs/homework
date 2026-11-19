import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { auth, db } from './admin';
import { ApiError, validSessionAuthentication, validStudentSession, viewAsMode, type Role } from './policy';
import { createContextCache } from './context-cache';

export type Context = { uid: string; email: string | null; displayName: string | null; role: Role; studentId?: string; classId?: string; authVersion?: number; viewedBy?: string };
export const cookieName = '__session';
/** Set only by the superadmin "view a teacher's screen" action; honoured only for a superadmin session. */
export const viewAsCookie = '__viewas';
function cookie(request: Request, name: string) {
  return request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);
}
// Verified contexts are memoised per instance for a short window so a burst of
// classroom traffic does not re-fetch the Auth record and account documents on
// every call. AUTH_CONTEXT_CACHE_MS=0 restores the fresh lookup per request.
const cacheWindow = Number(process.env.AUTH_CONTEXT_CACHE_MS ?? 30_000);
const contexts = createContextCache<Context>({ ttlMs: Number.isFinite(cacheWindow) && cacheWindow > 0 ? cacheWindow : 0 });
/** Drop memoised contexts after this instance changes an account's state (code reset, suspension, role change). */
export function forgetContext(uid: string) { contexts.forget(uid); }
/** The same-site check alone, for a body that is not JSON (a recorded WAV): a cross-site form cannot send that type without a preflight. */
export function assertSameSite(request: Request) {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site' || (origin && origin !== new URL(request.url).origin)) throw new ApiError(403, '이 화면에서 다시 시도해 주세요.', 'ORIGIN');
}
export function assertOrigin(request: Request) {
  assertSameSite(request);
  // Browsers send Origin on these JSON mutations. Reject unauthenticated cross-site forms.
  if (!request.headers.get('content-type')?.includes('application/json') && request.method !== 'DELETE') throw new ApiError(415, '요청 형식을 확인해 주세요.');
}
export async function contextForUid(uid: string, authVersion?: unknown, sessionAuthTime?: number): Promise<Context> {
  const [userRecord, userDoc, roleDoc] = await Promise.all([auth().getUser(uid), db().doc(`users/${uid}`).get(), db().doc(`platformRoles/${uid}`).get()]);
  if (userRecord.disabled || userDoc.data()?.disabled) throw new ApiError(403, '이 계정은 이용이 중지되어 있어요.', 'ACCOUNT_DISABLED');
  if (sessionAuthTime !== undefined && !validSessionAuthentication(sessionAuthTime, userRecord.tokensValidAfterTime)) throw new ApiError(401, '로그인이 만료되었어요. 다시 로그인해 주세요.', 'UNAUTHENTICATED');
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
  return { uid, email: userRecord.email ?? null, displayName: userRecord.displayName ?? user?.displayName ?? null, role, ...(role === 'student' ? { studentId: user!.studentId, classId: user!.classId, authVersion: authVersion as number } : {}) };
}
/**
 * Berry's confirmed writes run the app's own route handlers in-process. The teacher context is bound to the one
 * Request object the confirm step built, so nothing a client sends (headers, cookies) can ever select it.
 */
const acting = new AsyncLocalStorage<{request: Request; ctx: Context}>();
export function runAsTeacher<T>(request: Request, ctx: Context, run: () => Promise<T>) {
  if (ctx.role === 'student') throw new ApiError(403, '선생님만 사용할 수 있어요.', 'FORBIDDEN');
  return acting.run({request, ctx}, run);
}
export async function getContext(request: Request): Promise<Context> {
  const bound = acting.getStore();
  if (bound && bound.request === request) return bound.ctx;
  const raw = cookie(request, cookieName);
  if (!raw) throw new ApiError(401, '로그인이 필요해요.', 'UNAUTHENTICATED');
  try {
    // Verify the signature/issuer/expiry here on every request. Revocation and
    // account state come from the same fresh UserRecord used for provider checks,
    // memoised for at most the cache window; a code reset or suspension made on
    // this instance clears it at once via forgetContext.
    const decoded = await auth().verifySessionCookie(decodeURIComponent(raw), false);
    if (!validSessionAuthentication(decoded.auth_time)) throw new ApiError(401, '다시 로그인해 주세요.', 'UNAUTHENTICATED');
    const key = `${decoded.uid}|${typeof decoded.authVersion === 'number' ? decoded.authVersion : '-'}|${decoded.auth_time}`;
    const own = await contexts.remember(key, decoded.uid, () => contextForUid(decoded.uid, decoded.authVersion, decoded.auth_time));
    // A superadmin looking at a teacher's screen reads as that teacher and can change nothing.
    const target = cookie(request, viewAsCookie), mode = viewAsMode(own.role, target, new URL(request.url).pathname, request.method);
    if (mode === 'self') return own;
    if (mode === 'blocked') throw new ApiError(403, '교사 화면 보기 중에는 내용을 바꿀 수 없어요. 보기를 끝낸 뒤 이용해 주세요.', 'VIEW_ONLY');
    const teacher = await contexts.remember(`viewas|${target}`, target!, () => contextForUid(target!)).catch(() => null);
    if (!teacher || teacher.role !== 'teacher') throw new ApiError(403, '이 교사 화면은 지금 볼 수 없어요. 보기를 끝내 주세요.', 'VIEW_AS_UNAVAILABLE');
    return { ...teacher, viewedBy: own.uid };
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
