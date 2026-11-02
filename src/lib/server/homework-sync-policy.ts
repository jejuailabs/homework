import {ApiError} from './policy';

export type HomeworkSync = {exhibitionId: string | null; boardId: string | null};
export const EXHIBITION_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/** Which rooms a new homework room creates. Both default to off; text homework never feeds an exhibition. */
export function homeworkSyncTargets(raw: unknown, submissionType: string) {
  if (raw === undefined || raw === null) return {exhibition: false, board: false};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError(400, '자동 연동 설정을 확인해 주세요.', 'SYNC_INPUT');
  const value = raw as Record<string, unknown>;
  for (const key of ['exhibition', 'board']) if (key in value && typeof value[key] !== 'boolean') throw new ApiError(400, '자동 연동 설정을 확인해 주세요.', 'SYNC_INPUT');
  if (value.exhibition === true && submissionType === 'text') throw new ApiError(400, '텍스트 숙제는 전시실에 연동되지 않아요.', 'SYNC_TEXT_EXHIBITION');
  return {exhibition: value.exhibition === true, board: value.board === true};
}

/** The submission files an exhibition can show: photos first, then a processed video. */
type SyncUpload = {path?: string; contentType?: string; thumbnailPath?: string};
export type SyncMedia = {kind: 'image' | 'video'; upload: SyncUpload & {path: string}};
export function syncableUploads(uploads: SyncUpload[]): SyncMedia[] {
  return uploads.flatMap((upload): SyncMedia[] => {
    const type = String(upload.contentType || '');
    if (!upload.path) return [];
    if (EXHIBITION_IMAGE_TYPES.includes(type)) return [{kind: 'image', upload: {...upload, path: upload.path}}];
    // Only the processed MP4 has a poster frame; raw uploads still being converted are skipped.
    if (type.startsWith('video/') && upload.thumbnailPath) return [{kind: 'video', upload: {...upload, path: upload.path}}];
    return [];
  });
}

/** A failed sync is retried, but not forever: three tries per submission attempt. */
export function syncDue(state: {attemptId?: string; status?: string; tries?: number} | undefined, attemptId: string) {
  if (!state || state.attemptId !== attemptId) return true;
  if (state.status === 'synced') return false;
  return (state.tries ?? 0) < 3;
}
