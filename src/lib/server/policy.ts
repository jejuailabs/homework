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
export const characters = ['cat', 'dog', 'hamster', 'alpaca', 'rabbit'] as const;
const photoTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
export function uploadPolicy(contentType: unknown, size: unknown) {
  if (typeof contentType !== 'string' || ![...photoTypes, ...videoTypes].includes(contentType)) throw new ApiError(400, '사진, PDF 또는 지원되는 영상 파일을 선택해 주세요.', 'FILE_TYPE');
  const limit = (videoTypes.includes(contentType) ? 250 : 100) * 1024 * 1024;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0 || size > limit) throw new ApiError(400, `이 파일은 ${limit / 1024 / 1024}MB까지 올릴 수 있어요.`, 'FILE_SIZE');
  return { contentType, size, limit };
}
export function nextReview(status: unknown, alreadyRewarded: boolean) {
  if (status !== 'done' && status !== 'revision') throw new ApiError(400, '확인 상태를 선택해 주세요.');
  return { status, reward: status === 'done' && !alreadyRewarded ? 10 : 0 };
}
