import 'server-only';
import {randomUUID} from 'node:crypto';
import {Timestamp, type Transaction} from 'firebase-admin/firestore';
import {NextResponse} from 'next/server';
import sharp from 'sharp';
import {bucket, db} from './admin';
import {cancelUploadTransfer, createUploadTransfer} from './upload-transfer';
import {stableReadUrl} from './signed-urls';
import {FILE_CACHE_CONTROL} from '../storage-cache';
import {FEATURE_STORAGE_CEILING} from '../storage-plan';
import {assertTeacherStorage} from './teacher-storage';
import {assertOrigin, requireTeacher, type Context} from './auth';
import {ApiError, canManageClass, id, text} from './policy';
import {ASSIGNMENT_MATERIAL_LIMIT, validAssignmentMaterial, type AssignmentMaterial} from '../assignment-materials';

type StoredMaterial = AssignmentMaterial & {ownerUid: string; userUid: string; classId: string; path: string; status: string; assignmentId?: string; expiresAt: Timestamp; uploadUrl?: string; boardReferences?: number};
const quotaLimit = FEATURE_STORAGE_CEILING;
const json = (value: unknown, status = 200) => NextResponse.json(value, {status, headers: {'Cache-Control': 'private,no-store'}});
const uploadRef = (uploadId: string) => db().doc(`assignmentMaterials/${id(uploadId)}`);
const quotaRef = (uid: string) => db().doc(`assignmentStorage/${uid}`);
const publicMaterial = (value: StoredMaterial): AssignmentMaterial => ({id: value.id, fileName: value.fileName, contentType: value.contentType, size: value.size});
async function managed(ctx: Context, classId: string) {
  const cls = await db().doc(`classes/${id(classId)}`).get();
  if (!cls.exists || !canManageClass(ctx.role, ctx.uid, cls.data()?.ownerUid)) throw new ApiError(403, '이 학급에 자료를 올릴 권한이 없어요.', 'FORBIDDEN');
}
function owned(ctx: Context, value?: StoredMaterial): asserts value is StoredMaterial {
  if (!value || value.ownerUid !== ctx.uid) throw new ApiError(404, '참고 자료를 찾을 수 없어요.', 'NOT_FOUND');
}
async function removeStaged(ctx: Context, uploadId: string, expiredOnly = false) {
  const ref = uploadRef(uploadId);
  const value = await db().runTransaction(async tx => {
    const doc = await tx.get(ref), value = doc.data() as StoredMaterial | undefined;
    if (!doc.exists) return null;
    owned(ctx, value);
    if (value.status === 'admin-quarantined' || (value as StoredMaterial & {adminRestoreJobId?: string}).adminRestoreJobId) {if (expiredOnly) return null; throw new ApiError(409, '관리자가 격리·복원 중인 자료예요. 운영 작업을 먼저 확인해 주세요.', 'MATERIAL_QUARANTINED');}
    if (['attached','retained'].includes(value.status)) {if (expiredOnly) return null; throw new ApiError(409, '숙제나 참여보드에서 사용 중인 자료예요.', 'MATERIAL_IN_USE');}
    if (expiredOnly && value.expiresAt.toMillis() > Date.now()) return null;
    tx.update(ref, {status: 'cleanup'}); return value;
  });
  if (!value) return;
  // A cleanup claim prevents finalization or attachment while the exact staging file is removed.
  await cancelUploadTransfer(value.uploadUrl);
  const file = bucket().file(value.path);
  try {const [metadata] = await file.getMetadata(); await file.delete({ifGenerationMatch: metadata.generation});}
  catch (error) {if ((error as {code?: number}).code !== 404) throw error;}
  await db().runTransaction(async tx => {
    const [doc, quota] = await Promise.all([tx.get(ref), tx.get(quotaRef(ctx.uid))]);
    if (!doc.exists) return;
    if (doc.data()?.status !== 'cleanup') throw new ApiError(409, '자료 상태가 변경됐어요.');
    const reserved = quota.data()?.reservedBytes ?? 0;
    if (reserved < value.size) throw new Error('Assignment material quota mismatch');
    tx.update(quota.ref, {reservedBytes: reserved - value.size}); tx.delete(ref);
  });
}
async function cleanupExpired(ctx: Context) {
  const candidates = await db().collection('assignmentMaterials').where('ownerUid', '==', ctx.uid).where('expiresAt', '<=', Timestamp.now()).limit(20).get();
  for (const doc of candidates.docs) await removeStaged(ctx, doc.id, true);
}
export async function cleanupExpiredAssignmentMaterials() {
  const candidates=await db().collection('assignmentMaterials').where('expiresAt','<=',Timestamp.now()).limit(100).get();
  let cleaned=0;
  for(const doc of candidates.docs) {
    const value=doc.data();
    if(['attached','retained','admin-quarantined'].includes(value.status)||value.adminRestoreJobId)continue;
    try {await removeStaged({uid:value.ownerUid,role:'teacher',email:null,displayName:null},doc.id,true);cleaned++;}catch{console.error('Reference material cleanup deferred');}
  }
  return {cleaned,hasMore:candidates.size===100};
}

