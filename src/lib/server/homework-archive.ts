import 'server-only';
import {FieldValue} from 'firebase-admin/firestore';
import {bucket, db} from './admin';
import {assertOrigin, requireTeacher, type Context} from './auth';
import {ApiError, canManageClass, id} from './policy';
import {stableReadUrl} from './signed-urls';
import {archiveEntryNames, archiveZipName, cleanupState, purgeTime, trashCheck, HOMEWORK_ARCHIVE_MAX_ASSIGNMENTS} from '../homework-archive';

type Data = FirebaseFirestore.DocumentData;
type Owned = {id: string; classId: string; title: string; createdAt?: string; ref: FirebaseFirestore.DocumentReference};
const archiveRef = (assignmentId: string) => db().doc(`homeworkFileArchives/${assignmentId}`);
const now = () => new Date().toISOString();

/** Hidden (archived) homework is included: it is the usual candidate for clearing space. */
async function ownedAssignments(ctx: Context, raw: unknown): Promise<Owned[]> {
  if (!Array.isArray(raw) || !raw.length || raw.length > HOMEWORK_ARCHIVE_MAX_ASSIGNMENTS) throw new ApiError(400, `숙제는 한 번에 1~${HOMEWORK_ARCHIVE_MAX_ASSIGNMENTS}개까지 골라 주세요.`, 'ARCHIVE_SIZE');
  const ids = [...new Set(raw.map(value => id(value)))];
  const tasks = await db().getAll(...ids.map(value => db().doc(`assignments/${value}`)));
  const classIds = [...new Set(tasks.map(task => String(task.data()?.classId || '')).filter(Boolean))];
  const classes = classIds.length ? await db().getAll(...classIds.map(value => db().doc(`classes/${id(value)}`))) : [];
  const owners = new Map(classes.map(cls => [cls.id, cls.data()?.ownerUid]));
  return tasks.map(task => {
    const value = task.data();
    if (!task.exists || !value) throw new ApiError(404, '숙제를 찾을 수 없어요.', 'NOT_FOUND');
    if (!canManageClass(ctx.role, ctx.uid, owners.get(value.classId))) throw new ApiError(403, '이 학급을 관리할 권한이 없어요.', 'FORBIDDEN');
    return {id: task.id, classId: value.classId, title: value.title, createdAt: value.createdAt, ref: task.ref};
  });
}

async function uploadsOf(task: Owned, status: 'submitted' | 'trashed') {
  const docs = await db().collection('uploads').where('assignmentId', '==', task.id).where('status', '==', status).get();
  return docs.docs.filter(doc => doc.data().classId === task.classId);
}
const storedBytes = (value: Data) => Number(value.storedBytes ?? value.size ?? 0) + Number(value.originalRetainedBytes || 0);

async function status(task: Owned) {
  const [stored, archive] = await Promise.all([uploadsOf(task, 'submitted'), archiveRef(task.id).get()]);
  const value = archive.data() ?? {}, state = cleanupState(value.purgeAt);
  const check = trashCheck(stored.map(doc => doc.id), value.downloadedUploadIds);
  return {
    id: task.id, title: task.title, fileCount: stored.length, bytes: stored.reduce((total, doc) => total + storedBytes(doc.data()), 0),
    downloadedAt: value.downloadedAt ?? null, readyToClear: check.ok, newSinceDownload: !check.ok && check.reason === 'NEW_FILES' ? check.missing : 0,
    cleanup: state === 'none' ? null : {state, fileCount: Number(value.trashedCount || 0), bytes: Number(value.trashedBytes || 0), trashedAt: value.trashedAt ?? null, purgeAt: value.purgeAt},
  };
}

