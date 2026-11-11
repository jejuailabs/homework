'use client';
import {sendUpload, type UploadTransfer} from '@/lib/upload-transfer';
import {LESSON_IMAGE_BYTES_MAX, LESSON_PDF_BYTES_MAX} from './upload-policy';

export class LessonReviewRequestError extends Error {
  constructor(message: string, public code: string, public status: number) {super(message);}
}
export async function lessonRequest<T>(path: string, data?: object): Promise<T> {
  const response = await fetch(`/api/lesson-review/${path}`, {cache: 'no-store', credentials: 'same-origin', method: data ? 'POST' : 'GET', ...(data ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)} : {})});
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new LessonReviewRequestError(value?.error || '불러오지 못했어요. 잠시 후 다시 시도해 주세요.', value?.code || 'REQUEST_FAILED', response.status);
  return value as T;
}

/** Shrinks a photo in the browser so the AI request stays small: longest side 1600px, JPEG. */
export async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file), scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  for (const quality of [.82, .7, .55]) {const url = canvas.toDataURL('image/jpeg', quality); if (url.length * .75 < LESSON_IMAGE_BYTES_MAX - 20_000) return url;}
  throw new Error('사진이 너무 커요. 더 작은 사진을 골라 주세요.');
}
export function checkPdf(file: File) {
  if (file.size > LESSON_PDF_BYTES_MAX) throw new Error('PDF는 2.5MB 이하만 넣을 수 있어요.');
  return {name: file.name, file};
}
/**
 * Sends lesson photos and the PDF straight to Firebase Storage, one signed upload each.
 * The generate request then carries only the upload ids, so file size never touches the API.
 */
function dataUrlBytes(dataUrl: string) {const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), bytes = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index); return bytes;}
export async function uploadLessonFiles(classId: string, images: string[], pdf: File | null, onProgress: (done: number, total: number) => void) {
  const files: {kind: 'image' | 'pdf'; file: File}[] = images.map((image, index) => ({kind: 'image' as const, file: new File([dataUrlBytes(image)], `photo-${index + 1}.jpg`, {type: 'image/jpeg'})}));
  if (pdf) files.push({kind: 'pdf', file: pdf});
  const ids: string[] = [];
  for (const [index, {kind, file}] of files.entries()) {
    const transfer = await lessonRequest<UploadTransfer>('teacher/uploads', {classId, kind, contentType: file.type, size: file.size, requestId: crypto.randomUUID()});
    if (!transfer.alreadyUploaded) await sendUpload(transfer, file, fraction => onProgress(index + fraction, files.length));
    ids.push(transfer.uploadId); onProgress(index + 1, files.length);
  }
  return {imageUploadIds: ids.slice(0, images.length), pdfUploadId: pdf ? ids[images.length] : null};
}
