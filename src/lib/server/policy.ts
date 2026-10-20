export {characters} from '../characters';
import { acceptsSubmissionFile, submissionTypes, videoSubmissionMimeTypes, type AssignmentSubmissionType, type SubmissionType } from '../assignment-submission';
export type Role = 'teacher' | 'student' | 'admin' | 'superadmin';
export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'INVALID_REQUEST') { super(message); }
}
export function text(value: unknown, label: string, max: number, optional = false): string {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || (!optional && !value.trim())) throw new ApiError(400, `${label}을(를) 확인해 주세요.`);
  if (value.length > max) throw new ApiError(400, `${label}은(는) ${max}자까지 입력할 수 있어요.`);
  return value.trim();
}
export function id(value: unknown, label = '항목'): string {
  const result = text(value, label, 200);
  if (!/^[A-Za-z0-9_-]+$/.test(result)) throw new ApiError(400, `${label}을(를) 확인해 주세요.`);
  return result;
}
export function isAdmin(role: Role) { return role === 'admin' || role === 'superadmin'; }
export function canManageClass(role: Role, uid: string, ownerUid: unknown) { return role !== 'student' && uid === ownerUid; }
export function canDisableUser(actorRole: Role, actorUid: string, targetUid: string, targetRole: unknown) {
  return isAdmin(actorRole) && actorUid !== targetUid && targetRole !== 'superadmin' && (targetRole !== 'admin' || actorRole === 'superadmin');
}
export function canUseUpload(uid: string, assignmentId: string, record: { userUid?: unknown; assignmentId?: unknown; status?: unknown } | undefined) {
  return !!record && record.userUid === uid && record.assignmentId === assignmentId && record.status === 'pending';
}
export function validStudentSession(tokenVersion: unknown, currentVersion: unknown) {
  return typeof tokenVersion === 'number' && Number.isSafeInteger(tokenVersion) && tokenVersion >= 0 && tokenVersion === currentVersion;
}
export function validSessionAuthentication(authTime: unknown, validAfter?: string): boolean {
  if (typeof authTime !== 'number' || !Number.isSafeInteger(authTime) || authTime < 0) return false;
  if (!validAfter) return true;
  const cutoff = Date.parse(validAfter);
  return Number.isFinite(cutoff) && authTime * 1000 >= cutoff;
}
export function requiredSubmissionType(value: unknown): SubmissionType {
  if (!submissionTypes.includes(value as SubmissionType)) throw new ApiError(400, '숙제 제출 방식을 글쓰기, 사진·이미지, 영상 중에서 선택해 주세요.', 'SUBMISSION_TYPE');
  return value as SubmissionType;
}
export function submissionContentPolicy(type: AssignmentSubmissionType, answer: string, fileCount: number) {
  if(type==='video'&&fileCount!==1)throw new ApiError(400,'영상은 한 개만 제출해 주세요.','VIDEO_COUNT');
  if (type === 'text') {
    if (!answer.trim() || fileCount !== 0) throw new ApiError(400, '글쓰기 숙제는 내용을 적어 제출해 주세요. 첨부파일은 사용할 수 없어요.', 'SUBMISSION_CONTENT');
    return;
  }
  if ((type === 'image' || type === 'video') && fileCount < 1) throw new ApiError(400, type === 'image' ? '사진·이미지를 한 개 이상 첨부해 주세요.' : '영상을 한 개 이상 첨부해 주세요.', 'SUBMISSION_CONTENT');
  if (type === 'legacy' && !answer.trim() && !fileCount) throw new ApiError(400, '내용을 적거나 파일을 첨부해 주세요.', 'SUBMISSION_CONTENT');
}
export function uploadPolicy(contentType: unknown, size: unknown, submissionType: AssignmentSubmissionType = 'legacy') {
  if (typeof contentType !== 'string' || !acceptsSubmissionFile('legacy', contentType)) throw new ApiError(400, '사진, PDF 또는 지원되는 영상 파일을 선택해 주세요.', 'FILE_TYPE');
  if (!acceptsSubmissionFile(submissionType, contentType)) throw new ApiError(400, submissionType === 'text' ? '글쓰기 숙제에는 파일을 첨부할 수 없어요.' : submissionType === 'image' ? '이 숙제는 사진·이미지만 첨부할 수 있어요.' : '이 숙제는 영상만 첨부할 수 있어요.', 'SUBMISSION_FILE_TYPE');
  const limit = (videoSubmissionMimeTypes.includes(contentType as (typeof videoSubmissionMimeTypes)[number]) ? 250 : 100) * 1024 * 1024;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0 || size > limit) throw new ApiError(400, `이 파일은 ${limit / 1024 / 1024}MB까지 올릴 수 있어요.`, 'FILE_SIZE');
  return { contentType, size, limit };
}
export function nextReview(status: unknown, alreadyRewarded: boolean) {
  if (status !== 'done' && status !== 'revision') throw new ApiError(400, '확인 상태를 선택해 주세요.');
  return { status, reward: status === 'done' && !alreadyRewarded ? 10 : 0 };
}
/** A phone-made JPEG preview is accepted only alongside a photo and only while it stays small. */
export function homeworkThumbnailSize(contentType: string, raw: unknown): number | undefined {
  if (raw === undefined || raw === null || !contentType.startsWith('image/')) return undefined;
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw <= 0 || raw > 300 * 1024) throw new ApiError(400, '미리보기 사진 정보를 확인해 주세요.', 'THUMBNAIL_SIZE');
  return raw;
}
