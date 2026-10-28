export type DiaryStatus = {available: boolean; configured: boolean; unlocked: boolean; recoveryPending?: boolean; recoveredAt?: string; owned?: string[]};
export class DiaryRequestError extends Error {
  constructor(message: string, public status: number, public code: string) {super(message);}
}
export async function diaryRequest<T>(path: string, method = 'GET', value?: unknown): Promise<T> {
  const response = await fetch('/api/secret-diary' + path, {method, cache: 'no-store', credentials: 'same-origin', ...(value === undefined ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value)})});
  const result = await response.json();
  if (!response.ok) throw new DiaryRequestError(result.error || '잠시 후 다시 시도해 주세요.', response.status, result.code || 'DIARY_ERROR');
  return result;
}
