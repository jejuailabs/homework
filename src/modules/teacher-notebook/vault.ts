import 'server-only';
import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {NotebookError} from './policy';

/** AES-256-GCM envelope. The AAD binds a body to its teacher and entry so a copied ciphertext does not open elsewhere. */
export type NotebookEnvelope = {v: 1; iv: string; tag: string; data: string};
let keys: {body: Buffer; unlock: Buffer} | undefined;
function rootKey(): Buffer {
  const explicit = process.env.TEACHER_NOTEBOOK_ENCRYPTION_KEY?.trim();
  if (explicit) {
    const decoded = Buffer.from(explicit, 'base64');
    if (decoded.length !== 32) throw new NotebookError('교무수첩 보안 설정을 확인해 주세요.', 503, 'NOTEBOOK_UNAVAILABLE');
    return decoded;
  }
  try {
    const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
      : JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!, 'utf8'));
    if (typeof credential.private_key !== 'string' || credential.private_key.length < 100) throw new Error();
    return createHash('sha256').update('homework-teacher-notebook-v1\0').update(credential.private_key).digest();
  } catch {throw new NotebookError('교무수첩 보안 설정을 확인해 주세요.', 503, 'NOTEBOOK_UNAVAILABLE');}
}
export function notebookKeys() {
  if (keys) return keys;
  const root = rootKey(), derive = (label: string) => createHash('sha256').update(`${label}\0`).update(root).digest();
  return keys = {body: derive('entry-body'), unlock: derive('unlock-cookie')};
}
const binding = (uid: string, entryId: string) => Buffer.from(JSON.stringify(['teacher-notebook-entry', uid, entryId]));
export function sealBody(body: string, uid: string, entryId: string): NotebookEnvelope {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', notebookKeys().body, iv);
  cipher.setAAD(binding(uid, entryId));
  const data = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()]);
  return {v: 1, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), data: data.toString('base64url')};
}
/** Null when the envelope is malformed or was not sealed for this teacher and entry. */
export function openBody(envelope: unknown, uid: string, entryId: string): string | null {
  try {
    const value = envelope as NotebookEnvelope;
    if (!value || value.v !== 1 || ![value.iv, value.tag, value.data].every(v => typeof v === 'string' && /^[A-Za-z0-9_-]+$/.test(v))) return null;
    const iv = Buffer.from(value.iv, 'base64url'), tag = Buffer.from(value.tag, 'base64url');
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', notebookKeys().body, iv);
    decipher.setAAD(binding(uid, entryId)); decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(value.data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {return null;}
}
