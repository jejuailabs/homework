import { ApiError, id, type Role } from './policy';
import type { ArtworkStatus, ArtReaction, ArtReactionCounts, ExhibitionStatus, ExhibitionTheme, ExhibitionStorageUsage } from '../exhibition-types';

export const EXHIBITION_ARTWORK_LIMIT = 300;
export const EXHIBITION_LIST_LIMIT = 100;
export const EXHIBITION_IMAGE_LIMIT = 100 * 1024 * 1024;
export const EXHIBITION_PIXEL_LIMIT = 40_000_000;
export const EXHIBITION_DERIVATIVE_RESERVATION = 16 * 1024 * 1024;
export function exhibitionStorageLimit(raw: unknown) {
  if (raw === undefined || raw === '') return 5 * 1024 ** 3;
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 100 * 1024 ** 2 || value > 1024 ** 4) throw new ApiError(500, '전시 저장 공간 설정을 확인해 주세요.', 'STORAGE_CONFIGURATION');
  return value;
}
export function reserveExhibitionBytes(usage: ExhibitionStorageUsage, bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new ApiError(500, '저장 공간을 계산하지 못했어요.', 'STORAGE_ACCOUNTING');
  if (usage.usedBytes + usage.reservedBytes + bytes > usage.limitBytes) throw new ApiError(413, '전시 저장 공간이 가득 찼어요. 대기 중인 사진을 정리하거나 저장 공간 설정을 확인해 주세요.', 'STORAGE_QUOTA');
  return { ...usage, reservedBytes: usage.reservedBytes + bytes };
}
export function settleExhibitionBytes(usage: ExhibitionStorageUsage, reserved: number, stored: number) {
  if (![reserved, stored].every(value => Number.isSafeInteger(value) && value >= 0) || usage.reservedBytes < reserved) throw new ApiError(500, '저장 공간을 계산하지 못했어요.', 'STORAGE_ACCOUNTING');
  const next = { ...usage, reservedBytes: usage.reservedBytes - reserved, usedBytes: usage.usedBytes + stored };
  if (next.usedBytes + next.reservedBytes > next.limitBytes) throw new ApiError(413, '전시 저장 공간이 가득 찼어요.', 'STORAGE_QUOTA');
  return next;
}
export function releaseExhibitionBytes(usage: ExhibitionStorageUsage, reserved: number, alreadyReleased: boolean, deleted: boolean) {
  // A failed physical deletion keeps its reservation, so retrying cannot undercount storage.
  if (alreadyReleased || !deleted) return usage;
  if (!Number.isSafeInteger(reserved) || reserved < 0 || usage.reservedBytes < reserved) throw new ApiError(500, '저장 공간을 계산하지 못했어요.', 'STORAGE_ACCOUNTING');
  // Cleanup must still work after an operator lowers a limit below existing usage.
  return { ...usage, reservedBytes: usage.reservedBytes - reserved };
}
export function exhibitionCursor(value: string | null, scope: string): { createdAt: string; id: string } | null {
  if (!value) return null;
  try {
    if (value.length > 2000 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (decoded.v !== 1 || decoded.scope !== scope || typeof decoded.createdAt !== 'string' || new Date(decoded.createdAt).toISOString() !== decoded.createdAt) throw new Error();
    return { createdAt: decoded.createdAt, id: id(decoded.id) };
  } catch { throw new ApiError(400, '목록을 새로고침해 주세요.', 'INVALID_CURSOR'); }
}
export function encodeExhibitionCursor(scope: string, entry: { createdAt: string; id: string }) {
  return Buffer.from(JSON.stringify({ v: 1, scope, createdAt: entry.createdAt, id: entry.id })).toString('base64url');
}
export async function completeExhibitionWrites(writes: Promise<unknown>[]) {
  const results = await Promise.allSettled(writes);
  const failed = results.find(result => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}
export type ExhibitionActor = { uid: string; role: Role; classId?: string; studentId?: string };
export type ExhibitionAccess = { ownerUid: string; classId: string; status: ExhibitionStatus };

export function ownsExhibition(actor: ExhibitionActor, exhibition: ExhibitionAccess) {
  return actor.role !== 'student' && actor.uid === exhibition.ownerUid;
}
export function canViewExhibition(actor: ExhibitionActor, exhibition: ExhibitionAccess) {
  return ownsExhibition(actor, exhibition) || (studentAudienceMatches(actor, exhibition) && exhibition.status !== 'draft');
}
export function canSubmitExhibition(actor: ExhibitionActor, exhibition: ExhibitionAccess) {
  return ownsExhibition(actor, exhibition);
}
export function studentAudienceMatches(actor: ExhibitionActor, exhibition: ExhibitionAccess) {
  // Class is the privacy boundary; grade/year labels never widen admission.
  return actor.role === 'student' && !!actor.classId && actor.classId === exhibition.classId;
}
export function canParticipateExhibition(actor: ExhibitionActor, exhibition: ExhibitionAccess) {
  return ownsExhibition(actor, exhibition) || (studentAudienceMatches(actor, exhibition) && exhibition.status === 'open');
}
export function canViewArtwork(actor: ExhibitionActor, exhibition: ExhibitionAccess, artwork: { studentId: string; status: ArtworkStatus }) {
  return canViewExhibition(actor, exhibition) && (ownsExhibition(actor, exhibition) || artwork.status === 'approved' || (!!artwork.studentId && artwork.studentId === actor.studentId));
}
export function exhibitionUploadPolicy(contentType: unknown, size: unknown) {
  if (typeof contentType !== 'string' || !['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) throw new ApiError(400, 'JPG, PNG, WebP 사진을 선택해 주세요.', 'FILE_TYPE');
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1 || size > EXHIBITION_IMAGE_LIMIT) throw new ApiError(400, '사진 한 장은 100MB까지 올릴 수 있어요.', 'FILE_SIZE');
  return { contentType, size };
}
export function canConsumeExhibitionUpload(actor: ExhibitionActor, exhibitionId: string, upload: { userUid?: unknown; exhibitionId?: unknown; status?: unknown } | undefined) {
  return actor.role !== 'student' && !!upload && upload.userUid === actor.uid && upload.exhibitionId === exhibitionId && upload.status === 'pending';
}
export function exhibitionStatus(value: unknown): ExhibitionStatus {
  if (value !== 'draft' && value !== 'open' && value !== 'closed') throw new ApiError(400, '전시 상태를 확인해 주세요.');
  return value;
}
export function exhibitionTheme(value: unknown): ExhibitionTheme {
  if (value !== 'cozy' && value !== 'forest' && value !== 'sky' && value !== 'ocean') throw new ApiError(400, '전시실 테마를 선택해 주세요.');
  return value;
}
export function artworkStudentId(value: unknown) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return '';
  return id(value, '학생');
}
export function artworkReview(value: unknown): 'approved' | 'revision' {
  if (value !== 'approved' && value !== 'revision') throw new ApiError(400, '작품 확인 상태를 선택해 주세요.');
  return value;
}
export function artReaction(value: unknown): ArtReaction {
  if (value !== 'colors' && value !== 'idea' && value !== 'story') throw new ApiError(400, '응원 종류를 선택해 주세요.');
  return value;
}
export function approvalCountDelta(previous: ArtworkStatus, next: ArtworkStatus) {
  return Number(next === 'approved') - Number(previous === 'approved');
}
export function canViewArtworkFeedback(actor: ExhibitionActor, exhibition: ExhibitionAccess, studentId: string) {
  return ownsExhibition(actor, exhibition) || (!!studentId && studentAudienceMatches(actor, exhibition) && actor.studentId === studentId);
}
export function nextReactionCounts(current: Partial<ArtReactionCounts> | undefined, previous: ArtReaction | undefined, next: ArtReaction): ArtReactionCounts {
  const counts = { colors: current?.colors ?? 0, idea: current?.idea ?? 0, story: current?.story ?? 0 };
  if (previous === next) return counts;
  if (previous) counts[previous] = Math.max(0, counts[previous] - 1);
  counts[next] += 1;
  return counts;
}
export function nextPassport(current: { artist?: boolean; thoughtfulComment?: boolean } | undefined, stamp: 'artist' | 'thoughtfulComment') {
  const result = { artist: !!current?.artist, thoughtfulComment: !!current?.thoughtfulComment };
  result[stamp] = true;
  return { ...result, stamps: Number(result.artist) + Number(result.thoughtfulComment) };
}
