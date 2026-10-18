export async function spaceRequest<T>(path = '', method = 'GET', value?: unknown): Promise<T> { const r = await fetch('/api/my-space' + path, { method, cache: 'no-store', ...(value !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) } : {}) }); const b = await r.json(); if (!r.ok)
    throw new Error(b.error || '잠시 후 다시 시도해 주세요.'); return b; }
