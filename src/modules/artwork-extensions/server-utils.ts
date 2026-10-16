import 'server-only';
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '@/lib/server/admin';
import { ApiError } from '@/lib/server/policy';
export const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export function moduleOrigin(request: Request) { const origin = request.headers.get('origin'); if (!origin || origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site')
    throw new ApiError(403, '이 화면에서 다시 시도해 주세요.', 'ORIGIN'); }
export async function boundedBytes(request: Request, max: number) { if (Number(request.headers.get('content-length')) > max)
    throw new ApiError(413, '파일이 너무 커요.', 'BODY_TOO_LARGE'); if (!request.body)
    throw new ApiError(400, '파일을 확인해 주세요.'); const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0; try {
    while (true) {
        const item = await reader.read();
        if (item.done)
            break;
        size += item.value.length;
        if (size > max) {
            await reader.cancel();
            throw new ApiError(413, '파일이 너무 커요.', 'BODY_TOO_LARGE');
        }
        chunks.push(item.value);
    }
}
finally {
    reader.releaseLock();
} return Buffer.concat(chunks); }
export async function moduleJson(request: Request) { try {
    const v = JSON.parse((await boundedBytes(request, 12000)).toString('utf8'));
    if (!v || typeof v !== 'object' || Array.isArray(v))
        throw Error();
    return v as Record<string, any>;
}
catch (e) {
    if (e instanceof ApiError)
        throw e;
    throw new ApiError(400, '입력 내용을 확인해 주세요.');
} }
export async function consumeModuleRate(scopes: {
    key: string;
    limit: number;
    windowMs: number;
}[]) { const now = Date.now(), refs = scopes.map(s => db().doc('rateLimits/module_' + digest(s.key + ':' + Math.floor(now / s.windowMs)))); await db().runTransaction(async (tx) => { const docs = await Promise.all(refs.map(ref => tx.get(ref))); docs.forEach((doc, i) => { if ((doc.data()?.count || 0) >= scopes[i].limit)
    throw new ApiError(429, '잠시 쉬었다가 다시 참여해 주세요.', 'RATE_LIMIT'); }); refs.forEach((ref, i) => tx.set(ref, { count: (docs[i].data()?.count || 0) + 1, expiresAt: Timestamp.fromMillis(now + scopes[i].windowMs * 2) })); }); }
