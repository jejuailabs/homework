import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from './admin';
import type { Context } from './auth';
import { ApiError, id } from './policy';
import { parseCards } from './cards-policy';
import { CARD_SHARED_FOLDERS, CARD_SHARE_SEARCH_LIMIT, matchesShared, parseShareMembers, readSharing, sharedAccess } from '../cards-sharing';
import type { CardEntry, CardSetSummary } from '../cards-types';

/**
 * 동료 공유. A teacher shares one of their folders with colleagues by Google email (같은 학교 선생님부터: there is no school
 * directory yet, so the owner chooses who). Colleagues see only the sets in it that the owner marked 공유, and copy only those
 * marked 복제 허용, into their own sets. Nothing reaches students; no student data is involved. All reads go through this API.
 */
type Data = Record<string, any>;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const now = () => new Date().toISOString();
const digest = (...parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
function teacher(ctx: Context) { if (ctx.role === 'student') throw new ApiError(403, '선생님만 사용할 수 있어요.', 'FORBIDDEN'); }
function viewerEmail(ctx: Context) {
  teacher(ctx);
  if (!ctx.email) throw new ApiError(403, 'Google 계정 이메일을 확인할 수 없어요.', 'EMAIL_REQUIRED');
  return ctx.email.toLowerCase();
}
type SharedRow = CardSetSummary & { ownerName: string; folderName: string; allowCopy: boolean };
function sharedRow(snap: FirebaseFirestore.DocumentSnapshot, folder: Data): SharedRow {
  const value = snap.data()!;
  return { id: snap.id, title: value.title, description: value.description ?? '', type: value.type, cardCount: value.cardCount, folderId: null, version: value.version, versionId: value.versionId, archived: false, createdAt: value.createdAt, updatedAt: value.updatedAt, ownerName: String(folder.ownerName ?? '동료 선생님'), folderName: String(folder.name ?? ''), allowCopy: readSharing(value.sharing).allowCopy };
}
async function sharedFolders(email: string) {
  const snap = await db().collection('cardFolders').where('shareMembers', 'array-contains', email).limit(CARD_SHARED_FOLDERS).get();
  return snap.docs;
}
async function setsIn(folder: FirebaseFirestore.DocumentSnapshot, ctx: Context) {
  const snap = await db().collection('cardSets').where('folderId', '==', folder.id).limit(200).get();
  return snap.docs.filter(doc => sharedAccess(doc.data() as { ownerUid: string; folderId: string | null }, folder.data() as { ownerUid: string }, ctx).visible).map(doc => sharedRow(doc, folder.data()!));
}

/** GET/PATCH folders/{id}/share: the owner's list of colleague emails for one folder. */
export async function folderShare(ctx: Context, request: Request, folderId: string, input: Data) {
  teacher(ctx);
  const ref = db().doc(`cardFolders/${id(folderId, '폴더')}`), snap = await ref.get();
  if (!snap.exists || snap.data()?.ownerUid !== ctx.uid) throw new ApiError(404, '항목을 찾을 수 없어요.', 'NOT_FOUND');
  const count = async () => (await db().collection('cardSets').where('folderId', '==', snap.id).limit(200).get()).docs.filter(doc => doc.data().ownerUid === ctx.uid && !doc.data().archived && readSharing(doc.data().sharing).visibility === 'shared').length;
  if (request.method === 'GET') return json({ members: snap.data()!.shareMembers ?? [], sharedSets: await count() });
  const parsed = parseShareMembers(input.members, ctx.email);
  if ('error' in parsed) throw new ApiError(400, parsed.error, 'SHARE_MEMBERS');
  await ref.update({ shareMembers: parsed.members, ownerName: String(ctx.displayName ?? '').slice(0, 60) || '동료 선생님', shareUpdatedAt: now() });
  return json({ members: parsed.members, sharedSets: await count() });
}

/** GET shared[?q=]: folders shared with me; with q, the matching shared sets across them. */
async function sharedHome(ctx: Context, request: Request) {
  const email = viewerEmail(ctx), q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 100);
  const folders = (await sharedFolders(email)).filter(folder => folder.data().ownerUid !== ctx.uid);
  const rows = await Promise.all(folders.map(folder => setsIn(folder, ctx)));
  const list = folders.map((folder, index) => ({ id: folder.id, name: String(folder.data().name ?? ''), ownerName: String(folder.data().ownerName ?? '동료 선생님'), sets: rows[index].length }));
  return json({ folders: list, ...(q ? { sets: rows.flat().filter(row => matchesShared(row, q)).slice(0, CARD_SHARE_SEARCH_LIMIT) } : {}) });
}
async function sharedFolder(ctx: Context, folderId: string) {
  const email = viewerEmail(ctx), snap = await db().doc(`cardFolders/${id(folderId, '폴더')}`).get();
  if (!snap.exists || snap.data()?.ownerUid === ctx.uid || !(snap.data()?.shareMembers ?? []).includes(email)) throw new ApiError(404, '공유받은 폴더를 찾을 수 없어요.', 'NOT_FOUND');
  return json({ folder: { id: snap.id, name: snap.data()!.name, ownerName: snap.data()!.ownerName ?? '동료 선생님' }, sets: await setsIn(snap, ctx) });
}
async function readShared(ctx: Context, setId: string) {
  viewerEmail(ctx);
  const set = await db().doc(`cardSets/${id(setId, '세트')}`).get(), value = set.data();
  const folder = value?.folderId ? await db().doc(`cardFolders/${id(value.folderId)}`).get() : null;
  const access = value ? sharedAccess(value as { ownerUid: string; folderId: string | null }, folder?.data() as { ownerUid: string } | undefined, ctx) : { visible: false, copy: false };
  if (!set.exists || !access.visible) throw new ApiError(404, '공유받은 세트를 찾을 수 없어요.', 'NOT_FOUND');
  const version = await db().doc(`cardSetVersions/${id(value!.versionId)}`).get();
  if (!version.exists) throw new ApiError(409, '세트 버전을 확인해 주세요.', 'VERSION_MISSING');
  return { set, value: value!, folder: folder!, cards: version.data()!.cards as CardEntry[], access };
}
async function sharedSet(ctx: Context, setId: string) {
  const { set, folder, cards } = await readShared(ctx, setId);
  return json({ set: { ...sharedRow(set, folder.data()!), cards } });
}
/** POST shared/sets/{id}/copy: a new set of my own (new card IDs), noting where it came from. A retry with the same request ID returns the same copy. */
async function copyShared(ctx: Context, setId: string, input: Data) {
  const requestId = id(input.requestId, '요청 ID'), folderId = input.folderId === undefined || input.folderId === null ? null : id(input.folderId, '폴더');
  const { set, value, folder, cards, access } = await readShared(ctx, setId);
  if (!access.copy) throw new ApiError(403, '만든 선생님이 복사를 허용하지 않은 세트예요.', 'COPY_NOT_ALLOWED');
  const ref = db().doc(`cardSets/${digest(ctx.uid, 'shared-copy', requestId).slice(0, 24)}`);
  const result = await db().runTransaction(async tx => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      if (existing.data()?.ownerUid !== ctx.uid || existing.data()?.copiedFrom?.setId !== set.id) throw new ApiError(409, '같은 요청 ID에 다른 내용을 저장할 수 없어요.', 'REQUEST_CONFLICT');
      return existing.data()!;
    }
    if (folderId) {
      const mine = await tx.get(db().doc(`cardFolders/${folderId}`));
      if (!mine.exists || mine.data()?.ownerUid !== ctx.uid) throw new ApiError(404, '항목을 찾을 수 없어요.', 'NOT_FOUND');
      tx.update(mine.ref, { updatedAt: now() });
    }
    const stamp = now(), copied = parseCards(cards.map(card => ({ ...card, id: randomUUID() }))), versionId = `${ref.id}_v1`;
    const data = { ownerUid: ctx.uid, title: value.title, description: value.description ?? '', type: value.type, cardCount: copied.length, folderId, version: 1, versionId, archived: false, createdAt: stamp, updatedAt: stamp, copiedFrom: { setId: set.id, title: String(value.title).slice(0, 120), ownerName: String(folder.data()?.ownerName ?? '동료 선생님'), version: value.version, copiedAt: stamp } };
    tx.create(db().doc(`cardSetVersions/${versionId}`), { ownerUid: ctx.uid, setId: ref.id, version: 1, title: data.title, description: data.description, type: data.type, cards: copied, createdAt: stamp });
    tx.create(ref, data);
    return data;
  });
  return json({ set: { id: ref.id, title: result.title, description: result.description, type: result.type, cardCount: result.cardCount, folderId: result.folderId, version: result.version, versionId: result.versionId, archived: false, createdAt: result.createdAt, updatedAt: result.updatedAt, copiedFrom: result.copiedFrom } }, 201);
}

