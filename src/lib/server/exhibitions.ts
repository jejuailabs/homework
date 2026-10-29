import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import sharp, { type Metadata } from 'sharp';
import { bucket, db } from './admin';
import {awaitUploadTransfer, cancelUploadTransfer, createUploadTransfer} from './upload-transfer';
import {stableReadUrl} from './signed-urls';
import {assertTeacherStorage} from './teacher-storage';
import {FILE_CACHE_CONTROL} from '../storage-cache';
import { assertOrigin, getContext, type Context } from './auth';
import { ApiError, canManageClass, id, text } from './policy';
import {
  EXHIBITION_ARTWORK_LIMIT, EXHIBITION_LIST_LIMIT, EXHIBITION_PIXEL_LIMIT, EXHIBITION_DERIVATIVE_RESERVATION,
  approvalCountDelta, artworkReview, artworkStudentId, artReaction, canConsumeExhibitionUpload,
  canParticipateExhibition, canSubmitExhibition, canViewArtwork, canViewArtworkFeedback, canViewExhibition, exhibitionStatus, exhibitionTheme,
  exhibitionUploadPolicy, nextPassport, nextReactionCounts, ownsExhibition,
  exhibitionStorageLimit, reserveExhibitionBytes, settleExhibitionBytes, releaseExhibitionBytes, exhibitionCursor, encodeExhibitionCursor, completeExhibitionWrites,
} from './exhibition-policy';
import {artworkToday, validArtworkDate} from '../exhibition-metadata';
import {readBoundedJson} from './ai-policy';
import {readArtworkAuthors} from './ai';
import {artworkAuthorImages} from './artwork-author-policy';
import {moduleOptions} from '@/modules/artwork-extensions/types';
import {effectiveOptions} from '@/modules/artwork-extensions/exhibition-adapter';
import {companionProfile} from '@/modules/my-space/profile';
import {wardrobeOutfit} from './points-policy';
import type { ArtReaction, ArtworkStatus, Exhibition, ExhibitionArtwork, ExhibitionComment, ExhibitionStudent, ExhibitionStorageUsage } from '../exhibition-types';

type Data = Record<string, any>;
const uploadTransaction = <T>(run: (tx: FirebaseFirestore.Transaction) => Promise<T>) => db().runTransaction(run, {maxAttempts: 15});
const now = () => new Date().toISOString();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const exhibitionRef = (exhibitionId: string) => db().doc(`exhibitions/${id(exhibitionId)}`);
const artRef = (exhibitionId: string, artworkId: string) => exhibitionRef(exhibitionId).collection('artworks').doc(id(artworkId));
const passportRef = (exhibitionId: string, studentId: string) => exhibitionRef(exhibitionId).collection('passports').doc(id(studentId));
const quotaRef = (ownerUid: string) => db().doc(`exhibitionStorage/${ownerUid}`);
const storageValue = (value?: Data): ExhibitionStorageUsage => ({ usedBytes: value?.usedBytes ?? 0, reservedBytes: value?.reservedBytes ?? 0, limitBytes: exhibitionStorageLimit(process.env.EXHIBITION_STORAGE_LIMIT_BYTES) });
const mapped = (snap: FirebaseFirestore.DocumentSnapshot): Data => ({ ...snap.data(), id: snap.id });
const asExhibition = (snap: FirebaseFirestore.DocumentSnapshot) => ({ grade: '', year: 0, theme: 'cozy', ...mapped(snap), artworkModules:effectiveOptions(snap.data()?.artworkModules) }) as Exhibition;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

async function body(request: Request): Promise<Data> {
  const raw = await request.text();
  if (raw.length > 20_000) throw new ApiError(413, '입력 내용이 너무 길어요.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new ApiError(400, '입력 내용을 확인해 주세요.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, '입력 내용을 확인해 주세요.');
  return value as Data;
}

function owner(ctx: Context, exhibition: Exhibition) {
  if (!ownsExhibition(ctx, exhibition)) throw new ApiError(403, '이 전시를 관리할 권한이 없어요.', 'FORBIDDEN');
}
function submissionAccess(ctx: Context, exhibition: Exhibition) {
  if (!canSubmitExhibition(ctx, exhibition)) throw new ApiError(403, '이 전시에는 작품을 올릴 수 없어요. 학생 업로드 허용과 전시 상태를 확인해 주세요.', 'EXHIBITION_UPLOAD_DISABLED');
}
function participationAccess(ctx: Context, exhibition: Exhibition) {
  if (!canParticipateExhibition(ctx, exhibition)) throw new ApiError(403, '열려 있는 우리 반 전시에만 참여할 수 있어요.', 'EXHIBITION_CLOSED');
}
async function loadExhibition(ctx: Context, exhibitionId: string) {
  const snapshot = await exhibitionRef(exhibitionId).get();
  if (!snapshot.exists || !canViewExhibition(ctx, asExhibition(snapshot))) throw new ApiError(404, '전시회를 찾을 수 없어요.', 'NOT_FOUND');
  return asExhibition(snapshot);
}
async function loadArtwork(ctx: Context, exhibition: Exhibition, artworkId: string) {
  const snapshot = await artRef(exhibition.id, artworkId).get();
  if (!snapshot.exists || !canViewArtwork(ctx, exhibition, snapshot.data() as { studentId: string; status: ArtworkStatus })) throw new ApiError(404, '작품을 찾을 수 없어요.', 'NOT_FOUND');
  return mapped(snapshot);
}
function studentValue(snapshot: FirebaseFirestore.DocumentSnapshot): ExhibitionStudent {
  const value = snapshot.data()!;
  return { id: snapshot.id, name: value.name, number: value.number, character: value.character ?? 'cat', xp: value.xp ?? 0 };
}
async function signedArtwork(ctx: Context, exhibition: Exhibition, value: Data, ownReaction?: string): Promise<ExhibitionArtwork> {
  const [url, thumbnailUrl] = await Promise.all([stableReadUrl(value.displayPath), stableReadUrl(value.thumbnailPath)]);
  // Never expose original storage paths, tokenized URLs, uploader UIDs, or private manifests.
  return {
    id: value.id, exhibitionId: value.exhibitionId, studentId: value.studentId, artistName: value.artistName ?? value.studentName ?? '', artworkDate: value.artworkDate ?? artworkToday(new Date(value.createdAt)),
    studentName: value.studentName, studentNumber: value.studentNumber,
    title: value.title, description: value.description, status: value.status,
    feedback: canViewArtworkFeedback(ctx, exhibition, value.studentId) ? value.feedback : '',
    width: value.width, height: value.height, url, thumbnailUrl,
    createdAt: value.createdAt, reviewedAt: value.reviewedAt,
    ...(ownReaction ? { ownReaction: artReaction(ownReaction) } : {}),
    ...(canViewArtworkFeedback(ctx, exhibition, value.studentId) ? { reactionCounts: { colors: value.reactionCounts?.colors ?? 0, idea: value.reactionCounts?.idea ?? 0, story: value.reactionCounts?.story ?? 0 } } : {}),
  };
}