async function files(task: Owned) {
  const [stored, submissions, students] = await Promise.all([
    uploadsOf(task, 'submitted'), db().collection('submissions').where('assignmentId', '==', task.id).get(), db().collection(`classes/${task.classId}/students`).get(),
  ]);
  const current = new Set(submissions.docs.flatMap(doc => (doc.data().uploads ?? []).map((upload: Data) => upload.id)));
  const byId = new Map(stored.map(doc => [doc.id, doc.data()]));
  const names = archiveEntryNames(stored.map(doc => ({id: doc.id, studentId: String(doc.data().studentId || ''), fileName: String(doc.data().fileName || ''), contentType: String(doc.data().contentType || ''), size: Number(doc.data().size || 0), current: current.has(doc.id)})),
    students.docs.map(doc => ({id: doc.id, number: doc.data().number, name: doc.data().name})), task.title);
  return {
    id: task.id, title: task.title, zipName: archiveZipName(task.title, task.createdAt),
    files: await Promise.all(names.map(async file => ({...file, contentType: String(byId.get(file.uploadId)?.contentType || ''), url: await stableReadUrl(String(byId.get(file.uploadId)!.path))}))),
  };
}

/** Records exactly which stored files reached the teacher's computer; clearing is limited to those. */
async function markDownloaded(task: Owned, raw: unknown) {
  if (!Array.isArray(raw) || raw.length > 5000) throw new ApiError(400, '받은 파일 목록을 확인해 주세요.', 'ARCHIVE_INPUT');
  const sent = new Set(raw.map(value => String(value))), stored = await uploadsOf(task, 'submitted');
  await archiveRef(task.id).set({assignmentId: task.id, classId: task.classId, downloadedAt: now(), downloadedUploadIds: stored.map(doc => doc.id).filter(value => sent.has(value))}, {merge: true});
}

async function chunked<T>(items: T[], write: (batch: FirebaseFirestore.WriteBatch, item: T) => void) {
  for (let offset = 0; offset < items.length; offset += 400) {const batch = db().batch(); items.slice(offset, offset + 400).forEach(item => write(batch, item)); await batch.commit();}
}

async function trash(ctx: Context, task: Owned) {
  const [stored, archive] = await Promise.all([uploadsOf(task, 'submitted'), archiveRef(task.id).get()]);
  if (cleanupState(archive.data()?.purgeAt) === 'trashed') throw new ApiError(409, `"${task.title}" 파일은 이미 삭제 예정이에요.`, 'ALREADY_CLEARED');
  const check = trashCheck(stored.map(doc => doc.id), archive.data()?.downloadedUploadIds);
  if (!check.ok) throw new ApiError(409, check.reason === 'NOTHING_TO_CLEAR' ? `"${task.title}"에는 정리할 파일이 없어요.` : check.reason === 'NEW_FILES' ? `"${task.title}"에 받은 뒤 새로 제출된 파일이 ${check.missing}개 있어요. 다시 받아 주세요.` : `"${task.title}" 파일을 먼저 받아 주세요.`, check.reason);
  const trashedAt = now(), purgeAt = new Date(purgeTime(Date.now())).toISOString(), bytes = stored.reduce((total, doc) => total + storedBytes(doc.data()), 0);
  // The archive record goes first so a partly applied clear can always be restored.
  await archiveRef(task.id).set({assignmentId: task.id, classId: task.classId, trashedAt, purgeAt, trashedBy: ctx.uid, trashedUploadIds: check.uploadIds, trashedCount: stored.length, trashedBytes: bytes, restoredAt: null}, {merge: true});
  await chunked(stored, (batch, doc) => batch.update(doc.ref, {status: 'trashed', trashedAt, purgeAt, trashedBy: ctx.uid}));
  const submissions = await db().collection('submissions').where('assignmentId', '==', task.id).get();
  await chunked(submissions.docs.filter(doc => doc.data().uploads?.length), (batch, doc) => batch.update(doc.ref, {filesRemoved: {trashedAt, purgeAt}}));
  await audit(ctx, 'homework.files-trash', task.id, {classId: task.classId, fileCount: stored.length, bytes, purgeAt});
}

