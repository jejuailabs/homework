import 'server-only';
import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import {db} from '@/lib/server/admin';
import {contextForUid, type Context} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';

/**
 * Sign-in for the Berry phone app. The app opens /berry/app-login in the system browser with a PKCE challenge; a signed-in
 * teacher approves, gets a one-time code back in the app's return URL, and the app trades code + verifier for an opaque app
 * token. Only hashes are stored (berryAppCodes, berryAppSessions; server-only by the catch-all rule). The token is checked
 * on every call like a session cookie: account state, role and Berry access are re-read each time.
 */
const CODE_SECONDS = 120, SESSION_DAYS = 30;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');
const B64URL = /^[A-Za-z0-9_-]{43,128}$/;
const now = () => new Date();

/** A berry:// link from an installed build, or exp:// from Expo Go while testing. PKCE makes a stolen code useless. */
export function validReturnUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 300) return false;
  try {const url = new URL(value); return url.protocol === 'berry:' || url.protocol === 'exp:' || url.protocol === 'exps:';} catch {return false;}
}

export async function issueAppCode(uid: string, challenge: unknown) {
  if (typeof challenge !== 'string' || !B64URL.test(challenge)) throw new ApiError(400, '앱 로그인 요청을 확인해 주세요.');
  const code = randomBytes(32).toString('base64url');
  await db().doc(`berryAppCodes/${hash(code)}`).create({uid, challenge, expiresAt: new Date(Date.now() + CODE_SECONDS * 1000), createdAt: now()});
  return code;
}

export async function redeemAppCode(code: unknown, verifier: unknown) {
  if (typeof code !== 'string' || !B64URL.test(code) || typeof verifier !== 'string' || !B64URL.test(verifier)) throw new ApiError(400, '앱 로그인 요청을 확인해 주세요.');
  const codeRef = db().doc(`berryAppCodes/${hash(code)}`), token = `bat_${randomBytes(32).toString('base64url')}`;
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db().runTransaction(async tx => {
    const snap = await tx.get(codeRef), data = snap.data();
    // Single use: a successful exchange deletes the code; a failed one leaves it to expire within two minutes.
    if (snap.exists) tx.delete(codeRef);
    const expected = Buffer.from(String(data?.challenge ?? '')), actual = Buffer.from(s256(verifier));
    if (!data || (data.expiresAt?.toDate?.() ?? new Date(0)) <= now() || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new ApiError(400, '로그인 시간이 지났어요. 앱에서 다시 시도해 주세요.', 'APP_CODE_INVALID');
    tx.create(db().doc(`berryAppSessions/${hash(token)}`), {uid: data.uid, createdAt: now(), expiresAt, lastUsedAt: now()});
  });
  return {token, expiresAt: expiresAt.toISOString()};
}

/** Context for a request carrying an app token, or null when the request has none. */
export async function appContext(request: Request): Promise<Context | null> {
  const match = /^Bearer\s+(bat_[A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') ?? '');
  if (!match) return null;
  const ref = db().doc(`berryAppSessions/${hash(match[1])}`), snap = await ref.get(), data = snap.data();
  if (!data || (data.expiresAt?.toDate?.() ?? new Date(0)) <= now()) throw new ApiError(401, '다시 로그인해 주세요.', 'UNAUTHENTICATED');
  // Revoked Google sessions (tokensValidAfterTime) end app sessions created before them.
  const ctx = await contextForUid(String(data.uid), undefined, Math.floor((data.createdAt?.toDate?.() ?? new Date(0)).getTime() / 1000));
  if (Date.now() - (data.lastUsedAt?.toDate?.()?.getTime() ?? 0) > 3_600_000) ref.update({lastUsedAt: now()}).catch(() => {});
  return ctx;
}

export async function endAppSession(request: Request) {
  const match = /^Bearer\s+(bat_[A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') ?? '');
  if (match) await db().doc(`berryAppSessions/${hash(match[1])}`).delete();
}