async function list(ctx: Context, request: Request) {
  const student = ctx.role === 'student';
  const params = new URL(request.url).searchParams;
  const bootstrap = params.get('bootstrap') === '1';
  const selectedClass = params.has('classId') ? id(params.get('classId')) : undefined;
  if (student && selectedClass && selectedClass !== ctx.classId) throw new ApiError(403, '우리 반 전시만 볼 수 있어요.', 'FORBIDDEN');
  const readPage = async (classId?: string) => {
    const scope = hash(`${ctx.uid}:${classId ?? 'all'}:${student ? 'student' : 'teacher'}`);
    const cursor = exhibitionCursor(params.get('cursor'), scope);
    if (bootstrap && !student && !classId) return { exhibitions: [], limit: EXHIBITION_LIST_LIMIT, hasMore: false, nextCursor: null };
    let query = db().collection('exhibitions').where(classId ? 'classId' : 'ownerUid', '==', classId ?? ctx.uid);
    if (student) query = query.where('status', 'in', ['open', 'closed']);
    query = query.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
    if (cursor) query = query.startAfter(cursor.createdAt, cursor.id);
    const result = await query.limit(EXHIBITION_LIST_LIMIT + 1).get();
    const exhibitions = result.docs.map(asExhibition).filter(value => canViewExhibition(ctx, value))
      .slice(0, EXHIBITION_LIST_LIMIT);
    const hasMore = result.size > EXHIBITION_LIST_LIMIT;
    const last = exhibitions.at(-1);
    return { exhibitions, limit: EXHIBITION_LIST_LIMIT, hasMore, nextCursor: hasMore && last ? encodeExhibitionCursor(scope, last) : null };
  };
  if (student) {
    const [page, profile, cls] = await Promise.all([
      readPage(ctx.classId),
      db().doc(`classes/${ctx.classId}/students/${ctx.studentId}`).get(), db().doc(`classes/${ctx.classId}`).get(),
    ]);
    const owned = profile.data()?.spaceOwned;
    // Only Whiteknee owners need a room read for this first 3D companion release.
    const room = process.env.MY_SPACE_DISABLED !== 'true' && Array.isArray(owned) && owned.includes('animal-whiteknee')
      ? await db().doc(`classes/${ctx.classId}/students/${ctx.studentId}/mySpace/room`).get() : null;
    const selected = room ? companionProfile(profile.data()!, room.data()) : null;
    const worn = wardrobeOutfit(profile.data()?.wardrobeOutfit, profile.data()?.wardrobeOwned);
    const companion = selected?.pet === 'animal-whiteknee' ? {pet: selected.pet, outfit: selected.outfit, wardrobe: {head: worn.head, face: worn.face, neck: worn.neck}} : null;
    return json({ ...page, viewerRole: 'student', viewerId: ctx.uid, selectedClassId: ctx.classId, profile: { ...studentValue(profile), classId: ctx.classId, className: cls.data()?.name ?? '', companion } });
  }
  const readTeacherPage = async () => {
    const classQuery = db().collection('classes').where('ownerUid', '==', ctx.uid).limit(100);
    if (bootstrap && !selectedClass) {
      // The selected building comes from this teacher's fresh owner-scoped list.
      const classes = await classQuery.get();
      const classId = classes.docs[0]?.id;
      return { page: await readPage(classId), classes, selectedClassId: classId ?? null };
    }
    const [page, classes] = await Promise.all([
      (async () => {
        if (selectedClass) {
          const cls = await db().doc(`classes/${selectedClass}`).get();
          if (!cls.exists || !canManageClass(ctx.role, ctx.uid, cls.data()?.ownerUid)) throw new ApiError(403, '이 건물을 볼 권한이 없어요.', 'FORBIDDEN');
        }
        return readPage(selectedClass);
      })(),
      classQuery.get(),
    ]);
    return { page, classes, selectedClassId: selectedClass ?? null };
  };
  const [{ page, classes, selectedClassId }, quota] = await Promise.all([readTeacherPage(), quotaRef(ctx.uid).get()]);
  return json({ ...page, viewerRole: 'teacher', viewerId: ctx.uid, selectedClassId, classes: classes.docs.map(doc => ({ id: doc.id, name: doc.data().name, grade: String(doc.data().grade ?? '').trim() || doc.data().name, studentCount: doc.data().studentCount ?? 0, year: doc.data().year })), storageUsage: storageValue(quota.data()) });
}
async function create(ctx: Context, request: Request) {
  if (ctx.role === 'student') throw new ApiError(403, '선생님만 전시회를 만들 수 있어요.', 'FORBIDDEN');
  const input = await body(request);
  const classId = id(input.classId);
  const cls = await db().doc(`classes/${classId}`).get();
  if (!cls.exists || !canManageClass(ctx.role, ctx.uid, cls.data()?.ownerUid)) throw new ApiError(403, '이 학급을 관리할 권한이 없어요.', 'FORBIDDEN');
  const value = {
    title: text(input.title, '전시 이름', 120), description: text(input.description, '전시 소개', 2000, true),
    classId, className: cls.data()!.name, ownerUid: ctx.uid, status: 'draft', commentsEnabled: true, allowStudentUploads: input.allowStudentUploads === true, publicSharingEnabled: input.publicSharingEnabled === true,
    grade: String(cls.data()!.grade ?? '').trim() || cls.data()!.name, year: cls.data()!.year,
    theme: input.theme === undefined ? 'cozy' : exhibitionTheme(input.theme),
    artworkModules: moduleOptions(input.artworkModules),
    artworkCount: 0, approvedCount: 0, createdAt: now(), updatedAt: now(),
  };
  const ref = await db().collection('exhibitions').add(value);
  return json({ exhibition: { ...value, id: ref.id } }, 201);
}
async function detail(ctx: Context, exhibition: Exhibition) {
  const isOwner = ownsExhibition(ctx, exhibition);
  const [works, roster, passport, reactions] = await Promise.all([
    exhibitionRef(exhibition.id).collection('artworks').limit(EXHIBITION_ARTWORK_LIMIT).get(),
    isOwner ? db().collection(`classes/${exhibition.classId}/students`).get() : null,
    ctx.studentId ? passportRef(exhibition.id, ctx.studentId).get() : null,
    exhibitionRef(exhibition.id).collection('reactions').where('userUid', '==', ctx.uid).limit(EXHIBITION_ARTWORK_LIMIT).get(),
  ]);
  const mine = new Map(reactions.docs.map(doc => [doc.data().artworkId, doc.data().kind]));
  const visible = works.docs.map(mapped).filter(value => canViewArtwork(ctx, exhibition, value as { studentId: string; status: ArtworkStatus })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const artworks = await Promise.all(visible.map(value => signedArtwork(ctx, exhibition, value, mine.get(value.id))));
  return json({
    exhibition, artworks, artworkLimit: EXHIBITION_ARTWORK_LIMIT,
    ...(roster ? { students: roster.docs.filter(doc => !doc.data().disabled).map(studentValue).sort((a, b) => a.number - b.number) } : {}),
    ...(passport ? { passport: { artist: !!passport.data()?.artist, thoughtfulComment: !!passport.data()?.thoughtfulComment, stamps: Number(!!passport.data()?.artist) + Number(!!passport.data()?.thoughtfulComment) } } : {}),
  });
}
async function edit(ctx: Context, exhibition: Exhibition, request: Request) {
  owner(ctx, exhibition);
  const input = await body(request);
  const changes: Data = { updatedAt: now() };
  if ('title' in input) changes.title = text(input.title, '전시 이름', 120);
  if ('description' in input) changes.description = text(input.description, '전시 소개', 2000, true);
  if ('status' in input) changes.status = exhibitionStatus(input.status);
  if ('theme' in input) changes.theme = exhibitionTheme(input.theme);
  if ('artworkModules' in input) {if(!input.artworkModules||typeof input.artworkModules!=='object'||Array.isArray(input.artworkModules))throw new ApiError(400,'작품 기능 설정을 확인해 주세요.');changes.artworkModules=moduleOptions(input.artworkModules);}
  if ('commentsEnabled' in input) {
    if (typeof input.commentsEnabled !== 'boolean') throw new ApiError(400, '감상 허용 설정을 확인해 주세요.');
    changes.commentsEnabled = input.commentsEnabled;
  }
  for (const key of ['allowStudentUploads', 'publicSharingEnabled'] as const) if (key in input) {if (typeof input[key] !== 'boolean') throw new ApiError(400, '전시 설정을 확인해 주세요.'); changes[key] = input[key];}
  await exhibitionRef(exhibition.id).update(changes);
  return json({ exhibition: { ...exhibition, ...changes } });
}

/** Delete abandoned/invalid bytes before releasing their quota. Leases serialize finalize and cleanup. */
export async function cleanupUpload(ownerUid: string, uploadId: string, processingToken?: string, forcePending = false) {
  const ref = db().doc(`exhibitionUploads/${id(uploadId)}`);
  const cleanupToken = randomUUID();
  const claimed = await uploadTransaction(async tx => {
    const snapshot = await tx.get(ref);
    const value = snapshot.data();
    if (!value || value.ownerUid !== ownerUid || value.status === 'submitted' || value.status === 'cleaned') return null;
    const forced = (!!processingToken && value.status === 'processing' && value.processingToken === processingToken) || (forcePending && ['pending','cleanup'].includes(value.status));
    if (!forced && (!value.cleanupAt || value.cleanupAt.toMillis() > Date.now())) return null;
    if (!['pending', 'processing', 'cleanup'].includes(value.status)) return null;
    tx.update(ref, { status: 'cleanup', cleanupToken, cleanupAt: Timestamp.fromMillis(Date.now() + 5 * 60_000) });
    return value;
  });
  if (!claimed) return false;
  try {await cancelUploadTransfer(claimed.uploadUrl);} catch {return false;}
  const paths = [
    `exhibition-uploads/${id(claimed.userUid)}/${uploadId}/original`,
    `exhibition-assets/${id(claimed.exhibitionId)}/${uploadId}/display.webp`,
    `exhibition-assets/${id(claimed.exhibitionId)}/${uploadId}/thumbnail.webp`,
  ];
  const removed = await Promise.allSettled(paths.map(path => bucket().file(path).delete({ ignoreNotFound: true })));
  if (removed.some(result => result.status === 'rejected')) return false;
  return uploadTransaction(async tx => {
    const quota = await tx.get(quotaRef(ownerUid));
    const snapshot = await tx.get(ref);
    const value = snapshot.data();
    if (!value || value.status !== 'cleanup' || value.cleanupToken !== cleanupToken) return false;
    const usage = releaseExhibitionBytes(storageValue(quota.data()), value.reservedBytes ?? 0, false, true);
    tx.set(quota.ref, { ...usage, updatedAt: now() });
    tx.delete(ref);
    return true;
  });
}

async function cleanupOwnerUploads(ownerUid: string) {
  const stale = await db().collection('exhibitionUploads').where('ownerUid', '==', ownerUid)
    .where('status', 'in', ['pending', 'processing', 'cleanup']).where('cleanupAt', '<=', Timestamp.now())
    .orderBy('cleanupAt', 'asc').limit(20).get();
  let cleaned = 0;
  // Keep object deletion concurrency bounded; physical deletion must finish before quota is released.
  for (const snapshot of stale.docs) if (await cleanupUpload(ownerUid, snapshot.id)) cleaned++;
  return { cleaned, hasMore: stale.size === 20 };
}

async function cleanup(ctx: Context) {
  if (ctx.role === 'student') throw new ApiError(403, '선생님만 정리할 수 있어요.', 'FORBIDDEN');
  const result = await cleanupOwnerUploads(ctx.uid);
  return json({ ...result, storageUsage: storageValue((await quotaRef(ctx.uid).get()).data()) });
}

function queueReplacedArtwork(tx: FirebaseFirestore.Transaction, ownerUid: string, old: Data) {
  const fileId = old.uploadId || old.displayPath.split('/')[2];
  const jobId=hash(old.exhibitionId + ':' + fileId);
  tx.set(db().doc(`exhibitionAssetCleanup/${jobId}`), {ownerUid, paths: [`exhibition-uploads/${old.uploaderUid}/${fileId}/original`, old.displayPath, old.thumbnailPath], bytes: old.storedBytes || 0, originalManifest: fileId});
  return jobId;
}
export async function cleanupReplacedArtworks(ownerUid: string, jobIds?: string[]) {
  const jobs = jobIds ? (jobIds.length ? await db().getAll(...jobIds.map(jobId=>db().doc(`exhibitionAssetCleanup/${jobId}`))) : []) : (await db().collection('exhibitionAssetCleanup').where('ownerUid', '==', ownerUid).limit(30).get()).docs;
  for (const job of jobs) {
    if(!job.exists || job.data()?.ownerUid!==ownerUid)continue;
    const value = job.data()!;
    const removed = await Promise.allSettled(value.paths.map((path: string) => bucket().file(path).delete({ignoreNotFound: true})));
    if (removed.some(result => result.status === 'rejected')) continue;
    await uploadTransaction(async tx => {
      const quota = await tx.get(quotaRef(ownerUid));
      const [fresh, manifest] = await Promise.all([tx.get(job.ref), tx.get(db().doc(`exhibitionUploads/${value.originalManifest}`))]);
      if (!fresh.exists) return;
      const usage = storageValue(quota.data()); tx.set(quota.ref, {...usage, usedBytes: Math.max(0, usage.usedBytes - value.bytes), updatedAt: now()});
      if (manifest.exists) tx.delete(manifest.ref);
      tx.delete(job.ref);
    });
  }
}
export async function cleanupExpiredExhibitionUploads() {
  const pending = await db().collection('exhibitionUploads').where('status','in',['pending','processing','cleanup']).get();
  const expired = pending.docs.filter(doc=>(doc.data().cleanupAt?.toMillis()||Infinity)<=Date.now()).slice(0,100);
  let cleaned=0;
  for(let start=0;start<expired.length;start+=5) await Promise.all(expired.slice(start,start+5).map(async doc=>{if(await cleanupUpload(doc.data().ownerUid,doc.id))cleaned++;}));
  const jobs=await db().collection('exhibitionAssetCleanup').get();
  for(const ownerUid of new Set(jobs.docs.map(doc=>doc.data().ownerUid as string))) await cleanupReplacedArtworks(ownerUid);
  return {cleaned,hasMore:expired.length===100};
}
async function initUpload(ctx: Context, exhibition: Exhibition, request: Request) {
  submissionAccess(ctx, exhibition);
  const input = await body(request);
  const {contentType, size} = exhibitionUploadPolicy(input.contentType, input.size), fileName = text(input.fileName, '파일 이름', 255);
  const uploadId = input.requestId ? hash(`${ctx.uid}:${exhibition.id}:${id(input.requestId)}`) : randomUUID();
  const ref = db().doc(`exhibitionUploads/${uploadId}`), path = `exhibition-uploads/${ctx.uid}/${uploadId}/original`;
  // Supersede this learner's abandoned transfers, not other classmates' uploads.
  const staged = await db().collection('exhibitionUploads').where('userUid', '==', ctx.uid).get();
  for (const doc of staged.docs) if (ctx.role === 'student' && doc.id !== uploadId && doc.data().exhibitionId === exhibition.id && ['pending','cleanup'].includes(doc.data().status)) await cleanupUpload(exhibition.ownerUid, doc.id, undefined, true);
  const same = await ref.get(); if(same.data()?.status==='cleanup') await cleanupUpload(exhibition.ownerUid,uploadId,undefined,true);
  await cleanupOwnerUploads(exhibition.ownerUid);
  const reservedBytes = size + EXHIBITION_DERIVATIVE_RESERVATION, expiresAt = Timestamp.fromMillis(Date.now() + 3_600_000);
  await assertTeacherStorage(exhibition.ownerUid, reservedBytes);
  let existing = await uploadTransaction(async tx => {
    const quota = await tx.get(quotaRef(exhibition.ownerUid));
    const fresh = await tx.get(exhibitionRef(exhibition.id));
    const old = await tx.get(ref);
    if (!fresh.exists) throw new ApiError(404, '전시회를 찾을 수 없어요.'); submissionAccess(ctx, asExhibition(fresh));
    if (old.exists) {
      const value = old.data()!;
      if (value.userUid !== ctx.uid || value.fileName !== fileName || value.size !== size || value.contentType !== contentType) throw new ApiError(409, '전송 정보가 바뀌었어요.', 'UPLOAD_MISMATCH');
      if (!['pending','submitted'].includes(value.status)) throw new ApiError(409, '사진을 정리 중이에요. 다시 시도해 주세요.', 'UPLOAD_PROCESSING');
      return value;
    }
    const usage = reserveExhibitionBytes(storageValue(quota.data()), reservedBytes);
    tx.set(quota.ref, {...usage, updatedAt: now()});
    tx.create(ref, {exhibitionId: exhibition.id, classId: exhibition.classId, userUid: ctx.uid, ownerUid: exhibition.ownerUid, studentId: ctx.studentId ?? null, path, fileName, contentType, size, reservedBytes, status: 'pending', createdAt: now(), expiresAt, cleanupAt: expiresAt});
    return null;
  });
  existing = await awaitUploadTransfer(ref, existing);
  if (existing?.status === 'submitted') return json({uploadId, path, alreadyUploaded: true, uploadUrl: '', uploadHeaders: {}});
  try {
    const transfer = existing?.uploadUrl ? {uploadUrl: existing.uploadUrl, uploadHeaders: {'Content-Type': contentType}} : await createUploadTransfer(path, contentType, size, new URL(request.url).origin);
    if (!existing?.uploadUrl) await ref.update({uploadUrl: transfer.uploadUrl});
    return json({uploadId, path, ...transfer, alreadyUploaded: existing ? (await bucket().file(path).exists())[0] : false}, 201);
  } catch (error) {await cleanupUpload(exhibition.ownerUid, uploadId, undefined, true); throw error;}
}
async function cancelUpload(ctx: Context, exhibition: Exhibition, uploadId: string) {
  const doc = await db().doc(`exhibitionUploads/${id(uploadId)}`).get();
  if (doc.exists && (doc.data()?.exhibitionId !== exhibition.id || doc.data()?.userUid !== ctx.uid)) throw new ApiError(403, '본인의 전송만 정리할 수 있어요.', 'FORBIDDEN');
  if (doc.exists) await cleanupUpload(exhibition.ownerUid, uploadId, undefined, true);
  return json({ok: true});
}
async function prepareImage(uploadId: string, upload: Data, processingToken: string) {
  const file = bucket().file(upload.path);
  const [metadata] = await file.getMetadata().catch(() => { throw new ApiError(409, '사진을 전송하고 있어요. 잠시 뒤 다시 시도해 주세요.', 'UPLOAD_INCOMPLETE'); });
  // Remove Firebase download tokens even for invalid files, before attempting decoding.
  await file.setMetadata({ cacheControl: 'private,no-store', metadata: { firebaseStorageDownloadTokens: null } });
  if (Number(metadata.size) !== upload.size || metadata.contentType !== upload.contentType) throw new ApiError(400, '사진 정보가 달라요. 다시 올려 주세요.', 'UPLOAD_MISMATCH');
  const [buffer] = await file.download();
  const image = sharp(buffer, { limitInputPixels: EXHIBITION_PIXEL_LIMIT, failOn: 'error', animated: false });
  let info: Metadata;
  try { info = await image.metadata(); } catch { throw new ApiError(400, '사진을 읽을 수 없어요. 4천만 화소 이하의 JPG, PNG, WebP로 다시 올려 주세요.', 'IMAGE_INVALID'); }
  const expected = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }[upload.contentType as string];
  if (!info.width || !info.height || info.format !== expected || (info.pages ?? 1) > 1 || info.width * info.height > EXHIBITION_PIXEL_LIMIT) throw new ApiError(400, '움직이지 않는 JPG, PNG, WebP 사진을 선택해 주세요. 최대 4천만 화소까지 지원해요.', 'IMAGE_INVALID');
  const displayPath = `exhibition-assets/${upload.exhibitionId}/${uploadId}/display.webp`;
  const thumbnailPath = `exhibition-assets/${upload.exhibitionId}/${uploadId}/thumbnail.webp`;
  let display: Buffer;
  let thumbnail: Buffer;
  try {
    // EXIF orientation is applied; all metadata is removed from displayed derivatives.
    display = await image.clone().rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
    thumbnail = await image.clone().rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  } catch { throw new ApiError(400, '손상된 사진이에요. 다른 사진으로 다시 올려 주세요.', 'IMAGE_INVALID'); }
  const options = { resumable: false, metadata: { contentType: 'image/webp', cacheControl: FILE_CACHE_CONTROL } };
  const lease = (await db().doc(`exhibitionUploads/${uploadId}`).get()).data();
  if (lease?.status !== 'processing' || lease.processingToken !== processingToken || lease.cleanupAt.toMillis() <= Date.now()) throw new ApiError(409, '사진 처리가 만료되었어요. 다시 올려 주세요.', 'UPLOAD_EXPIRED');
  const storedBytes = upload.size + display.length + thumbnail.length;
  if (storedBytes > lease.reservedBytes) {
    // Reserve any unusual derivative expansion before writing those bytes to storage.
    await uploadTransaction(async tx => {
      const ref = db().doc(`exhibitionUploads/${uploadId}`);
      const quota = await tx.get(quotaRef(upload.ownerUid));
      const fresh = await tx.get(ref);
      const current = fresh.data();
      if (current?.status !== 'processing' || current.processingToken !== processingToken || current.cleanupAt.toMillis() <= Date.now()) throw new ApiError(409, '사진 처리가 만료되었어요.', 'UPLOAD_EXPIRED');
      const extra = storedBytes - current.reservedBytes;
      if (extra > 0) {
        const usage = reserveExhibitionBytes(storageValue(quota.data()), extra);
        tx.set(quota.ref, { ...usage, updatedAt: now() });
        tx.update(ref, { reservedBytes: storedBytes });
      }
    });
  }
  await completeExhibitionWrites([
    bucket().file(displayPath).save(display, options), bucket().file(thumbnailPath).save(thumbnail, options),
  ]);
  const swapped = [5, 6, 7, 8].includes(info.orientation ?? 1);
  return { displayPath, thumbnailPath, width: swapped ? info.height : info.width, height: swapped ? info.width : info.height, storedBytes };
}

