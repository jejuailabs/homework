import 'server-only';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { bucket, db } from '@/lib/server/admin';
import { ApiError, id } from '@/lib/server/policy';
import { hash, snapshot, validateSnapshot, type BookHost } from './exhibition-source';
import type { BookJob, BookSnapshot } from './types';

const RESERVATION = 64 * 1024 * 1024, OWNER_LIMIT = 256 * 1024 * 1024;
type StoredJob = {ownerUid: string; snapshot: BookSnapshot; requestHash: string; completed: number; bytes: number; size: number; status: BookJob['status']; lease: string; leaseUntil: number; error: string; createdAt: string};
const jobRef = (job: string) => db().doc('moduleArtbooks/' + id(job));
const ownerRef = (uid: string) => db().doc('moduleArtbookOwners/' + uid);
const prefix = (uid: string, job: string) => `module-artbooks/${uid}/${job}/`;
const publicJob = (id: string, j: StoredJob): BookJob => ({id, title: j.snapshot.options.title, displayName: j.snapshot.options.displayName, status: j.status, completed: j.completed, total: j.snapshot.pages.length, error: j.error, createdAt: j.createdAt, busy: j.leaseUntil > Date.now(), size: j.size});
async function load(host: BookHost, job: string) {
  const doc = await jobRef(job).get(), j = doc.data() as StoredJob | undefined;
  if (!j || j.ownerUid !== host.ctx.uid || j.snapshot.classId !== host.classId) throw new ApiError(404, '아트북을 찾을 수 없어요.');
  return j;
}
export async function listBooks(host: BookHost) {
  const owner = (await ownerRef(host.ctx.uid).get()).data(), ids = (owner?.jobs || []) as string[];
  const docs = ids.length ? await db().getAll(...ids.map(jobRef)) : [];
  return {jobs: docs.filter(s => s.exists && s.data()?.snapshot.classId === host.classId && s.data()?.ownerUid === host.ctx.uid).map(s => publicJob(s.id, s.data() as StoredJob)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), storage: {usedBytes: owner?.usedBytes || 0, reservedBytes: owner?.reservedBytes || 0, limitBytes: OWNER_LIMIT}};
}
export async function bookStatus(host: BookHost, job: string) {return {job: publicJob(job, await load(host, job))};}
export async function createBook(host: BookHost, input: Record<string, any>, origin: string) {
  const job = id(input.requestId), requestHash = hash(JSON.stringify({studentId: input.studentId, keys: input.keys, from: input.from, to: input.to, options: input.options}));
  const existing = (await jobRef(job).get()).data() as StoredJob | undefined;
  if (existing) {
    if (existing.ownerUid !== host.ctx.uid || existing.requestHash !== requestHash || existing.snapshot.classId !== host.classId) throw new ApiError(409, '새 작업으로 다시 시도해 주세요.');
    return {job: publicJob(job, existing)};
  }
  const data = await snapshot(host, input, origin);
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 800_000) throw new ApiError(413, '작품 설명과 캡션이 많아요. 두 권으로 나누어 만들어 주세요.');
  await db().runTransaction(async tx => {
    const [old, owner] = await Promise.all([tx.get(jobRef(job)), tx.get(ownerRef(host.ctx.uid))]);
    if (old.exists) {
      if (old.data()?.ownerUid !== host.ctx.uid || old.data()?.requestHash !== requestHash) throw new ApiError(409, '작업 번호가 변경됐어요.');
      return;
    }
    const o = owner.data() || {}, jobs = o.jobs || [];
    if (jobs.length >= 20 || (o.usedBytes || 0) + (o.reservedBytes || 0) + RESERVATION > OWNER_LIMIT) throw new ApiError(409, '저장한 아트북을 다운로드한 뒤 불필요한 아트북을 삭제해 주세요. 교사별 20권·256MB까지 보관해요.');
    tx.set(ownerRef(host.ctx.uid), {...o, jobs: [...jobs, job], usedBytes: o.usedBytes || 0, reservedBytes: (o.reservedBytes || 0) + RESERVATION});
    tx.create(jobRef(job), {ownerUid: host.ctx.uid, snapshot: data, requestHash, completed: 0, bytes: 0, size: 0, status: 'assets', lease: '', leaseUntil: 0, error: '', createdAt: data.createdAt});
  });
  return bookStatus(host, job);
}
async function acquire(host: BookHost, job: string, deleting = false) {
  const token = randomUUID();
  const value = await db().runTransaction(async tx => {
    const doc = await tx.get(jobRef(job)), j = doc.data() as StoredJob | undefined;
    if (!j || j.ownerUid !== host.ctx.uid || j.snapshot.classId !== host.classId) throw new ApiError(404, '아트북을 찾을 수 없어요.');
    if (j.leaseUntil > Date.now()) throw new ApiError(409, '이 아트북을 처리 중이에요. 잠시 후 이어서 진행해 주세요.');
    if (!deleting && j.status === 'deleting') throw new ApiError(409, '삭제 중인 아트북이에요. 삭제를 다시 눌러 주세요.');
    if (!deleting && j.status === 'ready') return null;
    tx.update(jobRef(job), {lease: token, leaseUntil: Date.now() + 150_000, error: '', ...(deleting ? {status: 'deleting'} : {})});
    return j;
  });
  return {token, value};
}
export async function stepBook(host: BookHost, job: string) {
  const {token, value: j} = await acquire(host, job);
  if (!j) return bookStatus(host, job);
  try {
    await validateSnapshot(host, j.snapshot);
    const root = prefix(host.ctx.uid, job);
    let completed = j.completed, bytes = j.bytes, size = 0, status: BookJob['status'] = 'assets';
    if (completed < j.snapshot.pages.length) {
      for (let index = completed; index < Math.min(j.completed + 5, j.snapshot.pages.length); index++) {
        const work = j.snapshot.pages[index], file = bucket().file(work.sourcePath), [metadata] = await file.getMetadata();
        if (Number(metadata.size) > 15 * 1024 * 1024) throw new Error('작품 이미지가 너무 커요.');
        const [source] = await file.download();
        let jpg = await sharp(source, {limitInputPixels: 40_000_000}).rotate().flatten({background: '#ffffff'}).resize({width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true}).jpeg({quality: 82}).toBuffer();
        if (jpg.length > 500_000) jpg = await sharp(jpg).resize({width: 1100, height: 1100, fit: 'inside', withoutEnlargement: true}).jpeg({quality: 65}).toBuffer();
        if (jpg.length > 500_000) throw new Error('이미지 크기를 줄인 뒤 다시 시도해 주세요.');
        await bucket().file(root + index + '.jpg').save(jpg, {resumable: false, metadata: {contentType: 'image/jpeg', cacheControl: 'private,no-store', metadata: {sourceHash: hash(source), snapshotVersion: work.sourceVersion}}});
        bytes += jpg.length; completed++;
      }
      status = completed === j.snapshot.pages.length ? 'render' : 'assets';
    } else {
      const {renderArtbook} = await import('./pdf');
      const font = await readFile(path.join(process.cwd(), 'src/modules/digital-artbook/assets/NanumGothic-Regular.ttf'));
      const pdf = await renderArtbook(j.snapshot, font, async i => (await bucket().file(root + i + '.jpg').download())[0]);
      if (bytes + pdf.length > RESERVATION) throw new Error('화집 파일이 너무 커요. 작품 수를 줄여 주세요.');
      await bucket().file(root + 'artbook.pdf').save(Buffer.from(pdf), {resumable: false, metadata: {contentType: 'application/pdf', cacheControl: 'private,no-store'}});
      size = pdf.length; bytes += size; status = 'ready';
    }
    await db().runTransaction(async tx => {
      const [fresh, owner] = await Promise.all([tx.get(jobRef(job)), tx.get(ownerRef(host.ctx.uid))]);
      if (fresh.data()?.lease !== token) throw new Error('작업 시간이 지났어요. 이어서 다시 진행해 주세요.');
      tx.update(jobRef(job), {completed, bytes, size, status, error: '', lease: '', leaseUntil: 0});
      if (status === 'ready') tx.update(ownerRef(host.ctx.uid), {usedBytes: (owner.data()?.usedBytes || 0) + bytes, reservedBytes: Math.max(0, (owner.data()?.reservedBytes || 0) - RESERVATION)});
    });
  } catch (error) {
    console.error('[artbook:step]', error instanceof Error ? error.message : 'Unknown export error');
    await db().runTransaction(async tx => {
      const fresh = await tx.get(jobRef(job));
      if (fresh.data()?.lease === token) tx.update(jobRef(job), {status: 'failed', lease: '', leaseUntil: 0, error: error instanceof ApiError ? error.message : 'PDF 작업을 완료하지 못했어요. 이어서 시도하거나 작품 수를 줄여 주세요.'});
    });
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'PDF 작업을 완료하지 못했어요. 이어서 다시 시도해 주세요.');
  }
  return bookStatus(host, job);
}
export async function downloadBook(host: BookHost, job: string) {
  const j = await load(host, job);
  if (j.status !== 'ready') throw new ApiError(409, 'PDF 생성을 먼저 완료해 주세요.');
  await validateSnapshot(host, j.snapshot);
  return {bytes: (await bucket().file(prefix(host.ctx.uid, job) + 'artbook.pdf').download())[0], filename: j.snapshot.options.displayName + '-디지털아트북.pdf'};
}
export async function deleteBook(host: BookHost, job: string) {
  const {token, value: j} = await acquire(host, job, true);
  if (!j) return {deleted: true};
  try {
    const root = prefix(host.ctx.uid, job), names = [...j.snapshot.pages.map((_, i) => i + '.jpg'), 'artbook.pdf'];
    for (let i = 0; i < names.length; i += 8) await Promise.all(names.slice(i, i + 8).map(n => bucket().file(root + n).delete({ignoreNotFound: true})));
    await db().runTransaction(async tx => {
      const [fresh, owner] = await Promise.all([tx.get(jobRef(job)), tx.get(ownerRef(host.ctx.uid))]);
      if (fresh.data()?.lease !== token) throw new ApiError(409, '삭제 작업을 다시 시도해 주세요.');
      // A deleting retry retains the original accounting state via size, not status.
      const ready = j.size > 0, o = owner.data() || {};
      tx.set(ownerRef(host.ctx.uid), {...o, jobs: (o.jobs || []).filter((v: string) => v !== job), usedBytes: Math.max(0, (o.usedBytes || 0) - (ready ? j.bytes : 0)), reservedBytes: Math.max(0, (o.reservedBytes || 0) - (ready ? 0 : RESERVATION))});
      tx.delete(jobRef(job));
    });
  } catch (e) {
    await db().runTransaction(async tx => {const s = await tx.get(jobRef(job)); if (s.data()?.lease === token) tx.update(jobRef(job), {lease: '', leaseUntil: 0, error: '삭제를 완료하지 못했어요. 삭제를 다시 눌러 주세요.'});});
    throw e;
  }
  return {deleted: true};
}
