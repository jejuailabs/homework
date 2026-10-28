'use client';

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
  for (const quality of [.82, .7, .55]) {const url = canvas.toDataURL('image/jpeg', quality); if (url.length * .75 < 880_000) return url;}
  throw new Error('사진이 너무 커요. 더 작은 사진을 골라 주세요.');
}
export function readPdf(file: File): Promise<string> {
  if (file.size > 2_500_000) return Promise.reject(new Error('PDF는 2.5MB 이하만 넣을 수 있어요.'));
  return new Promise((resolve, reject) => {const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('PDF를 읽지 못했어요.')); reader.readAsDataURL(file);});
}