async function finalize(ctx: Context, exhibition: Exhibition, request: Request) {
  submissionAccess(ctx, exhibition);
  const input = await body(request);
  const uploadId = id(input.uploadId);
  if (ctx.role === 'student' && input.studentId && input.studentId !== ctx.studentId) throw new ApiError(403, '자기 작품만 올릴 수 있어요.', 'FORBIDDEN');
  const studentId = ctx.role === 'student' ? ctx.studentId! : artworkStudentId(input.studentId);
  const artworkDate = input.artworkDate === undefined ? artworkToday() : text(input.artworkDate, '날짜', 10);
  if (!validArtworkDate(artworkDate)) throw new ApiError(400, '날짜를 확인해 주세요.', 'INVALID_DATE');
  const artistName = ctx.role === 'student' ? '' : text(input.artistName, '작가명', 50, true);
  const title = text(input.title, '작품 제목', 120);
  const description = text(input.description, '작품 설명', 2000, true);
  const fingerprint = hash(JSON.stringify({ studentId, title, description, artworkDate, artistName }));
  const uploadRef = db().doc(`exhibitionUploads/${uploadId}`);
  const [uploadDoc, studentDoc] = await Promise.all([uploadRef.get(), studentId ? db().doc(`classes/${exhibition.classId}/students/${studentId}`).get() : null]);
  const upload = uploadDoc.data();
  if (studentId && (!studentDoc?.exists || studentDoc.data()?.disabled)) throw new ApiError(400, '이 학급의 학생을 선택해 주세요.', 'STUDENT_INVALID');
  if (!upload || upload.userUid !== ctx.uid || upload.exhibitionId !== exhibition.id) throw new ApiError(400, '사진을 다시 올려 주세요.', 'UPLOAD_INVALID');
  if (upload.status === 'submitted' && upload.fingerprint === fingerprint) return json({ artwork: await signedArtwork(ctx, exhibition, mapped(await artRef(exhibition.id, upload.artworkId || uploadId).get())) });
  if (upload.status === 'processing') {
    if ((upload.cleanupAt?.toMillis() ?? 0) <= Date.now()) {
      await cleanupUpload(upload.ownerUid, uploadId);
      throw new ApiError(409, '사진 처리가 만료되었어요. 다시 올려 주세요.', 'UPLOAD_EXPIRED');
    }
    throw new ApiError(409, '사진을 정리하고 있어요. 잠시 뒤 다시 시도해 주세요.', 'UPLOAD_PROCESSING');
  }
  if (!canConsumeExhibitionUpload(ctx, exhibition.id, upload) || upload.expiresAt.toMillis() <= Date.now()) throw new ApiError(409, '사진을 다시 올려 주세요.', 'UPLOAD_USED');
  const processingToken = randomUUID();
  const acquired = await uploadTransaction(async tx => {
    const snapshot = await tx.get(uploadRef);
    const current = snapshot.data();
    if (current?.status === 'submitted' && current.fingerprint === fingerprint && current.userUid === ctx.uid) return false;
    if (current?.status === 'processing') {
      if ((current.cleanupAt?.toMillis() ?? 0) <= Date.now()) return 'expired';
      throw new ApiError(409, '사진을 정리하고 있어요. 잠시 뒤 다시 시도해 주세요.', 'UPLOAD_PROCESSING');
    }
    if (!canConsumeExhibitionUpload(ctx, exhibition.id, current) || current!.expiresAt.toMillis() <= Date.now()) throw new ApiError(409, '사진을 다시 올려 주세요.', 'UPLOAD_USED');
    tx.update(uploadRef, { status: 'processing', processingToken, cleanupAt: Timestamp.fromMillis(Date.now() + 5 * 60_000) });
    return true;
  });
  if (acquired === 'expired') {
    await cleanupUpload(upload.ownerUid, uploadId);
    throw new ApiError(409, '사진 처리가 만료되었어요. 다시 올려 주세요.', 'UPLOAD_EXPIRED');
  }
  if (!acquired) return json({ artwork: await signedArtwork(ctx, exhibition, mapped(await artRef(exhibition.id, upload.artworkId || uploadId).get())) });
  try {
  const image = await prepareImage(uploadId, upload, processingToken);
  const slot = studentId ? exhibitionRef(exhibition.id).collection('studentWorks').doc(studentId) : null;
  const legacy = studentId ? await exhibitionRef(exhibition.id).collection('artworks').where('studentId', '==', studentId).get() : null;
  const targetId = legacy?.docs.sort((a,b) => String(b.data().createdAt).localeCompare(String(a.data().createdAt)))[0]?.id || uploadId;
  const slotDoc = slot ? await slot.get() : null;
  const ref = artRef(exhibition.id, slotDoc?.data()?.artworkId || targetId);
  const passport = studentId ? passportRef(exhibition.id, studentId) : null;
  const cleanupJobs=new Set<string>();
  const result = await uploadTransaction(async tx => {
    // Every quota-writing transaction acquires shared documents in this order.
    // Parallel reads could otherwise hold the room and quota in opposite orders.
    const quota = await tx.get(quotaRef(exhibition.ownerUid));
    const freshExhibition = await tx.get(exhibitionRef(exhibition.id));
    const [freshUpload, previous, freshStudent, previousPassport] = await Promise.all([
      tx.get(uploadRef), tx.get(ref), studentDoc ? tx.get(studentDoc.ref) : null, passport ? tx.get(passport) : null,
    ]);
    const freshSlot = slot ? await tx.get(slot) : null;
    const extraRefs = legacy?.docs.filter(doc=>doc.id!==ref.id).map(doc=>doc.ref) || [];
    const extras = extraRefs.length ? (await tx.getAll(...extraRefs)).filter(doc=>doc.exists && doc.data()?.studentId===studentId) : [];
    if (freshSlot?.exists && freshSlot.data()?.artworkId !== ref.id) throw new ApiError(409, '작품 저장이 겹쳤어요. 다시 시도해 주세요.', 'UPLOAD_PROCESSING');
    if (!freshExhibition.exists) throw new ApiError(404, '전시회를 찾을 수 없어요.');
    submissionAccess(ctx, asExhibition(freshExhibition));
    if (previous.exists && freshUpload.data()?.fingerprint === fingerprint && freshUpload.data()?.userUid === ctx.uid) return mapped(previous);
    if (freshUpload.data()?.status !== 'processing' || freshUpload.data()?.processingToken !== processingToken || freshUpload.data()!.cleanupAt.toMillis() <= Date.now()) throw new ApiError(409, '이미 사용되었거나 만료된 사진이에요.', 'UPLOAD_USED');
    if (studentId && (!freshStudent?.exists || freshStudent.data()?.disabled || (ctx.role === 'student' && freshStudent.data()?.authUid !== ctx.uid))) throw new ApiError(400, '학생 정보를 다시 확인해 주세요.', 'STUDENT_INVALID');
    if (!previous.exists && (freshExhibition.data()!.artworkCount ?? 0) >= EXHIBITION_ARTWORK_LIMIT) throw new ApiError(409, '전시 한 곳에는 작품 300점까지 담을 수 있어요.', 'ARTWORK_LIMIT');
    const value = {
      id: ref.id, uploadId, exhibitionId: exhibition.id, classId: exhibition.classId, uploaderUid: ctx.uid,
      studentId, studentName: freshStudent?.data()?.name ?? '', studentNumber: freshStudent?.data()?.number ?? 0,
      title, description, artworkDate, artistName: ctx.role === 'student' ? freshStudent?.data()?.name ?? '' : artistName || freshStudent?.data()?.name || '', status: ctx.role === 'student' ? 'pending' : 'approved', feedback: '', ...image,
      createdAt: now(), reviewedAt: ctx.role === 'student' ? null : now(), commentCount: previous.data()?.commentCount || 0, reactionCounts: previous.data()?.reactionCounts || { colors: 0, idea: 0, story: 0 },
    };
    const usage = settleExhibitionBytes(storageValue(quota.data()), freshUpload.data()!.reservedBytes ?? 0, image.storedBytes);
    tx.set(db().doc(`uploadTransferStats/gallery_${uploadId}`),{ownerUid:exhibition.ownerUid,bytes:upload.size,month:artworkToday().slice(0,7),createdAt:now(),source:'gallery'});
    tx.set(ref, value);
    if (slot) tx.set(slot, {artworkId: ref.id});
    if (previous.exists) cleanupJobs.add(queueReplacedArtwork(tx, exhibition.ownerUid, previous.data()!));
    extras.forEach(doc=>{cleanupJobs.add(queueReplacedArtwork(tx, exhibition.ownerUid, doc.data()!));tx.delete(doc.ref);});
    tx.set(quota.ref, { ...usage, updatedAt: now() });
    tx.update(uploadRef, { status: 'submitted', artworkId: ref.id, fingerprint, submittedAt: now(), reservedBytes: 0, storedBytes: image.storedBytes, cleanupAt: null });
    tx.update(exhibitionRef(exhibition.id), { artworkCount: FieldValue.increment((previous.exists ? 0 : 1) - extras.length), approvedCount: FieldValue.increment((ctx.role === 'student' ? 0 : 1) - (previous.data()?.status === 'approved' ? 1 : 0) - extras.filter(doc=>doc.data()?.status==='approved').length), updatedAt: now() });
    if (passport && ctx.role !== 'student') tx.set(passport, { ...nextPassport(previousPassport?.data(), 'artist'), updatedAt: now() });
    return value;
  });
  await cleanupReplacedArtworks(exhibition.ownerUid,[...cleanupJobs]).catch(()=>console.error('Replaced artwork cleanup deferred'));
  return json({ artwork: await signedArtwork(ctx, exhibition, result) }, 201);
  } catch (error) {
    await cleanupUpload(upload.ownerUid, uploadId, processingToken);
    throw error;
  }
}

