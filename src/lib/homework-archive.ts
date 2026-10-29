import {safeSegment, uniqueNames} from './storage-export';

/** Cleared homework files stay restorable this long before the daily cleanup deletes them from storage. */
export const HOMEWORK_TRASH_KEEP_DAYS = 14;
/** One browser-made ZIP per assignment; bigger sets (mostly videos) go through the storage export instead. */
export const HOMEWORK_ARCHIVE_MAX_BYTES = 1.5 * 1024 ** 3;
export const HOMEWORK_ARCHIVE_MAX_ASSIGNMENTS = 20;

export type ArchiveStudent = {id: string; number?: unknown; name?: unknown};
export type ArchiveUpload = {id: string; studentId: string; fileName: string; size: number; current: boolean};

/** e.g. "받아쓰기 3단원_10-29.zip", dated by when the homework was given (Korean time). */
export function archiveZipName(title: unknown, openedAt: unknown) {
  const date = typeof openedAt === 'string' && Number.isFinite(Date.parse(openedAt))
    ? new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit'}).format(new Date(openedAt)) : '';
  return `${safeSegment(title, '숙제')}${date ? `_${date}` : ''}.zip`;
}

/** "03_김민준_IMG_1234.jpg"; files from earlier attempts go under "이전 제출/". Duplicates get " (2)". */
export function archiveEntryNames(uploads: ArchiveUpload[], students: ArchiveStudent[]) {
  const pupils = new Map(students.map(student => [student.id, student]));
  const sorted = [...uploads].sort((a, b) => {
    const left = Number(pupils.get(a.studentId)?.number ?? 9999), right = Number(pupils.get(b.studentId)?.number ?? 9999);
    return Number(b.current) - Number(a.current) || left - right || a.fileName.localeCompare(b.fileName);
  });
  const named = sorted.map(upload => {
    const pupil = pupils.get(upload.studentId);
    const owner = pupil ? `${String(pupil.number ?? '').padStart(2, '0')}_${safeSegment(pupil.name, '학생')}` : '학생';
    return {paths: [upload.id], size: upload.size, name: `${upload.current ? '' : '이전 제출/'}${owner}_${safeSegment(upload.fileName, '파일')}`};
  });
  return uniqueNames(named).map(file => ({uploadId: file.paths[0], name: file.name, size: file.size}));
}

export type TrashCheck = {ok: true; uploadIds: string[]} | {ok: false; reason: 'NOT_DOWNLOADED' | 'NEW_FILES' | 'NOTHING_TO_CLEAR'; missing: number};

/** Files can only be cleared after the teacher saved them: every stored file must be in the last download. */
export function trashCheck(storedUploadIds: string[], downloadedUploadIds: unknown): TrashCheck {
  if (!storedUploadIds.length) return {ok: false, reason: 'NOTHING_TO_CLEAR', missing: 0};
  if (!Array.isArray(downloadedUploadIds)) return {ok: false, reason: 'NOT_DOWNLOADED', missing: storedUploadIds.length};
  const saved = new Set(downloadedUploadIds), missing = storedUploadIds.filter(value => !saved.has(value)).length;
  return missing ? {ok: false, reason: 'NEW_FILES', missing} : {ok: true, uploadIds: storedUploadIds};
}

export function purgeTime(from: number) {return from + HOMEWORK_TRASH_KEEP_DAYS * 86_400_000;}

export type FileCleanupState = 'none' | 'trashed' | 'purged';
export function cleanupState(purgeAt: unknown, now = Date.now()): FileCleanupState {
  const at = typeof purgeAt === 'string' ? Date.parse(purgeAt) : NaN;
  return !Number.isFinite(at) ? 'none' : at > now ? 'trashed' : 'purged';
}
