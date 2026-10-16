import 'server-only';
import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setImmediate} from 'node:timers/promises';
import {validStudentCode} from '../student-entry-code';
import {ApiError} from './policy';

type Envelope = {v: 1; iv: string; tag: string; data: string};
let key: Buffer | undefined;
function vaultKey(): Buffer {
  if (key) return key;
  const explicit = process.env.STUDENT_CODE_ENCRYPTION_KEY?.trim();
  if (explicit) {
    const decoded = Buffer.from(explicit, 'base64');
    if (decoded.length !== 32) throw new ApiError(503, '학생 코드 보관 설정을 확인해 주세요.', 'CODE_VAULT_UNAVAILABLE');
    return key = decoded;
  }
  try {
    const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
      : JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, 'utf8'));
    if (typeof credential.private_key !== 'string' || credential.private_key.length < 100) throw new Error();
    return key = createHash('sha256').update('homework-student-code-vault-v1\0').update(credential.private_key).digest();
  } catch {throw new ApiError(503, '학생 코드 보관 설정을 확인해 주세요.', 'CODE_VAULT_UNAVAILABLE');}
}
export function studentCodeHash(code: string): string {return createHash('sha256').update(code).digest('hex');}
export function studentCodeBinding(classId: string, studentId: string, hash: string): string {return JSON.stringify([classId, studentId, hash]);}
export function sealStudentCode(code: string, binding: string, encryptionKey = vaultKey()): Envelope {
  if (!validStudentCode(code)) throw new Error('Invalid student code');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  cipher.setAAD(Buffer.from(binding));
  const data = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return {v: 1, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), data: data.toString('base64url')};
}
export function openStudentCode(envelope: unknown, binding: string, encryptionKey?: Buffer): string | null {
  try {
    const value = envelope as Envelope;
    if (!value || value.v !== 1 || ![value.iv, value.tag, value.data].every(v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v))) return null;
    const iv = Buffer.from(value.iv, 'base64url'), tag = Buffer.from(value.tag, 'base64url');
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey ?? vaultKey(), iv);
    decipher.setAAD(Buffer.from(binding)); decipher.setAuthTag(tag);
    const code = Buffer.concat([decipher.update(Buffer.from(value.data, 'base64url')), decipher.final()]).toString('utf8');
    return validStudentCode(code) ? code : null;
  } catch {return null;}
}

/** One-time compatibility for the six-digit codes issued before encrypted storage. */
export async function recoverNumericStudentCodes(hashes: Iterable<string>, range = {from: 0, to: 999999}): Promise<Map<string, string>> {
  const remaining = new Set([...hashes].filter(value => /^[a-f0-9]{64}$/.test(value))), found = new Map<string, string>();
  for (let n = range.from; remaining.size && n <= range.to; n++) {
    const code = String(n).padStart(6, '0'), hash = studentCodeHash(code);
    if (remaining.delete(hash)) found.set(hash, code);
    if (n % 50000 === 0) await setImmediate();
  }
  return found;
}
