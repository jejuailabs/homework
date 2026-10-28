import 'server-only';
import {createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual} from 'node:crypto';
import {ApiError} from '@/lib/server/policy';

export const DIARY_SESSION_MS = 20 * 60 * 1000;
export const DIARY_RECOVERY_MS = 30 * 60 * 1000;
export const DIARY_MAX_BYTES = 600_000;
export const diaryCookieName = 'diary_unlock';
export type DiaryEnvelope = {v: 1; iv: string; tag: string; data: string};
export type DiaryPinHash = {v: 1; salt: string; hash: string};
export type DiaryClaims = {uid: string; vaultId: string; authVersion: number; lockVersion: number; loginBinding: string; expiresAt: number};
export type DiaryAttempts = {failedAttempts?: number; blockedUntil?: number};

/** A dedicated, backed-up key is mandatory. Never borrow a Firebase signing credential. */
export function diaryKey(): Buffer {
  const value = process.env.DIARY_ENCRYPTION_KEY?.trim() || '';
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new ApiError(503, '일기장 보관 설정을 준비하고 있어요.', 'DIARY_UNAVAILABLE');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new ApiError(503, '일기장 보관 설정을 확인해 주세요.', 'DIARY_UNAVAILABLE');
  return key;
}
export function diaryAvailable() {try {diaryKey(); return true;} catch {return false;}}
export function diaryPin(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{6}$/.test(value)) throw new ApiError(400, '잠금번호는 숫자 6자리로 적어 주세요.', 'DIARY_PIN_FORMAT');
  return value;
}
const derive = (pin: string, salt: Buffer) => new Promise<Buffer>((resolve, reject) => {
  scrypt(pin, salt, 32, {N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024}, (error, key) => error ? reject(error) : resolve(key));
});
export async function hashDiaryPin(value: unknown): Promise<DiaryPinHash> {
  const pin = diaryPin(value), salt = randomBytes(16), hash = await derive(pin, salt);
  return {v: 1, salt: salt.toString('base64url'), hash: hash.toString('base64url')};
}
export async function verifyDiaryPin(value: unknown, saved: DiaryPinHash): Promise<boolean> {
  const pin = diaryPin(value);
  if (!saved || saved.v !== 1 || typeof saved.salt !== 'string' || typeof saved.hash !== 'string') return false;
  const salt = Buffer.from(saved.salt, 'base64url'), expected = Buffer.from(saved.hash, 'base64url');
  if (salt.length !== 16 || expected.length !== 32) return false;
  return timingSafeEqual(await derive(pin, salt), expected);
}
export function assertDiaryAttempt(attempt: DiaryAttempts, now = Date.now()) {
  if ((attempt.blockedUntil || 0) > now) throw new ApiError(429, '잠금번호를 여러 번 틀렸어요. 15분 뒤 다시 시도해 주세요.', 'DIARY_THROTTLED');
}
export function failedDiaryAttempt(attempt: DiaryAttempts, now = Date.now()) {
  const previous = (attempt.blockedUntil || 0) > 0 && (attempt.blockedUntil || 0) <= now ? 0 : (attempt.failedAttempts || 0);
  const failedAttempts = Math.min(5, previous + 1);
  return {failedAttempts, blockedUntil: failedAttempts >= 5 ? now + 15 * 60 * 1000 : 0};
}
export const diaryDigest = (value: string) => createHash('sha256').update(value).digest('hex');
export const diarySecret = () => randomBytes(24).toString('base64url');
export function sealDiary(value: unknown, binding: string, key = diaryKey()): DiaryEnvelope {
  const plain = Buffer.from(JSON.stringify(value), 'utf8');
  if (plain.length > DIARY_MAX_BYTES) throw new ApiError(413, '이 페이지가 가득 찼어요. 다음 페이지에 이어 써 주세요.', 'DIARY_PAGE_SIZE');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(binding));
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return {v: 1, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), data: data.toString('base64url')};
}
export function sealDiaryAsset(bytes: Uint8Array, binding: string, key = diaryKey()): DiaryEnvelope {
  if (bytes.length > 8 * 1024 * 1024) throw new ApiError(413, '이전 일기의 사진이 커서 운영 담당자의 이전 확인이 필요해요.', 'DIARY_ASSET_SIZE');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(binding));
  const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return {v: 1, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), data: data.toString('base64url')};
}
export function openDiaryAsset(value: DiaryEnvelope, binding: string, key = diaryKey()): Buffer {
  try {
    if (!value || value.v !== 1 || typeof value.data !== 'string' || value.data.length > 12 * 1024 * 1024) throw new Error();
    const iv = Buffer.from(value.iv, 'base64url'), tag = Buffer.from(value.tag, 'base64url');
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const cipher = createDecipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(binding)); cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(Buffer.from(value.data, 'base64url')), cipher.final()]);
  } catch {throw new ApiError(503, '사진을 안전하게 열지 못했어요. 운영 담당자에게 알려 주세요.', 'DIARY_READ_FAILED');}
}
export function openDiary<T>(value: DiaryEnvelope, binding: string, key = diaryKey()): T {
  try {
    if (!value || value.v !== 1 || typeof value.data !== 'string' || value.data.length > 800_000 || ![value.iv, value.tag].every(v => typeof v === 'string')) throw new Error();
    const iv = Buffer.from(value.iv, 'base64url'), tag = Buffer.from(value.tag, 'base64url');
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const cipher = createDecipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(binding)); cipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(value.data, 'base64url')), cipher.final()]).toString('utf8')) as T;
  } catch {throw new ApiError(503, '일기를 안전하게 열지 못했어요. 운영 담당자에게 알려 주세요.', 'DIARY_READ_FAILED');}
}
const signature = (body: string, key: Buffer) => createHmac('sha256', key).update('diary-session-v1\0').update(body).digest();
export function signDiarySession(claims: DiaryClaims, key = diaryKey()): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return body + '.' + signature(body, key).toString('base64url');
}
export function readDiarySession(token: string, expected: Omit<DiaryClaims, 'expiresAt'>, now = Date.now(), key = diaryKey()): DiaryClaims | null {
  try {
    if (token.length > 1800) return null;
    const [body, signed, extra] = token.split('.');
    if (!body || !signed || extra) return null;
    const actual = Buffer.from(signed, 'base64url'), wanted = signature(body, key);
    if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as DiaryClaims;
    if (claims.uid !== expected.uid || claims.vaultId !== expected.vaultId || claims.authVersion !== expected.authVersion || claims.lockVersion !== expected.lockVersion || claims.loginBinding !== expected.loginBinding || !Number.isSafeInteger(claims.expiresAt) || claims.expiresAt <= now || claims.expiresAt > now + DIARY_SESSION_MS) return null;
    return claims;
  } catch {return null;}
}
export function diaryRequestToken(request: Request) {
  return request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(diaryCookieName + '='))?.slice(diaryCookieName.length + 1) || '';
}
