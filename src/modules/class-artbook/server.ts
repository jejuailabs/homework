import 'server-only';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { bucket, db } from '@/lib/server/admin';
import { ApiError, id } from '@/lib/server/policy';
import { renderArtbook } from '../digital-artbook/pdf';
import type { BookSnapshot as StudentSnapshot } from '../digital-artbook/types';
import { gather, hash, staleReasons, type BookHost } from './source';
import { bookOptions, bookSelection, fileName, planOutputs, sections, whoLabel } from './policy';
import { renderClassBook, type ClassBook } from './pdf';
import { centralDirectory, crc32, dosStamp, entryEnd, localHeader, type ZipEntryMeta } from './zip';
import { CLASS_BOOK_LIMIT, JOB_LIMIT, RETENTION_DAYS, type BookJob, type BookMode, type BookSnapshot } from './types';

/**
 * Jobs for 우리 반 작품집. Own collections (classArtbooks, classArtbookOwners) and an own Storage
 * prefix (class-artbooks/). Each request does one short unit of work and the browser asks for
 * the next, so a large class never runs into the request time limit.
 */
type Phase = 'assets' | 'render' | 'pack';
type StoredJob = {
  ownerUid: string; classId: string; className: string; title: string; mode: BookMode; requestHash: string;
  total: number; outputs: number; phase: Phase; status: 'working' | 'ready' | 'failed' | 'deleting';
  completed: number; rendered: number; packed: number;
  skipped: {index: number; title: string; reason: string}[];
  files: {output: number; name: string; size: number}[]; zip: ZipEntryMeta[];
  fileName: string; size: number; lease: string; leaseUntil: number; error: string; createdAt: string; expiresAt: string;
};
const STEP_BUDGET = 35_000, IMAGES_PER_STEP = 6;
const jobRef = (job: string) => db().doc('classArtbooks/' + id(job));
const ownerRef = (uid: string) => db().doc('classArtbookOwners/' + uid);
const root = (uid: string, job: string) => `class-artbooks/${uid}/${job}/`;
const privately = {resumable: false, metadata: {cacheControl: 'private,no-store'}} as const;
const publicJob = (jobId: string, j: StoredJob): BookJob => ({
  id: jobId, title: j.title, mode: j.mode, createdAt: j.createdAt, expiresAt: j.expiresAt,
  status: j.status === 'working' ? j.phase : j.status, completed: j.completed, total: j.total, rendered: j.rendered, outputs: j.outputs, packed: j.packed,
  skipped: j.skipped.map(s => ({title: s.title, reason: s.reason})), fileName: j.fileName, size: j.size, error: j.error, busy: j.leaseUntil > Date.now(),
});
async function load(host: BookHost, job: string) {
  const j = (await jobRef(job).get()).data() as StoredJob | undefined;
  if (!j || j.ownerUid !== host.ctx.uid || j.classId !== host.classId) throw new ApiError(404, '작품집을 찾을 수 없어요.');
  return j;
}
async function readSnapshot(host: BookHost, job: string): Promise<BookSnapshot> {
  return JSON.parse((await bucket().file(root(host.ctx.uid, job) + 'snapshot.json').download())[0].toString('utf8'));
}
async function removeFiles(uid: string, job: string, folder = '') {
  await bucket().deleteFiles({prefix: root(uid, job) + folder, force: true});
}

/** Removes this teacher's books past their keeping period. Runs when the list opens; there is no scheduler. */
async function purgeExpired(uid: string) {
  const ids = ((await ownerRef(uid).get()).data()?.jobs || []) as string[];
  if (!ids.length) return;
  const docs = await db().getAll(...ids.map(jobRef)), now = Date.now(), gone: string[] = [];
  for (const doc of docs) {
    const j = doc.data() as StoredJob | undefined;
    if (!j) {gone.push(doc.id); continue;}
    if (j.ownerUid !== uid || j.leaseUntil > now || Date.parse(j.expiresAt) > now) continue;
    try {await removeFiles(uid, doc.id); await doc.ref.delete(); gone.push(doc.id);}
    catch (error) {console.error('[class-artbook:purge]', error instanceof Error ? error.message : 'unknown');}
  }
  if (gone.length) await db().runTransaction(async tx => {
    const owner = await tx.get(ownerRef(uid));
    tx.set(ownerRef(uid), {...owner.data(), jobs: ((owner.data()?.jobs || []) as string[]).filter(v => !gone.includes(v))});
  });
}

