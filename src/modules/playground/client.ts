'use client';

export class PlayRequestError extends Error {
  constructor(message: string, public code: string, public status: number) {super(message);}
}

export async function playRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/playground/${path}`, {cache: 'no-store', credentials: 'same-origin', ...options});
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new PlayRequestError(value?.error || '불러오지 못했어요. 잠시 후 다시 시도해 주세요.', value?.code || 'REQUEST_FAILED', response.status);
  return value as T;
}

export function playMutation<T>(path: string, body: object, method: 'POST' | 'PUT' | 'PATCH' = 'POST', signal?: AbortSignal) {
  return playRequest<T>(path, {method, signal, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
}