async function reviewArtwork(ctx: Context, exhibition: Exhibition, artworkId: string, request: Request) {
  owner(ctx, exhibition);
  const input = await body(request);
  const changes: Data = {};
  if ('status' in input) changes.status = artworkReview(input.status);
  if ('feedback' in input) changes.feedback = text(input.feedback, '선생님 한마디', 1000, true);
  if ('title' in input) changes.title = text(input.title, '작품 제목', 120);
  if ('description' in input) changes.description = text(input.description, '작품 설명', 2000, true);
  if ('artistName' in input) changes.artistName = text(input.artistName, '작가명', 50, true);
  if ('artworkDate' in input) {const day = text(input.artworkDate, '날짜', 10); if (!validArtworkDate(day)) throw new ApiError(400, '날짜를 확인해 주세요.'); changes.artworkDate = day;}
  if ('studentId' in input) changes.studentId = artworkStudentId(input.studentId);
  if (!Object.keys(changes).length) throw new ApiError(400, '수정할 내용을 입력해 주세요.');
  const ref = artRef(exhibition.id, artworkId);
  const result = await uploadTransaction(async tx => {
    await tx.get(exhibitionRef(exhibition.id));
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new ApiError(404, '작품을 찾을 수 없어요.');
    const value = snapshot.data()!;
    const studentId = 'studentId' in changes ? changes.studentId : value.studentId;
    const oldSlot = value.studentId ? exhibitionRef(exhibition.id).collection('studentWorks').doc(value.studentId) : null;
    const newSlot = studentId ? exhibitionRef(exhibition.id).collection('studentWorks').doc(studentId) : null;
    const [oldSlotDoc, newSlotDoc] = await Promise.all([oldSlot ? tx.get(oldSlot) : null, newSlot ? tx.get(newSlot) : null]);
    if ('studentId' in changes && studentId !== value.studentId && newSlotDoc?.exists && newSlotDoc.data()?.artworkId !== ref.id) throw new ApiError(409, '이 학생의 작품이 이미 있어요. 해당 작품을 교체해 주세요.', 'STUDENT_WORK_EXISTS');
    const stampRef = studentId ? passportRef(exhibition.id, studentId) : null;
    const [stamp, student] = await Promise.all([
      stampRef ? tx.get(stampRef) : null,
      studentId && 'studentId' in changes ? tx.get(db().doc(`classes/${exhibition.classId}/students/${studentId}`)) : null,
    ]);
    if (studentId && 'studentId' in changes && (!student?.exists || student.data()?.disabled)) throw new ApiError(400, '이 학급의 학생을 선택해 주세요.', 'STUDENT_INVALID');
    const edited = {
      ...changes,
      ...('studentId' in changes ? { studentName: student?.data()?.name ?? '', studentNumber: student?.data()?.number ?? 0 } : {}),
      ...('status' in changes ? { reviewedAt: now() } : {}),
    };
    // Keep the effective state explicit for metadata-only edits and TypeScript inference.
    const updated = { ...value, ...edited, id: snapshot.id, status: (changes.status ?? value.status) as ArtworkStatus };
    tx.update(ref, edited);
    if ('studentId' in changes) {
      if (oldSlot && value.studentId !== studentId && oldSlotDoc?.data()?.artworkId === ref.id) tx.delete(oldSlot);
      if (newSlot) tx.set(newSlot, {artworkId: ref.id});
    }
    tx.update(exhibitionRef(exhibition.id), { approvedCount: FieldValue.increment(approvalCountDelta(value.status, updated.status)), updatedAt: now() });
    if (updated.status === 'approved' && stampRef) tx.set(stampRef, { ...nextPassport(stamp?.data(), 'artist'), updatedAt: now() });
    return updated;
  });
  return json({ artwork: await signedArtwork(ctx, exhibition, result) });
}

