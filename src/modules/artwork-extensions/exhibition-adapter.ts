import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { db } from '@/lib/server/admin';
import { getContext } from '@/lib/server/auth';
import { ApiError, id } from '@/lib/server/policy';
import { canViewArtwork, canViewExhibition, ownsExhibition } from '@/lib/server/exhibition-policy';
import { moduleOptions } from './types';
import type { ModuleTarget, ModuleCapability } from './server-contract';
import { digest } from './server-utils';
let visitorSecret: Promise<string> | undefined;
function secret() { return visitorSecret ??= (async () => { if (process.env.CREATIVE_VISITOR_SECRET)
    return process.env.CREATIVE_VISITOR_SECRET; const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (process.env.GOOGLE_APPLICATION_CREDENTIALS ? await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8') : ''); if (!raw)
    throw new ApiError(503, '방문자 참여 설정을 확인해 주세요.'); return digest('creative-visitors-v1:' + JSON.parse(raw).private_key); })(); }
export function moduleInstalled(name: string) { return ['voice', 'guestbook'].includes(name) && !new Set((process.env.ARTWORK_MODULES_DISABLED || '').split(',').map(s => s.trim())).has(name); }
export function effectiveOptions(value: unknown) { const options = moduleOptions(value); if (!moduleInstalled('voice'))
    options.voice.enabled = false; if (!moduleInstalled('guestbook'))
    options.guestbook.enabled = false; return options; }
async function visitor(request: Request) { const key = await secret(), sign = (v: string) => createHmac('sha256', key).update(v).digest('base64url'); const raw = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('creative_visitor='))?.slice(17) || '', parts = raw.split('.'); if (parts.length === 2 && /^[\w-]{43}$/.test(parts[0]) && /^[\w-]{43}$/.test(parts[1])) {
    const expected = sign(parts[0]);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(parts[1])))
        return { key: digest(raw), cookie: '' };
} const value = randomBytes(32).toString('base64url'), token = value + '.' + sign(value); return { key: digest(token), cookie: `creative_visitor=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}` }; }
/** The only exhibition-specific adapter. New hosts implement this contract independently. */
export async function exhibitionModuleTarget(request: Request, container: string, targetId: string): Promise<{
    target: ModuleTarget;
    cookie: string;
}> {
    const roomRef = db().doc('exhibitions/' + id(container)), artRef = roomRef.collection('artworks').doc(id(targetId)), share = new URL(request.url).searchParams.get('share');
    if (share && !/^[\w-]{43}$/.test(share))
        throw new ApiError(404, '전시를 찾을 수 없어요.');
    const ctx = share ? null : await getContext(request), linkRef = share ? db().doc('exhibitionShareLinks/' + digest(share)) : null;
    const [room, art, link] = await Promise.all([roomRef.get(), artRef.get(), linkRef?.get()]);
    if (!room.exists || !art.exists)
        throw new ApiError(404, '작품을 찾을 수 없어요.');
    const r = room.data()!, a = art.data()!, ownerRef = db().doc('users/' + id(r.ownerUid)), studentRef = ctx?.role === 'student' ? db().doc(`classes/${id(ctx.classId)}/students/${id(ctx.studentId)}`) : null;
    const access = (freshRoom: Record<string, any>, freshArt: Record<string, any>, freshLink?: Record<string, any>) => {
        const owner = !!ctx && ownsExhibition(ctx, freshRoom as any), options = effectiveOptions(freshRoom.artworkModules);
        if (share) {
            if (freshLink?.exhibitionId !== container || !freshRoom.publicSharingEnabled || !['open', 'closed'].includes(freshRoom.status) || freshArt.status !== 'approved')
                throw new ApiError(404, '공유가 종료됐거나 공개되지 않은 작품이에요.');
        }
        else if (!ctx || !canViewExhibition(ctx, freshRoom as any) || !canViewArtwork(ctx, freshRoom as any, freshArt as any))
            throw new ApiError(404, '작품을 찾을 수 없어요.');
        return { owner, options, contribute: owner || freshRoom.status === 'open' && freshArt.status === 'approved', record: owner || !!ctx && ctx.role === 'student' && ctx.studentId === freshArt.studentId && freshRoom.status === 'open' };
    };
    const grant = access(r, a, link?.data()), ownerDoc = await ownerRef.get();
    if (ownerDoc.data()?.disabled)
        throw new ApiError(404, '전시가 잠시 중지됐어요.');
    const v = share ? await visitor(request) : null;
    return { cookie: v?.cookie || '', target: { key: digest(`exhibition:${container}:${targetId}`), ownerUid: r.ownerUid, classId: r.classId, containerKey: 'exhibition:' + container, targetId, title: a.title, options: grant.options, manage: grant.owner, contribute: grant.contribute, record: grant.record, publicView: !!share,
            actor: ctx ? { key: digest(ctx.uid), uid: ctx.uid, name: ctx.role === 'student' ? (await studentRef!.get()).data()?.name || '우리 반 친구' : ctx.displayName || '선생님', role: ctx.role === 'student' ? 'student' : 'teacher' } : { key: v!.key, name: '전시를 찾아온 손님', role: 'visitor' },
            assertFresh: async (tx, cap: ModuleCapability) => { const [room, art, owner, student, link] = await Promise.all([tx.get(roomRef), tx.get(artRef), tx.get(ownerRef), studentRef ? tx.get(studentRef) : null, linkRef ? tx.get(linkRef) : null]); if (!room.exists || !art.exists || room.data()?.ownerUid !== r.ownerUid || owner.data()?.disabled || studentRef && (!student?.exists || student.data()?.disabled || student.data()?.authUid !== ctx?.uid))
                throw new ApiError(403, '작품의 접근 상태가 바뀌었어요.'); const g = access(room.data()!, art.data()!, link?.data()), guest = cap.startsWith('guestbook-'); if (cap === 'manage' && !g.owner || cap === 'record' && (!g.options.voice.enabled || !g.record) || guest && (!g.options.guestbook.enabled || !g.contribute || share && !(cap === 'guestbook-comment' ? g.options.guestbook.visitorComments : g.options.guestbook.visitorStickers) || ctx?.role === 'student' && !g.options.guestbook.students))
                throw new ApiError(403, '이 기능의 참여가 꺼져 있어요.', 'MODULE_DISABLED'); }
        } };
}
