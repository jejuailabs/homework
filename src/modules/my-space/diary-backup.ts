import {spaceCatalog, type DiaryPage} from './catalog';
import {validateDiary} from './policy';

const FORMAT = 'homework-secret-diary';
const ITERATIONS = 310000;
const MAX_CLEAR_BYTES = 32 * 1024 * 1024;
export const MAX_DIARY_BACKUP_BYTES = 45 * 1024 * 1024;
export const MAX_DIARY_BACKUP_PAGES = 1000;
const encoder = new TextEncoder();
const aad = encoder.encode(`${FORMAT}:1:PBKDF2-SHA256:${ITERATIONS}:AES-256-GCM`);
function checkBackup(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('일기장이 잠겨서 백업 작업을 멈췄어요.', 'AbortError');
}

export type DiaryBackup = {
  format: typeof FORMAT;
  version: 1;
  createdAt: string;
  pageSize: {width: 720; height: 960};
  stickerAssets: 'diary/v1';
  pages: DiaryPage[];
};

type EncryptedDiaryBackup = {
  format: typeof FORMAT;
  version: 1;
  kdf: {name: 'PBKDF2'; hash: 'SHA-256'; iterations: typeof ITERATIONS; salt: string};
  cipher: {name: 'AES-GCM'; iv: string};
  ciphertext: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 16384)
    text += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(text);
}

function base64ToBytes(value: unknown, maxBytes: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4)
    throw new Error('백업 파일의 암호화 정보를 확인해 주세요.');
  try {
    const text = atob(value);
    if (text.length > maxBytes) throw new Error();
    return Uint8Array.from(text, c => c.charCodeAt(0));
  } catch {throw new Error('백업 파일이 손상되었어요. 원본 파일을 다시 골라 주세요.');}
}

function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('일기 백업 파일이 아니에요.');
  return value as Record<string, any>;
}

/** Validate content without granting ownership. The server checks actual purchases on every import. */
export function validateDiaryBackup(value: unknown): DiaryBackup {
  const v = object(value);
  if (v.format !== FORMAT || v.version !== 1 || v.stickerAssets !== 'diary/v1' || v.pageSize?.width !== 720 || v.pageSize?.height !== 960)
    throw new Error('지원하지 않는 일기 백업 형식이에요. 앱을 최신 버전으로 확인해 주세요.');
  if (typeof v.createdAt !== 'string' || !Number.isFinite(Date.parse(v.createdAt)))
    throw new Error('백업 날짜를 확인할 수 없어요.');
  if (!Array.isArray(v.pages) || v.pages.length > MAX_DIARY_BACKUP_PAGES)
    throw new Error(`백업은 한 번에 ${MAX_DIARY_BACKUP_PAGES}장까지 가져올 수 있어요.`);
  const ids = new Set<string>(), knownItems = spaceCatalog.map(item => item.id);
  const pages = v.pages.map((raw: unknown): DiaryPage => {
    const page = object(raw);
    if (typeof page.id !== 'string' || !/^[\w-]{1,100}$/.test(page.id) || ids.has(page.id))
      throw new Error('백업 속 일기 번호가 올바르지 않아요.');
    ids.add(page.id);
    if (typeof page.updatedAt !== 'string' || page.updatedAt.length > 60)
      throw new Error('일기의 저장 날짜를 확인해 주세요.');
    const clean = validateDiary(page, knownItems);
    if (clean.layers.some(layer => layer.kind === 'photo' || layer.kind === 'art'))
      throw new Error('사진·전시작품이 담긴 일기는 아직 편집용 백업으로 옮길 수 없어요. 디자인을 보관하려면 PDF로 내려받아 주세요.');
    return {...clean, id: page.id, updatedAt: page.updatedAt};
  });
  return {format: FORMAT, version: 1, createdAt: v.createdAt, pageSize: {width: 720, height: 960}, stickerAssets: 'diary/v1', pages};
}

async function backupKey(password: string, salt: Uint8Array<ArrayBuffer>) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 200)
    throw new Error('백업 암호는 8~200자로 정해 주세요. 일기장 잠금번호와 별도로 보관해야 해요.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256'}, material, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
}

/** The file password is deliberately independent of the recoverable in-app PIN. */
export async function createDiaryBackup(pages: DiaryPage[], password: string, signal?: AbortSignal): Promise<string> {
  checkBackup(signal);
  const snapshot = validateDiaryBackup({format: FORMAT, version: 1, createdAt: new Date().toISOString(), pageSize: {width: 720, height: 960}, stickerAssets: 'diary/v1', pages});
  const bytes = encoder.encode(JSON.stringify(snapshot));
  if (bytes.length > MAX_CLEAR_BYTES) throw new Error('백업이 32MB를 넘었어요. 날짜를 나누어 내려받아 주세요.');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const key = await backupKey(password, salt);
    checkBackup(signal);
    const encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad, tagLength: 128}, key, bytes);
    checkBackup(signal);
    const envelope: EncryptedDiaryBackup = {format: FORMAT, version: 1, kdf: {name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: bytesToBase64(salt)}, cipher: {name: 'AES-GCM', iv: bytesToBase64(iv)}, ciphertext: bytesToBase64(new Uint8Array(encrypted))};
    return JSON.stringify(envelope);
  } finally {bytes.fill(0);}
}

export async function readDiaryBackup(text: string, password: string, signal?: AbortSignal): Promise<DiaryBackup> {
  checkBackup(signal);
  if (typeof text !== 'string' || text.length > MAX_DIARY_BACKUP_BYTES || encoder.encode(text).length > MAX_DIARY_BACKUP_BYTES)
    throw new Error('백업 파일은 45MB 이하여야 해요.');
  let envelope: Record<string, any>;
  try {envelope = object(JSON.parse(text));} catch {throw new Error('읽을 수 없는 백업 파일이에요.');}
  if (envelope.format !== FORMAT || envelope.version !== 1 || envelope.kdf?.name !== 'PBKDF2' || envelope.kdf?.hash !== 'SHA-256' || envelope.kdf?.iterations !== ITERATIONS || envelope.cipher?.name !== 'AES-GCM')
    throw new Error('지원하지 않는 일기 백업 형식이에요.');
  const salt = base64ToBytes(envelope.kdf.salt, 16), iv = base64ToBytes(envelope.cipher.iv, 12), ciphertext = base64ToBytes(envelope.ciphertext, MAX_CLEAR_BYTES + 16);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) throw new Error('백업 파일이 손상되었어요.');
  const key = await backupKey(password, salt);
  checkBackup(signal);
  let bytes: Uint8Array<ArrayBuffer>;
  try {bytes = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv, additionalData: aad, tagLength: 128}, key, ciphertext));}
  catch {throw new Error('백업 암호가 다르거나 파일이 손상되었어요. 앱 잠금번호 재설정으로 이 파일의 암호를 바꿀 수는 없어요.');}
  try {
    checkBackup(signal);
    let value: unknown;
    try {value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));}
    catch {throw new Error('백업 내용을 읽을 수 없어요.');}
    return validateDiaryBackup(value);
  } finally {bytes.fill(0);}
}

/** Always insert new documents. Import must never overwrite a diary with a matching old ID. */
export function freshImportedPages(backup: DiaryBackup): DiaryPage[] {
  return validateDiaryBackup(backup).pages.map(page => ({...page, id: crypto.randomUUID(), version: 0, updatedAt: '', layers: page.layers.map(layer => ({...layer, ...(layer.points ? {points: layer.points.map(point => [...point] as [number, number, number])} : {})}))}));
}
