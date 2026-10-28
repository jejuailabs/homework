import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import sharp from 'sharp';
import { db, bucket } from '@/lib/server/admin';
import { requireStudent, type Context } from '@/lib/server/auth';
import { ApiError, id } from '@/lib/server/policy';
import { pointBalance, pointSettings, wardrobeOutfit, wardrobeOwnership } from '@/lib/server/points-policy';
import { defaultRoom, spaceCatalog, spaceItem, type DiaryPage } from './catalog';
import { ownedItems, revision, SpaceError, validateRoom, validateDiary } from './policy';
type Data = Record<string, any>;
type StudentContext = Context & {
    classId: string;
    studentId: string;
};
const hash = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');
const pupil = (ctx: StudentContext) => db().doc(`classes/${ctx.classId}/students/${ctx.studentId}`);
const room = (ctx: StudentContext) => pupil(ctx).collection('mySpace').doc('room');
const diaries = (ctx: StudentContext) => pupil(ctx).collection('diaryPages');
const photos = (ctx: StudentContext) => pupil(ctx).collection('spacePhotos');
const photoUsage = (ctx: StudentContext) => pupil(ctx).collection('mySpace').doc('photos');
const photoPath = (ctx: StudentContext, key: string) => `student-spaces/${ctx.classId}/${ctx.studentId}/${key}.webp`;
export async function spaceContext(request: Request) { if (process.env.MY_SPACE_DISABLED === 'true')
    throw new ApiError(503, '나의 작은 방이 잠깐 쉬고 있어요.'); return requireStudent(request); }