function commentView(value: Data, ctx: Context): ExhibitionComment {
  return { id: value.id, text: value.text, authorName: value.authorName, authorRole: value.authorRole, status: value.status, createdAt: value.createdAt, isOwn: value.authorUid === ctx.uid };
}
async function comments(ctx: Context, exhibition: Exhibition, artworkId: string, request: Request) {
  const artwork = await loadArtwork(ctx, exhibition, artworkId);
  const collection = artRef(exhibition.id, artworkId).collection('comments');
  if (request.method === 'GET') {
    const snapshots = await collection.limit(100).get();
    const rows = snapshots.docs.map(mapped).filter(value => ownsExhibition(ctx, exhibition) || value.status === 'approved' || (value.authorUid === ctx.uid && value.status === 'pending')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return json({ comments: rows.map(value => commentView(value, ctx)), limit: 100 });
  }
  participationAccess(ctx, exhibition);
  if (!exhibition.commentsEnabled) throw new ApiError(403, '지금은 감상을 남길 수 없어요.', 'COMMENTS_DISABLED');
  if (artwork.status !== 'approved') throw new ApiError(403, '전시된 작품에 감상을 남겨 주세요.', 'ARTWORK_NOT_APPROVED');
  const input = await body(request);
  const commentText = text(input.text, '감상', 500);
  const isTeacher = ownsExhibition(ctx, exhibition);
  const profile = !isTeacher ? await db().doc(`classes/${exhibition.classId}/students/${ctx.studentId}`).get() : null;
  // Network retries must not create duplicate comments or consume the per-work cap.
  const ref = collection.doc(hash(`${ctx.uid}:${commentText}`));
  const value = {
    text: commentText, authorUid: ctx.uid, studentId: ctx.studentId ?? null,
    authorName: isTeacher ? (ctx.displayName ?? '선생님') : profile?.data()?.name ?? '친구',
    authorRole: isTeacher ? 'teacher' : 'student', status: isTeacher ? 'approved' : 'pending', createdAt: now(),
  };
  const saved = await uploadTransaction(async tx => {
    const [freshExhibition, freshArt, previous] = await Promise.all([tx.get(exhibitionRef(exhibition.id)), tx.get(artRef(exhibition.id, artworkId)), tx.get(ref)]);
    if (!freshExhibition.exists || !freshArt.exists) throw new ApiError(404, '작품을 찾을 수 없어요.');
    participationAccess(ctx, asExhibition(freshExhibition));
    if (!freshExhibition.data()!.commentsEnabled || freshArt.data()!.status !== 'approved') throw new ApiError(409, '작품의 감상 설정이 바뀌었어요. 새로고침해 주세요.', 'COMMENTS_DISABLED');
    if (previous.exists) return mapped(previous);
    if ((freshArt.data()!.commentCount ?? 0) >= 100) throw new ApiError(409, '이 작품의 감상 공간이 가득 찼어요.', 'COMMENT_LIMIT');
    tx.create(ref, value);
    tx.update(freshArt.ref, { commentCount: FieldValue.increment(1) });
    return { ...value, id: ref.id };
  });
  return json({ comment: commentView(saved, ctx) }, 201);
}
async function moderateComment(ctx: Context, exhibition: Exhibition, artworkId: string, commentId: string, request: Request) {
  owner(ctx, exhibition);
  const input = await body(request);
  if (input.status !== 'approved' && input.status !== 'hidden') throw new ApiError(400, '감상 확인 상태를 선택해 주세요.');
  const ref = artRef(exhibition.id, artworkId).collection('comments').doc(id(commentId));
  const result = await uploadTransaction(async tx => {
    const [comment, artwork] = await Promise.all([tx.get(ref), tx.get(artRef(exhibition.id, artworkId))]);
    if (!comment.exists || !artwork.exists) throw new ApiError(404, '감상을 찾을 수 없어요.');
    const value = comment.data()!;
    const eligible = input.status === 'approved' && value.authorRole === 'student' && value.studentId !== artwork.data()!.studentId && value.text.trim().length >= 10;
    const stampRef = eligible ? passportRef(exhibition.id, value.studentId) : null;
    const stamp = stampRef ? await tx.get(stampRef) : null;
    tx.update(ref, { status: input.status, reviewedAt: now(), reviewerUid: ctx.uid });
    if (stampRef) tx.set(stampRef, { ...nextPassport(stamp?.data(), 'thoughtfulComment'), updatedAt: now() });
    return { ...value, id: comment.id, status: input.status };
  });
  return json({ comment: commentView(result, ctx) });
}
async function reaction(ctx: Context, exhibition: Exhibition, artworkId: string, request: Request) {
  participationAccess(ctx, exhibition);
  const input = await body(request);
  const kind = artReaction(input.kind);
  const ref = exhibitionRef(exhibition.id).collection('reactions').doc(hash(`${ctx.uid}:${artworkId}`));
  const result = await uploadTransaction(async tx => {
    const [freshExhibition, artwork, previous] = await Promise.all([tx.get(exhibitionRef(exhibition.id)), tx.get(artRef(exhibition.id, artworkId)), tx.get(ref)]);
    if (!freshExhibition.exists || !artwork.exists) throw new ApiError(404, '작품을 찾을 수 없어요.');
    participationAccess(ctx, asExhibition(freshExhibition));
    if (artwork.data()!.status !== 'approved') throw new ApiError(403, '전시된 작품을 응원해 주세요.');
    const counts = nextReactionCounts(artwork.data()!.reactionCounts, previous.data()?.kind as ArtReaction | undefined, kind);
    // Both records commit together: retries and changing choices never inflate encouragement.
    tx.set(ref, { userUid: ctx.uid, artworkId, kind, updatedAt: now() });
    tx.update(artwork.ref, { reactionCounts: counts });
    return canViewArtworkFeedback(ctx, asExhibition(freshExhibition), artwork.data()!.studentId) ? counts : undefined;
  });
  return json({ ownReaction: kind, ...(result ? { reactionCounts: result } : {}) });
}

async function shareExhibition(ctx: Context, exhibition: Exhibition, request: Request) {
  owner(ctx, exhibition);
  const ref = db().doc(`exhibitionShares/${exhibition.id}`);
  const result = await uploadTransaction(async tx => {
    const cls = await tx.get(exhibitionRef(exhibition.id)), previous = await tx.get(ref);
    if (!cls.exists || !ownsExhibition(ctx, asExhibition(cls))) throw new ApiError(403, '이 전시를 공유할 권한이 없어요.');
    let token = previous.data()?.token as string | undefined;
    if (!token) {token = randomBytes(32).toString('base64url'); tx.create(ref, {token, createdAt: now()}); tx.create(db().doc(`exhibitionShareLinks/${hash(token)}`), {exhibitionId: exhibition.id});}
    return {path: `/gallery/${token}`, enabled: cls.data()?.publicSharingEnabled === true, status: cls.data()?.status, artworkModules: moduleOptions(cls.data()?.artworkModules)};
  });
  return json(result);
}

export async function publicExhibition(request: Request, token: string) {
  try {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(404, '공유된 전시실을 찾을 수 없어요.', 'NOT_FOUND');
    const link = await db().doc(`exhibitionShareLinks/${hash(token)}`).get();
    if (!link.exists) throw new ApiError(404, '공유된 전시실을 찾을 수 없어요.', 'NOT_FOUND');
    const room = await exhibitionRef(link.data()!.exhibitionId).get(), value = room.data();
    if (!room.exists || value?.publicSharingEnabled !== true || !['open', 'closed'].includes(value.status)) throw new ApiError(404, '전시실이 아직 공개되지 않았거나 공유가 종료됐어요.', 'NOT_FOUND');
    const works = await room.ref.collection('artworks').where('status', '==', 'approved').limit(EXHIBITION_ARTWORK_LIMIT).get();
    const artworks = await Promise.all(works.docs.map(async doc => {const art = doc.data(); const [url, thumbnailUrl] = await Promise.all([stableReadUrl(art.displayPath), stableReadUrl(art.thumbnailPath)]);return {id: doc.id, title: art.title, artistName: art.artistName || art.studentName || '', artworkDate: art.artworkDate || artworkToday(new Date(art.createdAt)), description: art.description, width: art.width, height: art.height, url, thumbnailUrl};}));
    const fresh = await room.ref.get();
    if (fresh.data()?.publicSharingEnabled !== true || !['open', 'closed'].includes(fresh.data()?.status)) throw new ApiError(404, '공유가 종료됐어요.', 'NOT_FOUND');
    return json({exhibition: {id: room.id, title: value.title, description: value.description, theme: value.theme, allowStudentUploads: value.allowStudentUploads === true && value.status === 'open', artworkModules: {...effectiveOptions(value.artworkModules),voice:{...effectiveOptions(value.artworkModules).voice,enabled:effectiveOptions(value.artworkModules).voice.enabled&&effectiveOptions(value.artworkModules).voice.publicAudio}}}, artworks});
  } catch (error) {return json({error: error instanceof ApiError ? error.message : '전시실을 열지 못했어요.'}, error instanceof ApiError ? error.status : 500);}
}

export async function handleExhibitions(request: Request, segments: string[] = []) {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) assertOrigin(request);
    const ctx = await getContext(request);
    if (segments.length === 1 && segments[0] === 'cleanup' && request.method === 'POST') return await cleanup(ctx);
    if (!segments.length) {
      if (request.method === 'GET') return await list(ctx, request);
      if (request.method === 'POST') return await create(ctx, request);
    } else {
      const [exhibitionId, section, artworkId, action, commentId] = segments;
      segments.forEach(value => id(value));
      const exhibition = await loadExhibition(ctx, exhibitionId);
      if (segments.length === 1 && request.method === 'GET') return await detail(ctx, exhibition);
      if (segments.length === 1 && request.method === 'PATCH') return await edit(ctx, exhibition, request);
      if (segments.length === 2 && section === 'share' && request.method === 'GET') return await shareExhibition(ctx, exhibition, request);
      if (segments.length === 2 && section === 'read-authors' && request.method === 'POST') {owner(ctx, exhibition); const input = await readBoundedJson(request, 3_300_000) as {images?: unknown}; return json({names: await readArtworkAuthors(ctx.uid, artworkAuthorImages(input.images),exhibition.classId)});}
      if (segments.length === 2 && section === 'uploads' && request.method === 'POST') return await initUpload(ctx, exhibition, request);
      if (segments.length === 3 && section === 'uploads' && request.method === 'DELETE') return await cancelUpload(ctx, exhibition, artworkId);
      if (section === 'artworks') {
        if (segments.length === 2 && request.method === 'POST') return await finalize(ctx, exhibition, request);
        if (segments.length === 3 && request.method === 'PATCH') return await reviewArtwork(ctx, exhibition, artworkId, request);
        if (segments.length === 4 && action === 'comments' && ['GET', 'POST'].includes(request.method)) return await comments(ctx, exhibition, artworkId, request);
        if (segments.length === 5 && action === 'comments' && request.method === 'PATCH') return await moderateComment(ctx, exhibition, artworkId, commentId, request);
        if (segments.length === 4 && action === 'reaction' && request.method === 'POST') return await reaction(ctx, exhibition, artworkId, request);
      }
    }
    throw new ApiError(404, '요청한 기능을 찾을 수 없어요.', 'NOT_FOUND');
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message, code: error.code }, error.status);
    console.error('Exhibition operation failed', (error as { code?: string }).code ?? 'INTERNAL');
    return json({ error: '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 'INTERNAL_ERROR' }, 500);
  }
}