/** Called inside the assignment transaction. No client-supplied paths or URLs are accepted. */
export async function bindAssignmentMaterials(tx: Transaction, ctx: Context, classId: string, assignmentId: string, input: unknown, previous: AssignmentMaterial[] = []): Promise<AssignmentMaterial[]> {
  if (!Array.isArray(input) || input.length > ASSIGNMENT_MATERIAL_LIMIT || input.some(value => typeof value !== 'string') || new Set(input).size !== input.length) throw new ApiError(400, '참고 자료는 10개까지 선택해 주세요.', 'MATERIALS_INVALID');
  const ids = input.map(value => id(value));
  const refs = [...new Set([...ids, ...previous.map(value => value.id)])].map(uploadRef);
  const docs = refs.length ? await tx.getAll(...refs) : [];
  const byId = new Map(docs.map(doc => [doc.id, doc.data() as StoredMaterial | undefined]));
  const newValues = ids.map(uploadId => {
    const value = byId.get(uploadId); owned(ctx, value);
    const attachedHere = ['attached','retained'].includes(value.status) && value.assignmentId === assignmentId;
    if (value.classId !== classId || (!attachedHere && (value.status !== 'ready' || value.expiresAt.toMillis() <= Date.now()))) throw new ApiError(409, '전송을 마친 참고 자료를 다시 선택해 주세요.', 'MATERIAL_NOT_READY');
    return value;
  });
  for (const value of newValues) tx.update(uploadRef(value.id), {status: 'attached', assignmentId, expiresAt: Timestamp.fromMillis(253402300799000)});
  for (const value of previous) if (!ids.includes(value.id)) {
    const stored = byId.get(value.id);
    if (stored?.ownerUid === ctx.uid && stored.assignmentId === assignmentId && stored.status === 'attached') tx.update(uploadRef(value.id), {status: stored.boardReferences ? 'retained' : 'retired', expiresAt: Timestamp.fromMillis(stored.boardReferences ? 253402300799000 : Date.now() + 3600_000)});
  }
  return newValues.map(publicMaterial);
}
export async function signedAssignmentMaterials(materials: AssignmentMaterial[] = []): Promise<AssignmentMaterial[]> {
  return Promise.all(materials.map(async material => {
    const doc = await uploadRef(material.id).get(), value = doc.data() as StoredMaterial | undefined;
    if (!value || value.status !== 'attached') return {...material, url: undefined};
    const url = await stableReadUrl(value.path);
    return {...publicMaterial(value), url};
  }));
}
export async function handleAssignmentMaterials(request: Request, uploadId?: string) {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) assertOrigin(request);
    const ctx = await requireTeacher(request);
    if (uploadId && request.method === 'DELETE') {await removeStaged(ctx, uploadId); return json({removed: true});}
    const raw = await request.text(); if (raw.length > 5000) throw new ApiError(413, '입력 내용이 너무 길어요.');
    let input: Record<string, unknown>; try {input = JSON.parse(raw);} catch {throw new ApiError(400, '입력 내용을 확인해 주세요.');}
    if (!input || Array.isArray(input) || typeof input !== 'object') throw new ApiError(400, '입력 내용을 확인해 주세요.');
    if (!uploadId) {
      const classId = id(input.classId); await managed(ctx, classId);
      if (!validAssignmentMaterial(input.contentType, input.size)) throw new ApiError(400, '이미지는 25MB, 영상은 250MB 이하로 올려 주세요.', 'MATERIAL_FILE_INVALID');
      await cleanupExpired(ctx);
      const uploadId = randomUUID(), path = `assignment-materials/${ctx.uid}/${uploadId}/file`, ref = uploadRef(uploadId);
      const value = {id: uploadId, ownerUid: ctx.uid, userUid: ctx.uid, classId, path, status: 'pending', fileName: text(input.fileName, '파일 이름', 255), contentType: input.contentType as string, size: input.size as number, createdAt: new Date().toISOString(), expiresAt: Timestamp.fromMillis(Date.now() + 3600_000)};
      await assertTeacherStorage(ctx.uid, value.size);
      await db().runTransaction(async tx => {
        const quota = await tx.get(quotaRef(ctx.uid)), reserved = quota.data()?.reservedBytes ?? 0;
        if (reserved + value.size > quotaLimit) throw new ApiError(409, '자료 전송 대기 용량이 너무 커요. 잠시 뒤 다시 올려 주세요.', 'MATERIAL_QUOTA');
        tx.set(quota.ref, {reservedBytes: reserved + value.size}, {merge: true}); tx.create(ref, value);
      });
      try {const transfer=await createUploadTransfer(path,value.contentType,value.size,new URL(request.url).origin);await ref.update({uploadUrl:transfer.uploadUrl});return json({uploadId,path,...transfer},201);}catch(error){await removeStaged(ctx,uploadId);throw error;}
    }
    const doc = await uploadRef(uploadId).get(), value = doc.data() as StoredMaterial | undefined; owned(ctx, value); await managed(ctx, value.classId);
    if (value.status === 'ready') return json({material: publicMaterial(value)});
    if (value.status !== 'pending' || value.expiresAt.toMillis() <= Date.now()) throw new ApiError(409, '자료를 다시 올려 주세요.', 'MATERIAL_EXPIRED');
    const file = bucket().file(value.path);
    const [metadata] = await file.getMetadata().catch(() => {throw new ApiError(409, '아직 전송 중이에요.', 'UPLOAD_INCOMPLETE');});
    await file.setMetadata({cacheControl: FILE_CACHE_CONTROL, metadata: {firebaseStorageDownloadTokens: null}});
    if (Number(metadata.size) !== value.size || metadata.contentType !== value.contentType) throw new ApiError(400, '파일 정보가 달라요.', 'UPLOAD_MISMATCH');
    if (value.contentType.startsWith('image/')) {
      try {const [bytes] = await file.download(); const info = await sharp(bytes, {limitInputPixels: 40_000_000}).metadata(); if (!info.width || !info.height || !['jpeg', 'png', 'webp'].includes(info.format || '')) throw new Error();}
      catch {throw new ApiError(400, '사진을 읽을 수 없어요. JPG·PNG·WebP 사진을 골라 주세요.', 'MATERIAL_FILE_INVALID');}
    } else {
      const [header] = await file.download({start: 0, end: 63});
      const valid = value.contentType === 'video/webm' ? header.subarray(0, 4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])) : ['ftyp', 'moov', 'mdat', 'wide', 'free'].includes(header.toString('ascii', 4, 8));
      if (!valid) throw new ApiError(400, '영상 파일을 읽을 수 없어요.', 'MATERIAL_FILE_INVALID');
    }
    await db().runTransaction(async tx => {const fresh = await tx.get(doc.ref); if (fresh.data()?.status !== 'pending' || fresh.data()?.expiresAt.toMillis() <= Date.now()) throw new ApiError(409, '자료 상태가 변경됐어요.'); tx.update(doc.ref, {status:'ready'});tx.set(db().doc(`uploadTransferStats/material_${doc.id}`),{ownerUid:ctx.uid,bytes:value.size,month:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(new Date()),createdAt:new Date().toISOString(),source:'materials'});});
    return json({material: publicMaterial(value)});
  } catch (error) {
    if (error instanceof ApiError) return json({error: error.message, code: error.code}, error.status);
    console.error('Assignment material operation failed', (error as {code?: string}).code || 'INTERNAL');
    return json({error: '자료를 처리하지 못했어요. 다시 시도해 주세요.', code: 'MATERIAL_FAILED'}, 500);
  }
}
