import { ARTBOOK_LIMIT, type BookOptions } from './types';
export class BookInputError extends Error {}
export function bookDate(value: unknown, optional = true): string {
  if ((value === '' || value === undefined) && optional) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
    throw new BookInputError('기간을 올바른 날짜로 입력해 주세요.');
  return value;
}
function field(value: unknown, limit: number, fallback = '') {
  const text = value === undefined ? fallback : value;
  if (typeof text !== 'string' || text.length > limit) throw new BookInputError(`내용은 ${limit}자 이내로 입력해 주세요.`);
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').trim();
}
export function bookOptions(v: Record<string, unknown>): BookOptions {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new BookInputError('화집 설정을 확인해 주세요.');
  const title = field(v.title, 80, '나의 작은 미술관'), displayName = field(v.displayName, 50);
  if (!title || !displayName) throw new BookInputError('표지 제목과 표시 이름을 입력해 주세요.');
  if (v.format !== 'a4' && v.format !== 'mobile') throw new BookInputError('PDF 크기를 선택해 주세요.');
  if (!['sage', 'peach', 'sky'].includes(String(v.cover))) throw new BookInputError('표지를 선택해 주세요.');
  return { title, displayName, dedication: field(v.dedication, 500), format: v.format, cover: v.cover as BookOptions['cover'], voiceQr: v.voiceQr === true };
}
export function bookKeys(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > ARTBOOK_LIMIT || value.some(k => typeof k !== 'string' || !/^[\w-]+:[\w-]+$/.test(k)) || new Set(value).size !== value.length)
    throw new BookInputError(`중복 없이 작품 1~${ARTBOOK_LIMIT}점을 선택해 주세요.`);
  return value;
}
export function workInPeriod(date: string, from: string, to: string) { return (!from || date >= from) && (!to || date <= to); }
export function containImage(width: number, height: number, boxWidth: number, boxHeight: number) {
  if (![width, height, boxWidth, boxHeight].every(n => Number.isFinite(n) && n > 0)) throw new Error('이미지 크기를 확인해 주세요.');
  const scale = Math.min(boxWidth / width, boxHeight / height);
  return { width: width * scale, height: height * scale };
}