async function active(ctx: StudentContext, tx?: FirebaseFirestore.Transaction, write = false) {
    const refs = [pupil(ctx), db().doc('classes/' + ctx.classId), db().doc('users/' + ctx.uid)], docs = await Promise.all(refs.map(r => tx ? tx.get(r) : r.get()));
    const [s, c, u] = docs;
    if (!s.exists || s.data()?.disabled || s.data()?.authUid !== ctx.uid || !u.exists || u.data()?.disabled || u.data()?.role !== 'student' || u.data()?.classId !== ctx.classId || u.data()?.studentId !== ctx.studentId || (u.data()?.authVersion ?? 0) !== ctx.authVersion || !c.exists)
        throw new ApiError(403, '학생 계정을 다시 확인해 주세요.');
    if (write && !pointSettings(c.data()?.pointSettings).enabled)
        throw new ApiError(403, '선생님이 보말 꾸미기를 켜면 사용할 수 있어요.');
    return { s: s.data()!, settings: pointSettings(c.data()?.pointSettings) };
}
export async function bootstrap(ctx: StudentContext) { const [{ s, settings }, r] = await Promise.all([active(ctx), room(ctx).get()]); return { settings, profile: { name: s.name, character: s.character || 'cat', points: pointBalance(s.points), earned: pointBalance(s.pointsEarnedTotal), xp: pointBalance(s.xp), wardrobe: wardrobeOutfit(s.wardrobeOutfit, s.wardrobeOwned), wardrobeOwned: wardrobeOwnership(s.wardrobeOwned), adopted: s.spaceAdopted || {} }, owned: ownedItems(s.spaceOwned), room: r.exists ? r.data() : defaultRoom(s.character || 'cat'), catalogVersion: 1 }; }
export async function buy(ctx: StudentContext, input: Data) {
    const key = id(input.itemId), requestId = id(input.requestId), item = spaceItem(key);
    if (!item)
        throw new ApiError(404, '상점에서 물건을 다시 선택해 주세요.');
    const receipt = pupil(ctx).collection('spaceReceipts').doc(requestId);
    return db().runTransaction(async (tx) => {
        const { s } = await active(ctx, tx, true), old = await tx.get(receipt);
        if (old.exists) {
            if (old.data()?.itemId !== key)
                throw new ApiError(409, '같은 구매 요청의 물건이 바뀌었어요.');
            return { purchased: false, repeated: true };
        }
        const items = ownedItems(s.spaceOwned);
        if (items.includes(key)) {
            tx.create(receipt, { itemId: key, at: new Date().toISOString() });
            return { purchased: false, repeated: false };
        }
        const points = pointBalance(s.points);
        if (points < item.price)
            throw new ApiError(409, '보말을 조금 더 모아 주세요.');
        const ledger = pupil(ctx).collection('pointLedger').doc(hash('my-space:' + key));
        const previous = await tx.get(ledger);
        if (previous.exists)
            throw new ApiError(409, '구매 내역을 다시 확인해 주세요.');
        const adopted = { ...(s.spaceAdopted || {}), ...(item.kind === 'pet' ? { [key]: pointBalance(s.pointsEarnedTotal) } : {}) };
        tx.update(pupil(ctx), { points: points - item.price, spaceOwned: [...items, key], spaceAdopted: adopted });
        tx.create(ledger, { classId: ctx.classId, studentId: ctx.studentId, amount: -item.price, kind: 'spend', source: 'myspace', sourceId: key, reason: item.name, actorUid: ctx.uid, balanceAfter: points - item.price, createdAt: new Date().toISOString() });
        tx.create(receipt, { itemId: key, at: new Date().toISOString() });
        return { purchased: true, repeated: false };
    });
}
export async function saveRoom(ctx: StudentContext, input: Data) {
    return db().runTransaction(async tx => {
        const {s} = await active(ctx, tx, true), old = await tx.get(room(ctx));
        const previousPet = old.data()?.pet || defaultRoom(s.character || 'cat').pet;
        const value = validateRoom(input, ownedItems(s.spaceOwned), previousPet);
        if ((old.data()?.version || 0) !== value.version) throw new ApiError(409, '다른 화면에서 방이 바뀌었어요. 새로 불러온 뒤 꾸며 주세요.', 'VERSION_CONFLICT');
        const next = {...value, version: value.version + 1, updatedAt: new Date().toISOString()};
        tx.set(room(ctx), next);
        tx.update(pupil(ctx), {
            character: spaceItem(value.pet)?.base || s.character || 'cat',
            wardrobeOutfit: wardrobeOutfit(s.wardrobeOutfit, s.wardrobeOwned, value.pet),
        });
        return {room: next};
    });
}
const diaryDto = (doc: FirebaseFirestore.DocumentSnapshot) => ({ ...doc.data(), id: doc.id });
export async function listDiaries(ctx: StudentContext, cursor: string) { await active(ctx); let query = diaries(ctx).orderBy('updatedAt', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(21); if (cursor) {
    const previous = await diaries(ctx).doc(id(cursor)).get();
    if (!previous.exists)
        throw new ApiError(400, '노트 위치를 확인해 주세요.');
    query = query.startAfter(previous);
} const docs = (await query.get()).docs; return { pages: docs.slice(0, 20).map(diaryDto), cursor: docs.length > 20 ? docs[19].id : '' }; }
async function art(ctx: StudentContext, key: string, tx?: FirebaseFirestore.Transaction) { if (!/^[\w-]+:[\w-]+$/.test(key))
    throw new ApiError(400, '작품을 다시 골라 주세요.'); const [r, a] = key.split(':'), refs = [db().doc('exhibitions/' + r), db().doc(`exhibitions/${r}/artworks/${a}`)], docs = await Promise.all(refs.map(ref => tx ? tx.get(ref) : ref.get())); if (docs[0].data()?.classId !== ctx.classId || docs[1].data()?.studentId !== ctx.studentId || docs[1].data()?.status !== 'approved')
    throw new ApiError(403, '승인된 내 작품만 사용할 수 있어요.'); return docs[1].data()!; }
export async function saveDiary(ctx: StudentContext, key: string, input: Data) {
    id(key);
    return db().runTransaction(async (tx) => {
        const { s } = await active(ctx, tx, true), ref = diaries(ctx).doc(key), old = await tx.get(ref), value = validateDiary(input, ownedItems(s.spaceOwned)), countRef = pupil(ctx).collection('mySpace').doc('diaries'), count = await tx.get(countRef);
        if ((old.data()?.version || 0) !== value.version)
            throw new ApiError(409, '다른 화면에서 노트가 바뀌었어요. 새로 불러와 주세요.', 'VERSION_CONFLICT');
        if (!old.exists && (count.data()?.count || 0) >= 60)
            throw new ApiError(409, '노트는 60장까지 보관할 수 있어요.');
        const imageIds = [...new Set(value.layers.filter(l => l.kind === 'photo').map(l => l.assetId!))];
        if (imageIds.length) {
            const images = await Promise.all(imageIds.map(k => tx.get(photos(ctx).doc(k))));
            if (images.some(d => d.data()?.status !== 'ready'))
                throw new ApiError(409, '사진이 삭제됐어요. 다시 골라 주세요.');
        }
        for (const work of [...new Set(value.layers.filter(l => l.kind === 'art').map(l => l.assetId!))])
            await art(ctx, work, tx);
        const next = { ...value, version: value.version + 1, updatedAt: new Date().toISOString(), imageIds };
        tx.set(ref, next);
        if (!old.exists)
            tx.set(countRef, { count: (count.data()?.count || 0) + 1 });
        return { page: { ...next, id: key } };
    });
}
export async function removeDiary(ctx: StudentContext, key: string, expected: number) { return db().runTransaction(async (tx) => { await active(ctx, tx, true); const ref = diaries(ctx).doc(id(key)), old = await tx.get(ref), counter = pupil(ctx).collection('mySpace').doc('diaries'), count = await tx.get(counter); if (!old.exists)
    return { deleted: true }; if (old.data()?.version !== revision(expected))
    throw new ApiError(409, '노트가 바뀌었어요. 새로 불러와 주세요.'); tx.delete(ref); tx.set(counter, { count: Math.max(0, (count.data()?.count || 0) - 1) }); return { deleted: true }; }); }
export async function listPhotos(ctx: StudentContext) { await active(ctx); const docs = await photos(ctx).limit(41).get(); return { photos: docs.docs.map(d => ({ id: d.id, url: d.data().status === 'ready' ? '/api/my-space/images/' + d.id : '', status: d.data().status, size: d.data().size })) }; }
export async function uploadPhoto(ctx: StudentContext, key: string, bytes: Uint8Array) {
    id(key);
    if (bytes.length > 4 * 1024 * 1024)
        throw new ApiError(413, '사진 크기를 줄여 다시 올려 주세요.');
    const processor = sharp(bytes, { limitInputPixels: 40000000 });
    let meta;
    try {
        meta = await processor.metadata();
    }
    catch {
        throw new ApiError(415, '사진 형식을 다시 확인해 주세요.');
    }
    if (!['jpeg', 'png', 'webp'].includes(meta.format || ''))
        throw new ApiError(415, 'JPG·PNG·WebP 사진을 골라 주세요.');
    let output = await processor.rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    if (output.length > 512000)
        output = await sharp(output).resize({ width: 1100, height: 1100, fit: 'inside', withoutEnlargement: true }).webp({ quality: 65 }).toBuffer();
    if (output.length > 512000)
        throw new ApiError(413, '사진 크기를 줄여 다시 올려 주세요.');
    const fingerprint = hash(bytes), token = randomUUID(), ref = photos(ctx).doc(key), quota = photoUsage(ctx);
    const repeated = await db().runTransaction(async (tx) => { await active(ctx, tx, true); const [old, q] = await Promise.all([tx.get(ref), tx.get(quota)]); if (old.exists) {
        if (old.data()?.fingerprint !== fingerprint)
            throw new ApiError(409, '사진 요청이 바뀌었어요.');
        if (old.data()?.status === 'ready')
            return true;
        if (old.data()?.status === 'deleting' || old.data()?.leaseUntil > Date.now())
            throw new ApiError(409, '사진을 처리 중이에요. 잠시 후 다시 시도해 주세요.');
    } const used = q.data()?.bytes || 0, count = q.data()?.count || 0; if (!old.exists && (count >= 40 || used + 512000 > 20 * 1024 * 1024))
        throw new ApiError(409, '사진은 40장·20MB까지 보관할 수 있어요.'); if (!old.exists)
        tx.set(quota, { count: count + 1, bytes: used + 512000 }); tx.set(ref, { status: 'uploading', lease: token, leaseUntil: Date.now() + 150000, size: 512000, fingerprint, createdAt: new Date().toISOString() }); return false; });
    if (repeated)
        return { id: key };
    try {
        await bucket().file(photoPath(ctx, key)).save(output, { resumable: false, metadata: { contentType: 'image/webp', cacheControl: 'private,no-store' } });
        await db().runTransaction(async (tx) => { const [old, q] = await Promise.all([tx.get(ref), tx.get(quota)]); if (old.data()?.lease !== token)
            throw new ApiError(409, '사진 작업 시간이 지났어요.'); tx.update(ref, { status: 'ready', lease: '', leaseUntil: 0, size: output.length }); tx.update(quota, { bytes: Math.max(0, (q.data()?.bytes || 0) - 512000 + output.length) }); });
        return { id: key };
    }
    catch (e) {
        await db().runTransaction(async (tx) => { const old = await tx.get(ref); if (old.data()?.lease === token)
            tx.update(ref, { leaseUntil: 0 }); });
        throw e;
    }
}
export async function readPhoto(ctx: StudentContext, key: string) { await active(ctx); const image = await photos(ctx).doc(id(key)).get(); if (image.data()?.status !== 'ready')
    throw new ApiError(404, '사진을 찾을 수 없어요.'); return (await bucket().file(photoPath(ctx, key)).download())[0]; }
export async function deletePhoto(ctx: StudentContext, key: string) { const ref = photos(ctx).doc(id(key)), quota = photoUsage(ctx), token = randomUUID(); const old = await db().runTransaction(async (tx) => { await active(ctx, tx, true); const [doc, used] = await Promise.all([tx.get(ref), tx.get(diaries(ctx).where('imageIds', 'array-contains', key).limit(1))]); if (!used.empty)
    throw new ApiError(409, '노트에서 이 사진을 먼저 빼 주세요.'); if (!doc.exists)
    return null; if (doc.data()?.leaseUntil > Date.now())
    throw new ApiError(409, '사진을 처리 중이에요. 잠시 후 다시 시도해 주세요.'); tx.update(ref, { status: 'deleting', lease: token, leaseUntil: Date.now() + 150000 }); return doc.data()!; }); if (!old)
    return { deleted: true }; try {
    await bucket().file(photoPath(ctx, key)).delete({ ignoreNotFound: true });
    await db().runTransaction(async (tx) => { const [doc, q] = await Promise.all([tx.get(ref), tx.get(quota)]); if (doc.data()?.lease !== token)
        throw new ApiError(409, '삭제를 다시 시도해 주세요.'); tx.delete(ref); tx.set(quota, { count: Math.max(0, (q.data()?.count || 0) - 1), bytes: Math.max(0, (q.data()?.bytes || 0) - old.size) }); });
}
catch (e) {
    await db().runTransaction(async (tx) => { const d = await tx.get(ref); if (d.data()?.lease === token)
        tx.update(ref, { leaseUntil: 0 }); });
    throw e;
} return { deleted: true }; }
export async function ownArt(ctx: StudentContext, key: string) { await active(ctx); const value = await art(ctx, key); return (await bucket().file(value.displayPath).download())[0]; }
export async function listArt(ctx: StudentContext, cursor: string) { await active(ctx); let query = db().collection('exhibitions').where('classId', '==', ctx.classId).orderBy(FieldPath.documentId()).limit(11); if (cursor)
    query = query.startAfter(id(cursor)); const rooms = (await query.get()).docs, works: Data[] = []; await Promise.all(rooms.slice(0, 10).map(async (r) => { const docs = await r.ref.collection('artworks').where('studentId', '==', ctx.studentId).limit(301).get(); for (const d of docs.docs) {
    const a = d.data();
    if (a.status === 'approved')
        works.push({ id: r.id + ':' + d.id, title: a.title, url: '/api/my-space/art/' + r.id + ':' + d.id });
} })); return { works, cursor: rooms.length > 10 ? rooms[9].id : '' }; }
