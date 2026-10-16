export async function moduleRequest<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { cache: 'no-store', ...init }); const body = await response.json(); if (!response.ok)
    throw new Error(body.error || '잠시 후 다시 시도해 주세요.'); return body; }
export const jsonRequest = (method: string, value: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
export const moduleUrl = (endpoint: string, module: string, suffix = '') => { const url = new URL(endpoint, location.origin); url.pathname += '/' + module + suffix; return url.pathname + url.search; };