async function restore(ctx: Context, task: Owned) {
  const archive = (await archiveRef(task.id).get()).data();
  const state = cleanupState(archive?.purgeAt);
  if (state === 'none') throw new ApiError(409, `"${task.title}"에는 복원할 파일이 없어요.`, 'NOTHING_TO_RESTORE');
  if (state === 'purged') throw new ApiError(410, `"${task.title}" 파일은 보관 기간이 지나 완전히 지워졌어요.`, 'PURGED');
  const trashed = await uploadsOf(task, 'trashed');
  await chunked(trashed, (batch, doc) => batch.update(doc.ref, {status: 'submitted', trashedAt: FieldValue.delete(), purgeAt: FieldValue.delete(), trashedBy: FieldValue.delete()}));
  const submissions = await db().collection('submissions').where('assignmentId', '==', task.id).get();
  await chunked(submissions.docs.filter(doc => doc.data().filesRemoved), (batch, doc) => batch.update(doc.ref, {filesRemoved: FieldValue.delete()}));
  await archiveRef(task.id).set({trashedAt: null, purgeAt: null, trashedBy: null, trashedUploadIds: [], trashedCount: 0, trashedBytes: 0, restoredAt: now()}, {merge: true});
  await audit(ctx, 'homework.files-restore', task.id, {classId: task.classId, fileCount: trashed.length});
}

async function audit(ctx: Context, action: string, target: string, details: Data) {
  await db().collection('adminAudit').add({actorUid: ctx.uid, action, target, details, kind: 'change', outcome: 'success', createdAt: now()});
}

/** Daily cleanup: files cleared more than fourteen days ago are deleted from storage for good. */
export async function purgeTrashedHomeworkFiles() {
  const trashed = await db().collection('uploads').where('status', '==', 'trashed').get();
  const due = trashed.docs.filter(doc => cleanupState(doc.data().purgeAt) === 'purged').slice(0, 200);
  let purged = 0;
  for (const doc of due) {
    const value = doc.data();
    const paths = [value.path, value.thumbnailPath, value.originalPath].filter((path): path is string => typeof path === 'string' && /^(uploads|processed-videos)\//.test(path));
    try {
      await Promise.all(paths.map(path => bucket().file(path).delete({ignoreNotFound: true})));
      await doc.ref.update({status: 'purged', purgedAt: now(), originalRetainedBytes: 0});
      purged++;
    } catch {console.error('Homework file purge deferred');}
  }
  return {purged, hasMore: due.length === 200};
}

export async function handleHomeworkArchive(request: Request) {
  const json = (data: unknown, code = 200) => Response.json(data, {status: code, headers: {'Cache-Control': 'private,no-store'}});
  try {
    assertOrigin(request);
    const ctx = await requireTeacher(request);
    const input = await request.json().catch(() => null) as Data | null;
    const tasks = await ownedAssignments(ctx, input?.assignmentIds);
    switch (input?.action) {
      case 'status': return json({assignments: await Promise.all(tasks.map(status))});
      case 'files': return json({assignments: await Promise.all(tasks.map(files))});
      case 'downloaded': for (const task of tasks) await markDownloaded(task, input.uploadIds?.[task.id]); return json({assignments: await Promise.all(tasks.map(status))});
      case 'trash': for (const task of tasks) await trash(ctx, task); return json({assignments: await Promise.all(tasks.map(status))});
      case 'restore': for (const task of tasks) await restore(ctx, task); return json({assignments: await Promise.all(tasks.map(status))});
      default: throw new ApiError(400, '요청을 확인해 주세요.', 'ARCHIVE_ACTION');
    }
  } catch (error) {
    if (error instanceof ApiError) return json({error: error.message, code: error.code}, error.status);
    console.error('Homework archive failed', (error as {code?: unknown})?.code ?? 'INTERNAL');
    return json({error: '숙제 파일을 처리하지 못했어요. 다시 시도해 주세요.', code: 'INTERNAL_ERROR'}, 500);
  }
}
