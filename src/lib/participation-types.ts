import type { Character } from './characters';

export const boardLayouts = ['wall', 'columns', 'grid', 'table', 'freeform', 'rows', 'timeline', 'stream', 'map'] as const;
export type BoardLayout = typeof boardLayouts[number];
export const boardThemes = ['peach', 'mint', 'lavender', 'sky', 'lemon', 'rose'] as const;
export type BoardTheme = typeof boardThemes[number];
export type BoardStatus = 'open' | 'frozen' | 'archived';
export type BoardPostStatus = 'published' | 'pending' | 'hidden';
export type BoardReaction = 'heart' | 'star' | 'clap' | 'idea';
export type BoardSection = { id: string; title: string };
export type ParticipationBoard = {
  id: string; classId: string; className: string; title: string; description: string;
  layout: BoardLayout; theme: BoardTheme; character: Character; status: BoardStatus;
  commentsEnabled: boolean; reactionsEnabled: boolean; moderation: boolean;
  anonymous: boolean; revealMode: boolean; revealed: boolean;
  publicViewEnabled: boolean; visitorComments: boolean;
  sections: BoardSection[]; sort: 'manual' | 'newest' | 'oldest';
  postCount: number; participantCount: number; createdAt: string; updatedAt: string;
  canManage: boolean; canPost: boolean;
};
export type BoardAttachment = {
  id: string; name: string; contentType: string; size: number;
  kind: 'image' | 'video' | 'audio' | 'file'; url: string; thumbnailUrl?: string;
};
export type BoardAuthor = { name: string; character: Character; isTeacher: boolean; isVisitor?: boolean; isMe: boolean; studentId?: string; number?: number };
export type BoardPoll = { question: string; options: { id: string; text: string; count: number }[]; ownVote?: string; totalVotes: number };
export type BoardPost = {
  source?: {kind: 'assignment'; title: string; assignmentId?: string};
  id: string; boardId: string; title: string; body: string; sectionId: string; color: BoardTheme;
  author: BoardAuthor; attachments: BoardAttachment[]; link: string;
  status: BoardPostStatus; pinned: boolean; order: number; x: number; y: number;
  location: { lat: number; lng: number; label: string } | null;
  poll: BoardPoll | null; reactionCounts: Record<BoardReaction, number>; ownReaction?: BoardReaction;
  commentCount: number; createdAt: string; updatedAt: string; version: number; canEdit: boolean;
};
export type BoardComment = { id: string; text: string; author: BoardAuthor; status: BoardPostStatus; createdAt: string; updatedAt: string; canEdit: boolean };
export type BoardListResponse = { boards: ParticipationBoard[]; classes: { id: string; name: string; studentCount: number }[]; viewerRole: 'teacher' | 'student'; viewerId: string; nextCursor: string | null };
export type BoardDetailResponse = { board: ParticipationBoard; posts: BoardPost[]; nextCursor: string | null; viewerRole: 'teacher' | 'student'; viewerId: string; unchanged?: boolean };
export type BoardCreateInput = { requestId: string; classId: string; title: string; description?: string; layout?: BoardLayout; theme?: BoardTheme; character?: Character };
export type BoardSettingsInput = Partial<Pick<ParticipationBoard, 'title' | 'description' | 'layout' | 'theme' | 'character' | 'status' | 'commentsEnabled' | 'reactionsEnabled' | 'moderation' | 'anonymous' | 'revealMode' | 'revealed' | 'publicViewEnabled' | 'visitorComments' | 'sections' | 'sort'>>;
export type BoardPostInput = {
  requestId?: string; title?: string; body?: string; sectionId?: string; color?: BoardTheme;
  uploadIds?: string[]; link?: string; x?: number; y?: number;
  location?: { lat: number; lng: number; label: string } | null;
  poll?: { question: string; options: { id: string; text: string }[] } | null;
  status?: BoardPostStatus; pinned?: boolean; version?: number;
};
export type PublicBoardView = Pick<ParticipationBoard, 'id' | 'title' | 'description' | 'className' | 'layout' | 'theme' | 'character' | 'reactionsEnabled' | 'sections' | 'visitorComments'>;
export type PublicBoardResponse = { board: PublicBoardView; posts: BoardPost[]; nextCursor: string | null };
export type BoardUploadResponse = { uploadId: string; uploadUrl: string; method: 'PUT'; headers: Record<string, string>; expiresAt: string };
export type BoardVersion = { id: string; version: number; title: string; body: string; link: string; createdAt: string };

/**
 * All endpoints use existing HttpOnly session auth; mutations require JSON / same origin.
 * GET /api/boards?classId=&cursor= -> BoardListResponse (metadata only, 50/page).
 * POST /api/boards BoardCreateInput -> {board}.
 * GET /api/boards/:id?cursor= -> BoardDetailResponse (100 posts/page).
 * Optional ?since=board.updatedAt returns unchanged:true and no posts if unchanged; omit every 10min to renew media URLs.
 * PATCH /api/boards/:id BoardSettingsInput -> {board}. DELETE archives.
 * POST /api/boards/:id/duplicate {requestId,title?} -> {board} (empty template with same settings).
 * GET /api/boards/:id/participants -> {students:[{id,name,number,character,postCount,commentCount}]} owner only.
 * POST /api/boards/:id/posts BoardPostInput + requestId -> {post}.
 * PATCH /api/boards/:id/posts/:postId BoardPostInput + version -> {post}.
 * DELETE /api/boards/:id/posts/:postId -> {ok:true}.
 * GET/POST /api/boards/:id/posts/:postId/comments -> {comments} / {comment}; POST {requestId,text}.
 * PATCH/DELETE .../comments/:commentId -> {comment}/{ok}; PATCH {text?,status?}.
 * POST .../reaction {kind:BoardReaction|null} -> {reactionCounts,ownReaction}.
 * POST .../vote {optionId} -> {poll}.
 * GET .../versions -> {versions:BoardVersion[]}; POST .../restore {versionId,version} -> {post}.
 * POST /api/boards/:id/reorder {posts:[{id,sectionId?,order,x?,y?}]} -> {ok:true}.
 * POST /api/boards/:id/uploads {requestId,name,contentType,size} -> BoardUploadResponse.
 * PUT uploadUrl using headers and raw file, then POST /api/boards/:id/uploads/:uploadId/finalize -> {attachment}.
 * Use finalized attachment IDs as uploadIds. For edits include IDs of retained attachments too.
 * Teachers own their class boards; students only their authenticated class. Anonymous mode masks peers,
 * not teachers/self. Pending/hidden/reveal-protected posts & comments never reach other students.
 * GET/POST /api/boards/:id/share {rotate?} -> {path} owner only; the token link works only while publicViewEnabled.
 * GET /api/board-view/:token?cursor= -> PublicBoardResponse (published posts only, no sign-in).
 * GET/POST /api/board-view/:token/posts/:postId/comments -> {comments} / {comment}; POST {requestId,authorName,text}
 *   needs visitorComments; visitor comments always wait for teacher approval.
 * Frozen/archived blocks student writes, comments, reactions and uploads; teachers retain management.
 */