export async function handleShared(ctx: Context, request: Request, segments: string[], input: Data) {
  const [, kind, targetId, action] = segments, method = request.method;
  if (segments.length === 1 && method === 'GET') return sharedHome(ctx, request);
  if (kind === 'folders' && targetId && segments.length === 3 && method === 'GET') return sharedFolder(ctx, targetId);
  if (kind === 'sets' && targetId && segments.length === 3 && method === 'GET') return sharedSet(ctx, targetId);
  if (kind === 'sets' && targetId && action === 'copy' && segments.length === 4 && method === 'POST') return copyShared(ctx, targetId, input);
  throw new ApiError(404, '카드놀이 기능을 찾을 수 없어요.', 'NOT_FOUND');
}
/** For Berry: how much this teacher shares, as counts. No emails, names or set titles of colleagues leave here. */
export async function cardSharingCounts(uid: string) {
  const [folders, sets] = await Promise.all([
    db().collection('cardFolders').where('ownerUid', '==', uid).select('shareMembers').limit(200).get(),
    db().collection('cardSets').where('ownerUid', '==', uid).select('sharing', 'archived', 'copiedFrom').limit(500).get(),
  ]);
  const shared = folders.docs.filter(doc => Array.isArray(doc.data().shareMembers) && doc.data().shareMembers.length);
  return { shared_folders: shared.length, colleagues: new Set(shared.flatMap(doc => doc.data().shareMembers as string[])).size, shared_sets: sets.docs.filter(doc => !doc.data().archived && readSharing(doc.data().sharing).visibility === 'shared').length, copied_sets: sets.docs.filter(doc => doc.data().copiedFrom).length };
}
