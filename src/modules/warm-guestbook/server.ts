import 'server-only';
import { db } from '@/lib/server/admin';
import { ApiError } from '@/lib/server/policy';
import type { ModuleTarget } from '../artwork-extensions/server-contract';
import { consumeModuleRate, moduleJson } from '../artwork-extensions/server-utils';
import { guestName, guestSticker, guestText } from './policy';
type Data = Record<string, any>;
const view = (id: string, v: Data, t: ModuleTarget) => ({ id, type: v.type, sticker: v.sticker || '', text: v.text || '', authorName: v.authorName, authorRole: v.authorRole, status: v.status, createdAt: v.createdAt, version: v.version, isOwn: v.authorKey === t.actor.key });
export async function guestbook(request: Request, t: ModuleTarget, segments: string[]) {
    if (!t.options.guestbook.enabled)
        throw new ApiError(404, '응원 방명록이 꺼져 있어요.', 'MODULE_DISABLED');
    const root = db().doc('moduleGuestbooks/' + t.key), entries = root.collection('entries'), published = root.collection('published');
    if (request.method === 'GET') {
        const p = new URL(request.url).searchParams, queue = t.manage && p.get('queue') === '1';
        let q = (queue ? entries : published).orderBy('createdAt', 'desc').orderBy('__name__', 'desc');
        const cursor = p.get('cursor');
        if (cursor) {
            try {
                const value = JSON.parse(Buffer.from(cursor, 'base64url').toString());
                if (value.target !== t.key || value.queue !== queue || typeof value.at !== 'string' || !/^[\w-]{1,100}$/.test(value.id))
                    throw Error();
                q = q.startAfter(value.at, value.id);
            }
            catch {
                throw new ApiError(400, '목록을 새로고침해 주세요.');
            }
        }
        const [rows, own] = await Promise.all([q.limit(21).get(), Promise.all(['sticker', 'comment'].map(kind => entries.doc(t.actor.key + '_' + kind).get()))]);
        const docs = rows.docs.slice(0, 20), last = docs.at(-1);
        return { entries: docs.map(d => view(d.id, d.data(), t)), mine: own.filter(d => d.exists).map(d => view(d.id, d.data()!, t)), nextCursor: rows.size > 20 && last ? Buffer.from(JSON.stringify({ target: t.key, queue, at: last.data().createdAt, id: last.id })).toString('base64url') : null, viewer: { manage: t.manage, contribute: t.contribute, visitor: t.publicView }, options: t.options.guestbook };
    }
    const input = await moduleJson(request);
    if (request.method === 'POST') {
        const type = input.type;
        if (!['sticker', 'comment'].includes(type))
            throw new ApiError(400, '참여 종류를 확인해 주세요.');
        if (!t.contribute || t.publicView && !(type === 'sticker' ? t.options.guestbook.visitorStickers : t.options.guestbook.visitorComments) || t.actor.role === 'student' && !t.options.guestbook.students)
            throw new ApiError(403, '지금은 이 응원을 남길 수 없어요.');
        let text = '', sticker = '', name = t.actor.name;
        try {
            if (type === 'comment')
                text = guestText(input.text);
            else
                sticker = guestSticker(input.sticker);
            if (t.publicView)
                name = guestName(input.authorName);
        }
        catch {
            throw new ApiError(400, '감상은 연락처·링크 없이 한 줄 120자 이내로 적어 주세요. 별명은 20자까지예요.', 'COMMENT_INVALID');
        }
        const entry = entries.doc(t.actor.key + '_' + type), copy = published.doc(entry.id), now = new Date().toISOString();
        await consumeModuleRate([{ key: 'guest-actor:' + t.actor.key, limit: 12, windowMs: 3600000 }, { key: 'guest-owner:' + t.ownerUid, limit: 2000, windowMs: 86400000 }]);
        await db().runTransaction(async (tx) => {
            await t.assertFresh(tx, type === 'comment' ? 'guestbook-comment' : 'guestbook-sticker');
            const [old, stats] = await Promise.all([tx.get(entry), tx.get(root)]);
            const previous = old.data();
            if (previous) {
                if (previous.status === 'hidden' && !t.manage)
                    throw new ApiError(403, '공개가 중지된 응원은 다시 올릴 수 없어요.');
                if (previous.text === text && previous.sticker === sticker)
                    return;
                if (type === 'comment')
                    throw new ApiError(409, '한 작품에는 감상 한 줄을 남길 수 있어요. 새로고침해 기존 감상을 확인해 주세요.', 'COMMENT_EXISTS');
            }
            if (!previous && (stats.data()?.count || 0) >= 500)
                throw new ApiError(409, '이 작품의 응원 공간이 가득 찼어요.');
            const value = { type, text, sticker, authorName: name, authorRole: t.actor.role, authorKey: t.actor.key, status: type === 'sticker' || t.manage ? 'approved' : 'pending', createdAt: previous?.createdAt || now, version: crypto.randomUUID() };
            tx.set(entry, value);
            if (value.status === 'approved')
                tx.set(copy, value);
            else
                tx.delete(copy);
            if (!previous)
                tx.set(root, { ownerUid: t.ownerUid, classId: t.classId, containerKey: t.containerKey, targetId: t.targetId, title: t.title, pendingCount: (stats.data()?.pendingCount || 0) + (value.status === 'pending' ? 1 : 0), count: (stats.data()?.count || 0) + 1, updatedAt: now }, { merge: true });
        });
        return { saved: true, status: type === 'sticker' || t.manage ? 'approved' : 'pending' };
    }
    if (request.method === 'PATCH' && segments[0] && t.manage) {
        if (!['approved', 'hidden'].includes(input.status))
            throw new ApiError(400, '승인 상태를 확인해 주세요.');
        const entry = entries.doc(segments[0]);
        await db().runTransaction(async (tx) => { await t.assertFresh(tx, 'manage'); const [old, stats] = await Promise.all([tx.get(entry), tx.get(root)]); if (!old.exists)
            throw new ApiError(404, '감상을 찾을 수 없어요.'); if (old.data()!.version !== input.version)
            throw new ApiError(409, '다른 곳에서 수정됐어요. 새로고침해 주세요.'); const next = { ...old.data(), status: input.status, version: crypto.randomUUID() }; tx.set(entry, next); tx.set(root, { pendingCount: Math.max(0, (stats.data()?.pendingCount || 0) - (old.data()!.status === 'pending' ? 1 : 0)) }, { merge: true }); if (input.status === 'approved')
            tx.set(published.doc(entry.id), next);
        else
            tx.delete(published.doc(entry.id)); });
        return { saved: true };
    }
    throw new ApiError(405, '요청 방법을 확인해 주세요.');
}
