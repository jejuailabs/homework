import 'server-only';
import {randomUUID} from 'node:crypto';
import {bucket, cloudAccessToken, db} from './admin';
import {ApiError} from './policy';
import {stableReadUrl} from './signed-urls';
import {videoConfig} from './video-submissions';
import {EXPORT_KEEP_DAYS, safeSegment, splitExportParts, type ExportFile} from '../storage-export';
import {extensionOf, friendlyFileName} from '../file-naming';

type Data = FirebaseFirestore.DocumentData;
const exportRef = (exportId: string) => db().doc(`storageExports/${exportId}`);
const now = () => new Date().toISOString();

async function homeworkFiles(uid: string): Promise<ExportFile[]> {
  const classes = await db().collection('classes').where('ownerUid', '==', uid).get();
  const perClass = await Promise.all(classes.docs.map(async cls => {
    const [uploads, students] = await Promise.all([db().collection('uploads').where('classId', '==', cls.id).where('status', '==', 'submitted').get(), cls.ref.collection('students').get()]);
    const pupils = new Map(students.docs.map(doc => [doc.id, doc.data()]));
    const assignmentIds = [...new Set(uploads.docs.map(doc => String(doc.data().assignmentId)))];
    const assignments = new Map((assignmentIds.length ? await db().getAll(...assignmentIds.map(item => db().doc(`assignments/${item}`))) : []).map(doc => [doc.id, doc.data()]));
    const counts = new Map<string, number>();
    return uploads.docs.map(doc => {
      const value = doc.data(), pupil = pupils.get(value.studentId), key = `${value.assignmentId}:${value.studentId}`, index = (counts.get(key) ?? 0) + 1;
      counts.set(key, index);
      const title = assignments.get(value.assignmentId)?.title, number = pupil ? `${String(pupil.number ?? '').padStart(2, '0')}_` : '';
      // 03_심지후_레코더영상학교종이땡.mp4, then _2, _3 for the same student's other files.
      return {paths: [value.path], size: Number(value.storedBytes ?? value.size ?? 0), name: `숙제/${safeSegment(cls.data().name, '학급')}/${safeSegment(title, '과제')}/${number}${friendlyFileName(pupil?.name, title, extensionOf(value.fileName, value.contentType), index, '숙제')}`};
    });
  }));
  return perClass.flat();
}

async function materialFiles(uid: string): Promise<ExportFile[]> {
  const [materials, classes] = await Promise.all([db().collection('assignmentMaterials').where('ownerUid', '==', uid).get(), db().collection('classes').where('ownerUid', '==', uid).get()]);
  const names = new Map(classes.docs.map(doc => [doc.id, doc.data().name]));
  return materials.docs.filter(doc => !['pending', 'cleanup'].includes(doc.data().status)).map(doc => {const value = doc.data(); return {paths: [value.path], size: Number(value.size || 0), name: `수업자료/${safeSegment(names.get(value.classId), '학급')}/${safeSegment(value.fileName, '자료')}`};});
}

async function galleryFiles(uid: string): Promise<ExportFile[]> {
  const exhibitions = await db().collection('exhibitions').where('ownerUid', '==', uid).get();
  const perRoom = await Promise.all(exhibitions.docs.map(async room => {const counts = new Map<string, number>(); return (await room.ref.collection('artworks').get()).docs.map(doc => {
    const art = doc.data(), fileId = art.uploadId || String(art.displayPath || '').split('/')[2];
    // Prefer the untouched original; the 2000px display copy is the fallback.
    const paths = [art.uploaderUid && fileId ? `exhibition-uploads/${art.uploaderUid}/${fileId}/original` : '', art.displayPath].filter(Boolean);
    const number = art.studentNumber ? `${String(art.studentNumber).padStart(2, '0')}_` : '', person = art.studentName || art.artistName || '선생님', index = (counts.get(person) ?? 0) + 1;
    counts.set(person, index);
    return {paths, size: Number(art.storedBytes || 0), appendExtension: true, name: `전시실/${safeSegment(room.data().title, '전시실')}/${number}${friendlyFileName(person, room.data().title, '', index, '전시')}`};
  });}));
  return perRoom.flat().filter(file => file.paths.length);
}

async function boardFiles(uid: string): Promise<ExportFile[]> {
  const boards = await db().collection('participationBoards').where('ownerUid', '==', uid).get();
  const perBoard = await Promise.all(boards.docs.map(async board => (await board.ref.collection('uploads').where('status', '==', 'ready').get()).docs
    .map(doc => {const value = doc.data(); return {paths: [value.path], size: Number(value.actualBytes ?? value.size ?? 0), name: `게시판/${safeSegment(board.data().title, '게시판')}/${safeSegment(value.name, '파일')}`};})));
  return perBoard.flat().filter(file => file.paths[0]);
}

