import { ApiError, id, text } from './policy';
import { boardLayouts, boardThemes, type BoardPostInput, type BoardSettingsInput } from '../participation-types';
import { characters } from '../characters';

type Actor = { uid: string; role: string; classId?: string; studentId?: string };
type Board = { ownerUid: string; classId: string; status: string; revealMode?: boolean; revealed?: boolean; moderation?: boolean; anonymous?: boolean; commentsEnabled?: boolean; reactionsEnabled?: boolean; sections?: { id: string; title: string }[] };
type Post = { authorUid: string; status: string; deleted?: boolean };
export const BOARD_POST_LIMIT = 500;
export const BOARD_PAGE_LIMIT = 100;
// The teacher's plan is the real limit; the board ledger keeps accounting under this ceiling.
export const BOARD_STORAGE_LIMIT = 1024 ** 4;
export const isBoardOwner = (actor: Actor, board: Board) => actor.role !== 'student' && actor.uid === board.ownerUid;
export const canViewBoard = (actor: Actor, board: Board) => isBoardOwner(actor, board) || (actor.role === 'student' && actor.classId === board.classId && board.status !== 'archived');
export const canWriteBoard = (actor: Actor, board: Board) => isBoardOwner(actor, board) || (canViewBoard(actor, board) && board.status === 'open');
export function canViewBoardPost(actor: Actor, board: Board, post: Post) {
  if (!canViewBoard(actor, board) || post.deleted) return false;
  if (isBoardOwner(actor, board) || actor.uid === post.authorUid) return true;
  return post.status === 'published' && !(board.revealMode && !board.revealed);
}
export function canViewBoardComment(actor: Actor, board: Board, post: Post, comment: Post) {
  return canViewBoardPost(actor, board, post) && !comment.deleted && (isBoardOwner(actor, board) || actor.uid === comment.authorUid || comment.status === 'published');
}
export function assertBoardWrite(actor: Actor, board: Board) {
  if (!canWriteBoard(actor, board)) throw new ApiError(403, '지금은 참여를 마친 보드예요.', 'BOARD_FROZEN');
}
export function assertBoardOwner(actor: Actor, board: Board) {
  if (!isBoardOwner(actor, board)) throw new ApiError(403, '이 보드의 선생님만 변경할 수 있어요.', 'FORBIDDEN');
}
function choice<T extends string>(value: unknown, list: readonly T[], label: string): T {
  if (!list.includes(value as T)) throw new ApiError(400, `${label}을 확인해 주세요.`);
  return value as T;
}
export function boardSettings(input: Record<string, unknown>): BoardSettingsInput {
  const out: BoardSettingsInput = {};
  if ('title' in input) out.title = text(input.title, '보드 제목', 120);
  if ('description' in input) out.description = text(input.description, '소개', 2000, true);
  if ('layout' in input) out.layout = choice(input.layout, boardLayouts, '배치');
  if ('theme' in input) out.theme = choice(input.theme, boardThemes, '테마');
  if ('character' in input) out.character = choice(input.character, characters, '캐릭터');
  if ('status' in input) out.status = choice(input.status, ['open', 'frozen', 'archived'] as const, '보드 상태');
  if ('sort' in input) out.sort = choice(input.sort, ['manual', 'newest', 'oldest'] as const, '정렬');
  for (const key of ['commentsEnabled', 'reactionsEnabled', 'moderation', 'anonymous', 'revealMode', 'revealed', 'publicViewEnabled', 'visitorComments'] as const) {
    if (key in input) { if (typeof input[key] !== 'boolean') throw new ApiError(400, '설정을 확인해 주세요.'); out[key] = input[key]; }
  }
  if ('sections' in input) {
    if (!Array.isArray(input.sections) || input.sections.length > 50) throw new ApiError(400, '구역은 50개까지 만들 수 있어요.');
    out.sections = input.sections.map((raw: unknown) => { const v = raw as Record<string, unknown>; return { id: id(v?.id), title: text(v?.title, '구역 이름', 80) }; });
    if (new Set(out.sections.map(s => s.id)).size !== out.sections.length) throw new ApiError(400, '구역 번호가 중복되어 있어요.');
  }
  return out;
}
export function safeBoardLink(value: unknown) {
  const link = text(value, '링크', 2000, true);
  if (!link) return '';
  try { const url = new URL(link); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error(); return url.href; }
  catch { throw new ApiError(400, 'https:// 또는 http:// 링크를 입력해 주세요.', 'LINK'); }
}
export function boardPostInput(input: Record<string, unknown>, board: Board): BoardPostInput {
  const out: BoardPostInput = {};
  if ('title' in input) out.title = text(input.title, '제목', 200, true);
  if ('body' in input) out.body = text(input.body, '내용', 10000, true);
  if ('link' in input) out.link = safeBoardLink(input.link);
  if ('color' in input) out.color = choice(input.color, boardThemes, '카드 색상');
  if ('sectionId' in input) {
    out.sectionId = input.sectionId === '' ? '' : id(input.sectionId);
    if (out.sectionId && !board.sections?.some(s => s.id === out.sectionId)) throw new ApiError(400, '보드의 구역을 선택해 주세요.');
  }
  for (const key of ['x', 'y'] as const) if (key in input) {
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key] < 0 || input[key] > 100000) throw new ApiError(400, '카드 위치를 확인해 주세요.');
    out[key] = input[key];
  }
  if ('uploadIds' in input) {
    if (!Array.isArray(input.uploadIds) || input.uploadIds.length > 10) throw new ApiError(400, '첨부파일은 글 하나에 10개까지 올릴 수 있어요.');
    out.uploadIds = input.uploadIds.map(v => id(v));
    if (new Set(out.uploadIds).size !== out.uploadIds.length) throw new ApiError(400, '같은 첨부파일이 반복되어 있어요.');
  }
  if ('location' in input) {
    const v = input.location as { lat?: unknown; lng?: unknown; label?: unknown } | null;
    if (v === null) out.location = null;
    else {
      if (typeof v?.lat !== 'number' || typeof v?.lng !== 'number' || !Number.isFinite(v.lat) || !Number.isFinite(v.lng) || Math.abs(v.lat) > 90 || Math.abs(v.lng) > 180) throw new ApiError(400, '지도 위치를 확인해 주세요.');
      out.location = { lat: v.lat, lng: v.lng, label: text(v.label, '장소 이름', 120, true) };
    }
  }
  if ('poll' in input) {
    const poll = input.poll as { question?: unknown; options?: unknown[] } | null;
    if (poll === null) out.poll = null;
    else {
      if (!Array.isArray(poll?.options) || poll.options.length < 2 || poll.options.length > 10) throw new ApiError(400, '투표 선택지는 2~10개로 만들어 주세요.');
      const options = poll.options.map(raw => { const v = raw as { id?: unknown; text?: unknown }; return { id: id(v?.id), text: text(v?.text, '선택지', 150) }; });
      if (new Set(options.map(v => v.id)).size !== options.length) throw new ApiError(400, '투표 선택지가 중복되어 있어요.');
      out.poll = { question: text(poll.question, '투표 질문', 200), options };
    }
  }
  if ('status' in input) out.status = choice(input.status, ['published', 'pending', 'hidden'] as const, '게시물 상태');
  if ('pinned' in input) { if (typeof input.pinned !== 'boolean') throw new ApiError(400, '고정 설정을 확인해 주세요.'); out.pinned = input.pinned; }
  return out;
}
export function boardUploadPolicy(type: unknown, size: unknown) {
  const types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/ogg', 'audio/wav', 'application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
  const contentType = choice(type, types, '첨부 형식');
  const limit = (contentType.startsWith('video/') ? 250 : 100) * 1024 ** 2;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1 || size > limit) throw new ApiError(400, `파일은 ${limit / 1024 ** 2}MB까지 올릴 수 있어요.`, 'FILE_SIZE');
  return { contentType, size, kind: contentType.startsWith('image/') ? 'image' : contentType.startsWith('video/') ? 'video' : contentType.startsWith('audio/') ? 'audio' : 'file' } as const;
}
export function changedReaction(counts: Record<string, number> = {}, previous?: string, next?: string | null) {
  const out = { heart: counts.heart ?? 0, star: counts.star ?? 0, clap: counts.clap ?? 0, idea: counts.idea ?? 0 };
  if (next != null && !Object.keys(out).includes(next)) throw new ApiError(400, '응원을 선택해 주세요.');
  if (previous && previous in out) out[previous as keyof typeof out] = Math.max(0, out[previous as keyof typeof out] - 1);
  if (next) out[next as keyof typeof out]++;
  return out;
}
