import {LessonReviewError} from './engine';

/** Lesson material goes browser → Firebase Storage directly; the API only ever receives upload ids. */
export const LESSON_IMAGE_MAX = 10, LESSON_IMAGE_BYTES_MAX = 900_000, LESSON_PDF_BYTES_MAX = 2_500_000;
export const LESSON_UPLOAD_TTL_MS = 2 * 3_600_000;
export type LessonUploadKind = 'image' | 'pdf';
const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];

export function lessonUploadPolicy(kind: unknown, contentType: unknown, size: unknown): {kind: LessonUploadKind; contentType: string; size: number} {
  if (kind !== 'image' && kind !== 'pdf') throw new LessonReviewError('사진이나 PDF만 넣을 수 있어요.');
  if (typeof contentType !== 'string' || (kind === 'image' ? !imageTypes.includes(contentType) : contentType !== 'application/pdf')) throw new LessonReviewError(kind === 'image' ? '사진은 JPG·PNG·WEBP만 쓸 수 있어요.' : 'PDF 파일만 넣을 수 있어요.');
  const limit = kind === 'image' ? LESSON_IMAGE_BYTES_MAX : LESSON_PDF_BYTES_MAX;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1 || size > limit) throw new LessonReviewError(kind === 'image' ? '사진이 너무 커요. 다시 골라 주세요.' : 'PDF는 2.5MB 이하만 넣을 수 있어요.');
  return {kind, contentType, size};
}
/** The ids a generate request names: at most ten photos and one PDF, no repeats. */
export function lessonUploadIds(images: unknown, pdf: unknown) {
  const list = images === undefined ? [] : images;
  if (!Array.isArray(list) || list.some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) throw new LessonReviewError('사진을 다시 넣어 주세요.');
  if (list.length > LESSON_IMAGE_MAX) throw new LessonReviewError(`사진은 ${LESSON_IMAGE_MAX}장까지 넣을 수 있어요.`);
  if (new Set(list).size !== list.length) throw new LessonReviewError('같은 사진이 두 번 들어갔어요.');
  if (pdf !== undefined && pdf !== null && (typeof pdf !== 'string' || !/^[a-f0-9]{64}$/.test(pdf))) throw new LessonReviewError('PDF를 다시 넣어 주세요.');
  return {images: list as string[], pdf: typeof pdf === 'string' ? pdf : null};
}
/** First bytes must match the declared type, so a renamed file cannot reach the AI as a photo or PDF. */
export function lessonFileMatches(contentType: string, head: Uint8Array) {
  const ascii = String.fromCharCode(...head.subarray(0, 16));
  if (contentType === 'image/jpeg') return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (contentType === 'image/png') return head[0] === 0x89 && ascii.slice(1, 4) === 'PNG';
  if (contentType === 'image/webp') return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP';
  if (contentType === 'application/pdf') return ascii.startsWith('%PDF-');
  return false;
}
