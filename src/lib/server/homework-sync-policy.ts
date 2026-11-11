import {ApiError, requiredSubmissionType} from './policy';

export type HomeworkSync = {exhibitionId: string | null; boardId: string | null};
export const EXHIBITION_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/** Which rooms a new homework room creates. Both default to off; text homework never feeds an exhibition. */
export function homeworkSyncTargets(raw: unknown, submissionType: string) {
  if (raw === undefined || raw === null) return {exhibition: false, board: false};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError(400, '자동 연동 설정을 확인해 주세요.', 'SYNC_INPUT');
  const value = raw as Record<string, unknown>;
  for (const key of ['exhibition', 'board']) if (key in value && typeof value[key] !== 'boolean') throw new ApiError(400, '자동 연동 설정을 확인해 주세요.', 'SYNC_INPUT');
  if (value.exhibition === true && submissionType === 'text') throw new ApiError(400, '텍스트 숙제는 전시실에 연동되지 않아요.', 'SYNC_TEXT_EXHIBITION');
  if (value.exhibition === true && submissionType === 'audio') throw new ApiError(400, '녹음 숙제는 전시실에 연동되지 않아요. 게시판 연동을 써 주세요.', 'SYNC_AUDIO_EXHIBITION');
  return {exhibition: value.exhibition === true, board: value.board === true};
}

/**
 * A homework room may switch how students hand in only while nobody has handed anything in; files already sent would no longer fit.
 * Returns the new type, or null when the request keeps the current one.
 */
export function submissionTypeChange(current: unknown, requested: unknown, hasSubmissions: boolean) {
  if (requested === undefined || requested === null || requested === current) return null;
  const next = requiredSubmissionType(requested);
  if (hasSubmissions) throw new ApiError(409, '이미 제출한 학생이 있어 제출 방식을 바꿀 수 없어요. 새 숙제방을 열어 주세요.', 'SUBMISSION_TYPE_LOCKED');
  return next;
}

/**
 * Applies edited options. A room switched off stays in place and is remembered, so switching it on again reuses it;
 * `create` names the rooms that do not exist yet and `added` says some room just came on.
 */
export function editedHomeworkSync(current: Partial<HomeworkSync> | null | undefined, paused: Partial<HomeworkSync> | null | undefined, targets: {exhibition: boolean; board: boolean}) {
  const exhibitionId = current?.exhibitionId ?? null, boardId = current?.boardId ?? null, oldExhibition = paused?.exhibitionId ?? null, oldBoard = paused?.boardId ?? null;
  return {
    sync: {exhibitionId: targets.exhibition ? exhibitionId ?? oldExhibition : null, boardId: targets.board ? boardId ?? oldBoard : null},
    paused: {exhibitionId: targets.exhibition ? null : exhibitionId ?? oldExhibition, boardId: targets.board ? null : boardId ?? oldBoard},
    create: {exhibition: targets.exhibition && !exhibitionId && !oldExhibition, board: targets.board && !boardId && !oldBoard},
    added: (targets.exhibition && !exhibitionId) || (targets.board && !boardId),
  };
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