async function dispatchPart(exportId: string, part: number) {
  const config = await videoConfig();
  if (!config) throw new ApiError(503, '내려받기 서버를 준비하고 있어요. 잠시 뒤 다시 시도해 주세요.', 'EXPORT_NOT_CONFIGURED');
  const parent = `projects/${config.projectId}/locations/${config.location}/queues/${config.queue}`, payload = {exportId, part};
  const response = await fetch(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {method: 'POST', headers: {Authorization: `Bearer ${await cloudAccessToken()}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({task: {name: `${parent}/tasks/export-${exportId}-${part}`, dispatchDeadline: '1800s', httpRequest: {httpMethod: 'POST', url: config.workerUrl + '/export-part', headers: {'Content-Type': 'application/json'}, body: Buffer.from(JSON.stringify(payload)).toString('base64'), oidcToken: {serviceAccountEmail: config.invokerServiceAccount, audience: config.workerUrl}}}}), signal: AbortSignal.timeout(15000)});
  if (!response.ok && response.status !== 409) throw new ApiError(503, '내려받기 준비를 시작하지 못했어요. 다시 시도해 주세요.', 'EXPORT_DISPATCH');
}

async function view(snapshot: FirebaseFirestore.DocumentSnapshot) {
  const value = snapshot.data()!, parts = await snapshot.ref.collection('parts').orderBy('index').get();
  const rows = await Promise.all(parts.docs.map(async doc => {
    const part = doc.data(), ready = part.status === 'complete' && part.zipPath;
    return {index: part.index, status: part.status, fileCount: part.fileCount, bytes: part.zipSize ?? part.bytes,
      ...(ready ? {url: await stableReadUrl(part.zipPath, {responseDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(`우리반자료_${part.index + 1}.zip`)}`})} : {})};
  }));
  const status = rows.every(row => row.status === 'complete') ? 'complete' : rows.some(row => row.status === 'failed') ? 'failed' : 'processing';
  return {id: snapshot.id, status, createdAt: value.createdAt, expiresAt: value.expiresAt, fileCount: value.fileCount, bytes: value.bytes, parts: rows};
}

export async function latestStorageExport(uid: string) {
  // A teacher has at most a few exports a week; sorting here avoids a composite index.
  const exports = await db().collection('storageExports').where('ownerUid', '==', uid).get();
  const doc = exports.docs.sort((a, b) => String(b.data().createdAt).localeCompare(String(a.data().createdAt)))[0];
  return doc && Date.parse(doc.data().expiresAt) > Date.now() ? view(doc) : null;
}

/** One export at a time; a finished one stays downloadable for a week. */
export async function startStorageExport(uid: string) {
  const current = await latestStorageExport(uid);
  if (current && current.status !== 'failed') return current;
  const files = (await Promise.all([homeworkFiles(uid), materialFiles(uid), galleryFiles(uid), boardFiles(uid)])).flat();
  if (!files.length) throw new ApiError(404, '아직 내려받을 자료가 없어요.', 'EXPORT_EMPTY');
  const parts = splitExportParts(files), exportId = randomUUID(), created = now();
  const ref = exportRef(exportId), batch = db().batch();
  batch.create(ref, {ownerUid: uid, createdAt: created, expiresAt: new Date(Date.now() + EXPORT_KEEP_DAYS * 86_400_000).toISOString(), fileCount: files.length, bytes: files.reduce((total, file) => total + file.size, 0), partCount: parts.length});
  parts.forEach((part, index) => batch.create(ref.collection('parts').doc(String(index)), {index, status: 'queued', files: part, fileCount: part.length, bytes: part.reduce((total, file) => total + file.size, 0), createdAt: created}));
  await batch.commit();
  await Promise.all(parts.map((_, index) => dispatchPart(exportId, index)));
  return view(await ref.get());
}

/** Daily: archives are a convenience copy, removed a week after they were prepared. */
export async function cleanupStorageExports() {
  const expired = await db().collection('storageExports').where('expiresAt', '<=', now()).limit(20).get();
  let removed = 0;
  for (const doc of expired.docs) {
    try {
      await bucket().deleteFiles({prefix: `exports/${doc.data().ownerUid}/${doc.id}/`});
      const parts = await doc.ref.collection('parts').get(), batch = db().batch();
      parts.docs.forEach(part => batch.delete(part.ref)); batch.delete(doc.ref); await batch.commit(); removed++;
    } catch {console.error('Storage export cleanup deferred');}
  }
  return {removed, hasMore: expired.size === 20};
}