export async function listJobs(host: BookHost) {
  await purgeExpired(host.ctx.uid).catch(error => console.error('[class-artbook:purge]', error instanceof Error ? error.message : 'unknown'));
  const ids = ((await ownerRef(host.ctx.uid).get()).data()?.jobs || []) as string[];
  const docs = ids.length ? await db().getAll(...ids.map(jobRef)) : [];
  return {
    limit: JOB_LIMIT, keepDays: RETENTION_DAYS,
    jobs: docs.filter(s => s.exists && s.data()?.ownerUid === host.ctx.uid && s.data()?.classId === host.classId)
      .map(s => publicJob(s.id, s.data() as StoredJob)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}
export async function jobStatus(host: BookHost, job: string) {return {job: publicJob(job, await load(host, job))};}

export async function createJob(host: BookHost, input: Record<string, unknown>) {
  const job = id(input.requestId, '작업 번호'), selection = bookSelection(input.selection), options = bookOptions(input.options);
  const requestHash = hash(JSON.stringify({classId: host.classId, selection, options}));
  const existing = (await jobRef(job).get()).data() as StoredJob | undefined;
  if (existing) {
    if (existing.ownerUid !== host.ctx.uid || existing.requestHash !== requestHash || existing.classId !== host.classId) throw new ApiError(409, '새 작업으로 다시 시도해 주세요.');
    return {job: publicJob(job, existing)};
  }
  const gathered = await gather(host, selection, options);
  if (!gathered.length) throw new ApiError(400, '고른 전시와 기간에 맞는 승인 작품이 없어요. 전시나 학생을 다시 골라 주세요.');
  if (gathered.length > CLASS_BOOK_LIMIT) throw new ApiError(413, `작품이 ${gathered.length}점이에요. 한 번에 ${CLASS_BOOK_LIMIT}점까지 만들 수 있어요. 전시나 기간을 나누어 주세요.`);
  const items = gathered.map(({thumbnailPath: _thumbnail, ...item}) => item), outputs = planOutputs(items, options);
  if (!outputs.length) throw new ApiError(400, '학생과 연결된 승인 작품이 없어요. 작품 정보에서 학생을 지정하거나 반 전체 한 권을 골라 주세요.');
  const createdAt = new Date().toISOString(), expiresAt = new Date(Date.now() + RETENTION_DAYS * 86_400_000).toISOString();
  const snapshot: BookSnapshot = {schema: 1, classId: host.classId, className: host.className, from: selection.from, to: selection.to, createdAt, options, items, outputs};
  await bucket().file(root(host.ctx.uid, job) + 'snapshot.json').save(JSON.stringify(snapshot), {...privately, metadata: {...privately.metadata, contentType: 'application/json'}});
  try {
    await db().runTransaction(async tx => {
      const [old, owner] = await Promise.all([tx.get(jobRef(job)), tx.get(ownerRef(host.ctx.uid))]);
      if (old.exists) {
        if (old.data()?.ownerUid !== host.ctx.uid || old.data()?.requestHash !== requestHash) throw new ApiError(409, '작업 번호가 변경됐어요.');
        return;
      }
      const jobs = (owner.data()?.jobs || []) as string[];
      if (jobs.length >= JOB_LIMIT) throw new ApiError(409, `작품집은 ${JOB_LIMIT}개까지 보관해요. 받은 작품집을 지운 뒤 다시 만들어 주세요.`);
      tx.set(ownerRef(host.ctx.uid), {...owner.data(), jobs: [...jobs, job]});
      const stored: StoredJob = {
        ownerUid: host.ctx.uid, classId: host.classId, className: host.className, title: options.title, mode: options.mode, requestHash,
        total: items.length, outputs: outputs.length, phase: 'assets', status: 'working', completed: 0, rendered: 0, packed: 0,
        skipped: [], files: [], zip: [], fileName: '', size: 0, lease: '', leaseUntil: 0, error: '', createdAt, expiresAt,
      };
      tx.create(jobRef(job), stored);
    });
  } catch (error) {
    if (!(await jobRef(job).get()).exists) await removeFiles(host.ctx.uid, job).catch(() => {});
    throw error;
  }
  return jobStatus(host, job);
}

async function acquire(host: BookHost, job: string, deleting = false) {
  const token = randomUUID();
  const value = await db().runTransaction(async tx => {
    const j = (await tx.get(jobRef(job))).data() as StoredJob | undefined;
    if (!j || j.ownerUid !== host.ctx.uid || j.classId !== host.classId) throw new ApiError(404, '작품집을 찾을 수 없어요.');
    if (j.leaseUntil > Date.now()) throw new ApiError(409, '이 작품집을 만드는 중이에요. 잠시 후 이어서 진행해 주세요.');
    if (!deleting && j.status === 'deleting') throw new ApiError(409, '지우는 중인 작품집이에요. 삭제를 다시 눌러 주세요.');
    if (!deleting && j.status === 'ready') return null;
    tx.update(jobRef(job), {lease: token, leaseUntil: Date.now() + 150_000, error: '', ...(deleting ? {status: 'deleting'} : {})});
    return j;
  });
  return {token, value};
}

/** The licensed Hangul font. The bundled copy is used when the build traced it; the public copy otherwise. */
async function fontBytes(origin: string) {
  try {return await readFile(path.join(process.cwd(), 'src/modules/digital-artbook/assets/NanumGothic-Regular.ttf'));}
  catch {
    const response = await fetch(origin + '/cards/v1/fonts/NanumGothic-Regular.ttf');
    if (!response.ok) throw new Error('작품집 글꼴을 불러오지 못했어요.');
    return new Uint8Array(await response.arrayBuffer());
  }
}
async function toJpeg(sourcePath: string) {
  const file = bucket().file(sourcePath), [metadata] = await file.getMetadata();
  if (Number(metadata.size) > 15 * 1024 * 1024) throw new Error('작품 이미지가 너무 커요.');
  const [source] = await file.download();
  let jpg = await sharp(source, {limitInputPixels: 40_000_000}).rotate().flatten({background: '#ffffff'}).resize({width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true}).jpeg({quality: 82}).toBuffer();
  if (jpg.length > 500_000) jpg = await sharp(jpg).resize({width: 1100, height: 1100, fit: 'inside', withoutEnlargement: true}).jpeg({quality: 65}).toBuffer();
  if (jpg.length > 500_000) throw new Error('이미지 크기를 줄이지 못했어요.');
  return jpg;
}
const periodLabel = (s: BookSnapshot) => `${s.from || '처음'} ~ ${s.to || '지금'}`;

function classBook(s: BookSnapshot, output: number, indexes: number[]): ClassBook {
  const o = s.options, plan = s.outputs[output];
  return {
    title: o.title, className: s.className, period: periodLabel(s), cover: o.cover, perPage: o.perPage, dedication: o.dedication, createdAt: s.createdAt,
    volumeLabel: plan.volumes > 1 ? `${plan.volume}권 / 전체 ${plan.volumes}권` : '',
    sections: sections(s.items, indexes, o).map(section => ({
      heading: section.heading, sub: section.sub,
      cells: section.indexes.map(i => {
        const item = s.items[i];
        return {
          image: i, title: item.title, story: o.story ? item.description : '', feedback: o.feedback ? item.feedback : '',
          meta: [o.order === 'student' ? '' : whoLabel(item, o.names), item.date, o.order === 'room' ? '' : item.roomTitle].filter(Boolean).join(' · '),
        };
      }),
    })),
  };
}
/** The single-student layout of the existing 학생별 아트북, fed from this module's snapshot. */
function studentBook(s: BookSnapshot, output: number, indexes: number[]): StudentSnapshot {
  const plan = s.outputs[output];
  return {
    schema: 1, classId: s.classId, studentId: plan.studentId, className: s.className, studentName: plan.displayName, from: s.from, to: s.to, createdAt: s.createdAt,
    options: {title: plan.volumes > 1 ? `${s.options.title} ${plan.volume}권` : s.options.title, displayName: plan.displayName, dedication: s.options.dedication, format: s.options.format === 'mobile' ? 'mobile' : 'a4', cover: s.options.cover, voiceQr: false},
    pages: indexes.map(i => {
      const item = s.items[i];
      return {key: item.key, roomId: item.roomId, artworkId: item.artworkId, title: item.title, description: item.description, date: item.date, roomTitle: item.roomTitle,
        sourcePath: item.sourcePath, sourceVersion: item.version, caption: '', captionVersion: '', voiceUrl: '', voiceRecordId: '', width: item.width, height: item.height};
    }),
  };
}
/** Joins the stored parts into the final archive. Falls back to a streamed copy where compose is unavailable. */
async function joinParts(names: string[], destination: string) {
  const target = bucket().file(destination);
  try {
    let list = names, round = 0;
    while (list.length > 32) {
      const merged = destination + '.join' + round++;
      await bucket().combine(list.slice(0, 32), merged);
      list = [merged, ...list.slice(32)];
    }
    await bucket().combine(list, target);
    await target.setMetadata({contentType: 'application/zip', cacheControl: 'private,no-store'});
  } catch (error) {
    console.error('[class-artbook:compose]', error instanceof Error ? error.message : 'unknown');
    const out = target.createWriteStream({resumable: true, metadata: {contentType: 'application/zip', cacheControl: 'private,no-store'}});
    const done = new Promise<void>((resolve, reject) => {out.on('finish', () => resolve()); out.on('error', reject);});
    for (const name of names) {
      const [bytes] = await bucket().file(name).download();
      if (!out.write(bytes)) await new Promise(resolve => out.once('drain', resolve));
    }
    out.end();
    await done;
  }
  return Number((await target.getMetadata())[0].size) || 0;
}

export async function stepJob(host: BookHost, job: string, origin: string) {
  const {token, value: j} = await acquire(host, job);
  if (!j) return jobStatus(host, job);
  const base = root(host.ctx.uid, job), started = Date.now(), within = () => Date.now() - started < STEP_BUDGET;
  try {
    const snapshot = await readSnapshot(host, job);
    let {phase, completed, rendered, packed, fileName: finalName, size} = j;
    const skipped = [...j.skipped], files = [...j.files], zip = [...j.zip];
    let status: StoredJob['status'] = 'working';
    if (phase === 'assets') {
      const end = Math.min(completed + IMAGES_PER_STEP, snapshot.items.length), batch = snapshot.items.slice(completed, end);
      const reasons = await staleReasons(host, batch);
      for (let n = 0; n < batch.length; n++) {
        const index = completed + n, item = batch[n];
        let reason = reasons[n];
        if (!reason) {
          try {await bucket().file(`${base}img/${index}.jpg`).save(await toJpeg(item.sourcePath), {...privately, metadata: {...privately.metadata, contentType: 'image/jpeg'}});}
          catch (error) {console.error('[class-artbook:image]', error instanceof Error ? error.message : 'unknown'); reason = '이미지를 준비하지 못했어요.';}
        }
        if (reason) skipped.push({index, title: item.title, reason});
      }
      completed = end;
      if (completed === snapshot.items.length) {
        if (skipped.length === snapshot.items.length) throw new ApiError(409, '담을 수 있는 작품이 없어요. 전시의 승인 상태를 확인한 뒤 새로 만들어 주세요.');
        phase = 'render';
      }
    } else if (phase === 'render') {
      const font = await fontBytes(origin), out = new Set(skipped.map(s => s.index));
      const image = async (i: number) => (await bucket().file(`${base}img/${i}.jpg`).download())[0];
      do {
        const plan = snapshot.outputs[rendered], indexes = plan.indexes.filter(i => !out.has(i));
        if (indexes.length) {
          const pdf = plan.kind === 'class'
            ? await renderClassBook(classBook(snapshot, rendered, indexes), font, image)
            : await renderArtbook(studentBook(snapshot, rendered, indexes), font, async page => image(indexes[page]));
          await bucket().file(`${base}out/${rendered}.pdf`).save(Buffer.from(pdf), {...privately, metadata: {...privately.metadata, contentType: 'application/pdf'}});
          files.push({output: rendered, name: plan.file, size: pdf.length});
        }
        rendered++;
      } while (rendered < snapshot.outputs.length && within());
      if (rendered === snapshot.outputs.length) {
        if (files.length === 1) {
          await bucket().file(`${base}out/${files[0].output}.pdf`).copy(bucket().file(base + 'final.pdf'));
          finalName = files[0].name; size = files[0].size; status = 'ready';
        } else phase = 'pack';
      }
    } else {
      const stamp = dosStamp(new Date(snapshot.createdAt));
      while (packed < files.length && within()) {
        const file = files[packed], [pdf] = await bucket().file(`${base}out/${file.output}.pdf`).download();
        const entry: ZipEntryMeta = {name: file.name, crc: crc32(pdf), size: pdf.length, offset: zip.length ? entryEnd(zip.at(-1)!) : 0, ...stamp};
        await bucket().file(`${base}zip/${packed}.part`).save(Buffer.concat([localHeader(entry), pdf]), privately);
        zip.push(entry); packed++;
      }
      if (packed === files.length) {
        await bucket().file(base + 'zip/directory.part').save(Buffer.from(centralDirectory(zip, entryEnd(zip.at(-1)!))), privately);
        size = await joinParts([...zip.map((_, n) => `${base}zip/${n}.part`), base + 'zip/directory.part'], base + 'final.zip');
        finalName = fileName(snapshot.options.title, '우리 반 작품집') + '.zip'; status = 'ready';
      }
    }
    await db().runTransaction(async tx => {
      const fresh = await tx.get(jobRef(job));
      if (fresh.data()?.lease !== token) throw new Error('작업 시간이 지났어요. 이어서 다시 진행해 주세요.');
      tx.update(jobRef(job), {phase, status, completed, rendered, packed, skipped, files, zip, fileName: finalName, size, error: '', lease: '', leaseUntil: 0});
    });
    // Only the finished file and the snapshot are kept.
    if (status === 'ready') await Promise.all(['img/', 'out/', 'zip/'].map(folder => removeFiles(host.ctx.uid, job, folder))).catch(error => console.error('[class-artbook:cleanup]', error instanceof Error ? error.message : 'unknown'));
  } catch (error) {
    console.error('[class-artbook:step]', error instanceof Error ? error.message : 'unknown');
    const message = error instanceof ApiError ? error.message : '작품집을 끝까지 만들지 못했어요. "이어서 만들기"를 눌러 주세요.';
    await db().runTransaction(async tx => {
      const fresh = await tx.get(jobRef(job));
      if (fresh.data()?.lease === token) tx.update(jobRef(job), {status: 'failed', lease: '', leaseUntil: 0, error: message});
    });
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, message);
  }
  return jobStatus(host, job);
}

/** A short-lived link straight to Storage, so a large file never passes through the app server. */
export async function downloadLink(host: BookHost, job: string) {
  const j = await load(host, job);
  if (j.status !== 'ready') throw new ApiError(409, '작품집을 먼저 끝까지 만들어 주세요.');
  if (Date.parse(j.expiresAt) <= Date.now()) throw new ApiError(410, '보관 기간이 지난 작품집이에요. 새로 만들어 주세요.');
  const snapshot = await readSnapshot(host, job), out = new Set(j.skipped.map(s => s.index)), printed = snapshot.items.filter((_, i) => !out.has(i));
  for (let i = 0; i < printed.length; i += 100)
    if ((await staleReasons(host, printed.slice(i, i + 100))).some(Boolean)) throw new ApiError(409, '작품의 승인이나 학생 연결이 바뀌었어요. 작품집을 새로 만들어 주세요.');
  const zipped = j.fileName.endsWith('.zip');
  const [url] = await bucket().file(root(host.ctx.uid, job) + (zipped ? 'final.zip' : 'final.pdf')).getSignedUrl({
    version: 'v4', action: 'read', expires: Date.now() + 10 * 60_000,
    responseDisposition: `attachment; filename="${zipped ? 'artbook.zip' : 'artbook.pdf'}"; filename*=UTF-8''${encodeURIComponent(j.fileName)}`,
  });
  return {url, fileName: j.fileName, size: j.size};
}

export async function deleteJob(host: BookHost, job: string) {
  const {token} = await acquire(host, job, true);
  try {
    await removeFiles(host.ctx.uid, job);
    await db().runTransaction(async tx => {
      const [fresh, owner] = await Promise.all([tx.get(jobRef(job)), tx.get(ownerRef(host.ctx.uid))]);
      if (fresh.data()?.lease !== token) throw new ApiError(409, '삭제를 다시 시도해 주세요.');
      tx.set(ownerRef(host.ctx.uid), {...owner.data(), jobs: ((owner.data()?.jobs || []) as string[]).filter(v => v !== job)});
      tx.delete(jobRef(job));
    });
  } catch (error) {
    await db().runTransaction(async tx => {const s = await tx.get(jobRef(job)); if (s.data()?.lease === token) tx.update(jobRef(job), {lease: '', leaseUntil: 0, error: '삭제를 끝내지 못했어요. 삭제를 다시 눌러 주세요.'});});
    throw error;
  }
  return {deleted: true};
}
