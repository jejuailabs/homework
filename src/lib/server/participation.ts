import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { bucket, db } from './admin';
import { assertOrigin, getContext, type Context } from './auth';
import { ApiError, canManageClass, id, text } from './policy';
import { BOARD_PAGE_LIMIT, BOARD_POST_LIMIT, BOARD_STORAGE_LIMIT, assertBoardOwner, assertBoardWrite, boardPostInput, boardSettings, boardUploadPolicy, canViewBoard, canViewBoardComment, canViewBoardPost, canWriteBoard, changedReaction, isBoardOwner } from './participation-policy';
import type { BoardAttachment, BoardAuthor, BoardComment, BoardPost, ParticipationBoard } from '../participation-types';

type Data = Record<string, any>;
type StoredBoard = Data & { id: string; ownerUid: string; classId: string; status: string };
const now = () => new Date().toISOString();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const boardRef = (boardId: string) => db().doc(`participationBoards/${id(boardId)}`);
const postRef = (boardId: string, postId: string) => boardRef(boardId).collection('posts').doc(id(postId));
const uploadRef = (boardId: string, uploadId: string) => boardRef(boardId).collection('uploads').doc(id(uploadId));
const engagementRef = (boardId: string, uid: string, postId: string) => boardRef(boardId).collection('engagement').doc(hash(uid)).collection('posts').doc(id(postId));
const quotaRef = (uid: string) => db().doc(`participationStorage/${uid}`);
const map = (doc: FirebaseFirestore.DocumentSnapshot): Data => ({ ...doc.data(), id: doc.id });
const asBoard = (doc: FirebaseFirestore.DocumentSnapshot) => map(doc) as StoredBoard;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const authorRecord = (ctx: Context) => ({ authorUid: ctx.uid, authorRole: ctx.role === 'student' ? 'student' : 'teacher', authorName: ctx.displayName ?? '선생님', authorStudentId: ctx.studentId ?? '', authorNumber: 0, authorCharacter: 'cat' });
async function author(ctx: Context) {
  const record = authorRecord(ctx);
  if (ctx.role !== 'student') return record;
  const student = (await db().doc(`classes/${id(ctx.classId)}/students/${id(ctx.studentId)}`).get()).data();
  if (!student || student.disabled) throw new ApiError(403, '학생 정보를 다시 확인해 주세요.');
  return { ...record, authorName: student.name, authorNumber: student.number, authorCharacter: student.character ?? 'cat' };
}
async function body(request: Request): Promise<Data> {
  const raw = await request.text();
  if (raw.length > 80_000) throw new ApiError(413, '입력 내용이 너무 길어요.');
  let result: unknown;
  try { result = JSON.parse(raw); } catch { throw new ApiError(400, '입력 내용을 확인해 주세요.'); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new ApiError(400, '입력 내용을 확인해 주세요.');
  return result as Data;
}
function requestKey(input: Data, ctx: Context, action: string) {
  return hash(`${ctx.uid}:${action}:${id(input.requestId, '요청 번호')}`).slice(0, 40);
}
function publicBoard(ctx: Context, board: StoredBoard): ParticipationBoard {
  const { id, classId, className, title, description, layout, theme, character, status, commentsEnabled, reactionsEnabled, moderation, anonymous, revealMode, revealed, sections, sort, postCount, participantCount, createdAt, updatedAt } = board;
  return { id, classId, className, title, description, layout, theme, character, status: status as ParticipationBoard['status'], commentsEnabled, reactionsEnabled, moderation, anonymous, revealMode, revealed, sections, sort, postCount, participantCount, createdAt, updatedAt, canManage: isBoardOwner(ctx, board), canPost: canWriteBoard(ctx, board) };
}
function publicAuthor(ctx: Context, board: StoredBoard, item: Data): BoardAuthor {
  const own = ctx.uid === item.authorUid;
  const masked = board.anonymous && item.authorRole === 'student' && !isBoardOwner(ctx, board) && !own;
  return {
    name: masked ? `친구 ${hash(`${board.id}:${item.authorUid}`).slice(0, 4).toUpperCase()}` : item.authorName,
    character: item.authorCharacter ?? 'cat', isTeacher: item.authorRole !== 'student', isMe: own,
    ...(!masked && item.authorStudentId ? { studentId: item.authorStudentId, number: item.authorNumber } : {}),
  };
}
async function attachmentView(value: Data): Promise<BoardAttachment> {
  const expires = Date.now() + 15 * 60_000;
  const [url] = await bucket().file(value.path).getSignedUrl({ action: 'read', expires, responseDisposition: value.kind === 'file' ? `attachment; filename*=UTF-8''${encodeURIComponent(value.name)}` : 'inline' });
  const thumbnailUrl = value.thumbnailPath ? (await bucket().file(value.thumbnailPath).getSignedUrl({ action: 'read', expires }))[0] : undefined;
  return { id: value.id, name: value.name, contentType: value.contentType, size: value.size, kind: value.kind, url, ...(thumbnailUrl ? { thumbnailUrl } : {}) };
}
async function postView(ctx: Context, board: StoredBoard, value: Data, engagement?: Data | null): Promise<BoardPost> {
  const mine = engagement === undefined ? (await engagementRef(board.id, ctx.uid, value.id).get()).data() : engagement;
  const poll = value.poll ? { ...value.poll, ...(mine?.vote ? { ownVote: mine.vote } : {}) } : null;
  return {
    id: value.id, boardId: board.id, title: value.title, body: value.body, sectionId: value.sectionId,
    color: value.color, author: publicAuthor(ctx, board, value), attachments: await Promise.all((value.attachments ?? []).map(attachmentView)),
    link: value.link, status: value.status, pinned: value.pinned, order: value.order, x: value.x, y: value.y,
    location: value.location ?? null, poll, reactionCounts: value.reactionCounts ?? changedReaction(),
    ...(mine?.reaction ? { ownReaction: mine.reaction } : {}), commentCount: value.commentCount ?? 0,
    createdAt: value.createdAt, updatedAt: value.updatedAt, version: value.version,
    canEdit: canWriteBoard(ctx, board) && (isBoardOwner(ctx, board) || value.authorUid === ctx.uid),
  };
}
function commentView(ctx: Context, board: StoredBoard, value: Data): BoardComment {
  return { id: value.id, text: value.text, author: publicAuthor(ctx, board, value), status: value.status, createdAt: value.createdAt, updatedAt: value.updatedAt, canEdit: canWriteBoard(ctx, board) && (isBoardOwner(ctx, board) || value.authorUid === ctx.uid) };
}
async function loadBoard(ctx: Context, boardId: string) {
  const snapshot = await boardRef(boardId).get();
  if (!snapshot.exists || !canViewBoard(ctx, asBoard(snapshot))) throw new ApiError(404, '우리 반 보드를 찾을 수 없어요.', 'NOT_FOUND');
  return asBoard(snapshot);
}
function requirePost(ctx: Context, board: StoredBoard, snapshot: FirebaseFirestore.DocumentSnapshot) {
  if (!snapshot.exists || !canViewBoardPost(ctx, board, snapshot.data() as any)) throw new ApiError(404, '게시물을 찾을 수 없어요.', 'NOT_FOUND');
  return map(snapshot);
}
async function loadPost(ctx: Context, board: StoredBoard, postId: string) { return requirePost(ctx, board, await postRef(board.id, postId).get()); }
async function managedClass(ctx: Context, classId: string) {
  const cls = await db().doc(`classes/${id(classId)}`).get();
  if (!cls.exists || !canManageClass(ctx.role, ctx.uid, cls.data()?.ownerUid)) throw new ApiError(403, '이 학급을 관리할 권한이 없어요.', 'FORBIDDEN');
  return map(cls);
}
async function list(ctx: Context, request: Request) {
  const params = new URL(request.url).searchParams;
  const classId = params.get('classId') ? id(params.get('classId')) : ctx.classId;
  if (ctx.role === 'student' && classId !== ctx.classId) throw new ApiError(403, '우리 반 보드만 볼 수 있어요.', 'FORBIDDEN');
  if (ctx.role !== 'student' && classId) await managedClass(ctx, classId);
  const cursorScope = hash(`${ctx.uid}:${classId ?? 'all'}`);
  let query = db().collection('participationBoards').where(classId ? 'classId' : 'ownerUid', '==', classId ?? ctx.uid).orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
  if (params.get('cursor')) {
    try {
      const raw = params.get('cursor')!;
      if (raw.length > 1000) throw new Error();
      const cursor = JSON.parse(Buffer.from(raw, 'base64url').toString());
      if (cursor.scope !== cursorScope || typeof cursor.createdAt !== 'string' || !Number.isFinite(Date.parse(cursor.createdAt))) throw new Error();
      query = query.startAfter(cursor.createdAt, id(cursor.id));
    } catch { throw new ApiError(400, '보드 목록을 새로 열어 주세요.', 'INVALID_CURSOR'); }
  }
  const [page, classes] = await Promise.all([
    query.limit(51).get(),
    ctx.role === 'student' ? db().doc(`classes/${id(ctx.classId)}`).get().then(doc => [doc]) : db().collection('classes').where('ownerUid', '==', ctx.uid).limit(100).get().then(s => s.docs),
  ]);
  const items = page.docs.slice(0, 50);
  const last = items.at(-1);
  return json({ boards: items.map(asBoard).filter(b => canViewBoard(ctx, b)).map(b => publicBoard(ctx, b)), classes: classes.map(d => ({ id: d.id, name: d.data()?.name ?? '', studentCount: d.data()?.studentCount ?? 0 })), viewerRole: ctx.role === 'student' ? 'student' : 'teacher', viewerId: ctx.uid, nextCursor: page.size > 50 && last ? Buffer.from(JSON.stringify({ scope: cursorScope, createdAt: last.data().createdAt, id: last.id })).toString('base64url') : null });
}
async function create(ctx: Context, request: Request, source?: StoredBoard) {
  const input = await body(request);
  if (source) assertBoardOwner(ctx, source);
  const classId = source?.classId ?? id(input.classId);
  const cls = await managedClass(ctx, classId);
  const key = requestKey(input, ctx, source ? `duplicate:${source.id}` : 'board');
  const ref = boardRef(key);
  const settings = source ? { title: input.title ?? `${source.title} 사본`, description: source.description, layout: source.layout, theme: source.theme, character: source.character, sections: source.sections, moderation: source.moderation, anonymous: source.anonymous, commentsEnabled: source.commentsEnabled, reactionsEnabled: source.reactionsEnabled, revealMode: source.revealMode, revealed: !source.revealMode, sort: source.sort } : boardSettings(input);
  const value = {
    classId, className: cls.name, ownerUid: ctx.uid, title: text(settings.title ?? input.title, '보드 제목', 120), description: '',
    layout: 'wall', theme: 'peach', character: 'cat', status: 'open', commentsEnabled: true, reactionsEnabled: true,
    moderation: false, anonymous: false, revealMode: false, revealed: true, sections: [], sort: 'manual', ...boardSettings(settings),
    postCount: 0, participantCount: 0, createdAt: now(), updatedAt: now(),
  };
  const result = await db().runTransaction(async tx => {
    const [existing, scope] = await Promise.all([tx.get(ref), tx.get(db().doc(`classes/${classId}`))]);
    if (!scope.exists || scope.data()?.ownerUid !== ctx.uid) throw new ApiError(403, '학급 권한을 확인해 주세요.');
    if (existing.exists) return asBoard(existing);
    tx.create(ref, value);
    return { id: ref.id, ...value } as StoredBoard;
  });
  return json({ board: publicBoard(ctx, result) }, 201);
}
async function detail(ctx: Context, board: StoredBoard, request: Request) {
  const params = new URL(request.url).searchParams;
  const cursor = params.get('cursor');
  if (!cursor && params.get('since') === board.updatedAt) return json({ board: publicBoard(ctx, board), posts: [], nextCursor: null, viewerRole: ctx.role === 'student' ? 'student' : 'teacher', viewerId: ctx.uid, unchanged: true });
  let query = boardRef(board.id).collection('posts').where('deleted', '==', false).orderBy(FieldPath.documentId());
  if (cursor) query = query.startAfter(id(cursor));
  const page = await query.limit(BOARD_PAGE_LIMIT + 1).get();
  const docs = page.docs.slice(0, BOARD_PAGE_LIMIT);
  const visible = docs.filter(doc => canViewBoardPost(ctx, board, doc.data() as any));
  const reactionQueries = [];
  for (let offset = 0; offset < visible.length; offset += 30) reactionQueries.push(boardRef(board.id).collection('engagement').doc(hash(ctx.uid)).collection('posts').where(FieldPath.documentId(), 'in', visible.slice(offset, offset + 30).map(d => d.id)).get());
  const reactions = await Promise.all(reactionQueries);
  const own = new Map(reactions.flatMap(result => result.docs.map(doc => [doc.id, doc.data()] as const)));
  return json({ board: publicBoard(ctx, board), posts: await Promise.all(visible.map(doc => postView(ctx, board, map(doc), own.get(doc.id) ?? null))), viewerRole: ctx.role === 'student' ? 'student' : 'teacher', viewerId: ctx.uid, nextCursor: page.size > BOARD_PAGE_LIMIT ? docs.at(-1)!.id : null });
}
async function settings(ctx: Context, board: StoredBoard, request: Request) {
  assertBoardOwner(ctx, board);
  const patch = request.method === 'DELETE' ? { status: 'archived' as const } : boardSettings(await body(request));
  const updated = await db().runTransaction(async tx => {
    const fresh = asBoard(await tx.get(boardRef(board.id))); assertBoardOwner(ctx, fresh);
    const result = { ...fresh, ...patch, updatedAt: now() };
    tx.update(boardRef(board.id), { ...patch, updatedAt: result.updatedAt });
    return result;
  });
  return json({ board: publicBoard(ctx, updated) });
}
async function checkAttachments(tx: FirebaseFirestore.Transaction, board: StoredBoard, ctx: Context, ids: string[], previous: Data[] = []): Promise<Data[]> {
  const records = await Promise.all(ids.map(key => tx.get(uploadRef(board.id, key))));
  return records.map((doc, i) => {
    const old = previous.find(a => a.id === ids[i]);
    if (old) return old;
    const value = doc.data();
    if (!value || value.userUid !== ctx.uid || value.status !== 'ready' || value.consumedBy) throw new ApiError(400, '이 보드에 올린 첨부파일을 확인해 주세요.', 'UPLOAD_INVALID');
    return { id: doc.id, name: value.name, contentType: value.contentType, size: value.size, kind: value.kind, path: value.path, ...(value.thumbnailPath ? { thumbnailPath: value.thumbnailPath } : {}) };
  });
}
function contentPresent(post: Data) {
  if (!post.title && !post.body && !post.link && !post.attachments.length && !post.poll && !post.location) throw new ApiError(400, '글을 적거나 자료를 첨부해 주세요.', 'EMPTY_POST');
}
function contentVersion(post: Data) {
  const { title, body, sectionId, color, attachments, link, x, y, location, poll, version } = post;
  return { title, body, sectionId, color, attachments, link, x, y, location, poll, version, createdAt: now() };
}
async function createPost(ctx: Context, board: StoredBoard, request: Request) {
  assertBoardWrite(ctx, board);
  const input = await body(request);
  const key = requestKey(input, ctx, `post:${board.id}`);
  const ref = postRef(board.id, key);
  const authorData = await author(ctx);
  const result = await db().runTransaction(async tx => {
    const [freshDoc, existing, participation] = await Promise.all([tx.get(boardRef(board.id)), tx.get(ref), tx.get(boardRef(board.id).collection('participants').doc(hash(ctx.uid)))]);
    const fresh = asBoard(freshDoc); assertBoardWrite(ctx, fresh);
    if (existing.exists) { if (existing.data()?.deleted) throw new ApiError(409, '이미 삭제한 글이에요. 새 글로 작성해 주세요.'); return { board: fresh, post: map(existing) }; }
    if (fresh.postCount >= BOARD_POST_LIMIT) throw new ApiError(409, `한 보드에는 ${BOARD_POST_LIMIT}개의 글까지 모을 수 있어요.`);
    const parsed = boardPostInput(input, fresh);
    const attachments = await checkAttachments(tx, fresh, ctx, parsed.uploadIds ?? []);
    const { uploadIds: _uploads, status: _status, pinned: _pinned, ...content } = parsed;
    const placement = (fresh.postSequence ?? fresh.postCount ?? 0) % BOARD_POST_LIMIT;
    const value = {
      title: '', body: '', sectionId: '', color: fresh.theme, link: '', x: 18 + (placement % 4) * 320, y: 18 + Math.floor(placement / 4) * 600, location: null, poll: null, ...content, attachments,
      ...authorData, status: fresh.moderation && !isBoardOwner(ctx, fresh) ? 'pending' : 'published', pinned: false,
      order: Date.now(), reactionCounts: changedReaction(), commentCount: 0, totalCommentWrites: 0, deleted: false, version: 1, createdAt: now(), updatedAt: now(),
    };
    if (value.poll) value.poll = { ...value.poll, options: value.poll.options.map((v: Data) => ({ ...v, count: 0 })), totalVotes: 0 } as any;
    contentPresent(value);
    tx.create(ref, value);
    attachments.forEach(a => tx.update(uploadRef(board.id, a.id), { consumedBy: key }));
    const first = !(participation.data()?.postCount || participation.data()?.commentCount);
    tx.set(participation.ref, { ...authorData, postCount: (participation.data()?.postCount ?? 0) + 1, commentCount: participation.data()?.commentCount ?? 0, updatedAt: now() });
    tx.update(boardRef(board.id), { postCount: (fresh.postCount ?? 0) + 1, postSequence: (fresh.postSequence ?? fresh.postCount ?? 0) + 1, participantCount: (fresh.participantCount ?? 0) + (first && ctx.role === 'student' ? 1 : 0), updatedAt: now() });
    return { board: fresh, post: { id: key, ...value } };
  });
  return json({ post: await postView(ctx, result.board, result.post) }, 201);
}
async function mutatePost(ctx: Context, board: StoredBoard, postId: string, request: Request, restoring = false) {
  const input = request.method === 'DELETE' ? {} : await body(request);
  const ref = postRef(board.id, postId);
  const result = await db().runTransaction(async tx => {
    const [freshDoc, snapshot] = await Promise.all([tx.get(boardRef(board.id)), tx.get(ref)]);
    const fresh = asBoard(freshDoc); assertBoardWrite(ctx, fresh);
    const post = requirePost(ctx, fresh, snapshot);
    const owner = isBoardOwner(ctx, fresh);
    if (!owner && post.authorUid !== ctx.uid) throw new ApiError(403, '내가 쓴 글만 수정할 수 있어요.');
    if (request.method === 'DELETE') {
      const replies = await tx.get(ref.collection('comments').where('deleted', '==', false).limit(300));
      const deltas = new Map<string, { posts: number; comments: number }>([[post.authorUid, { posts: 1, comments: 0 }]]);
      for (const reply of replies.docs) {
        const uid = reply.data().authorUid;
        const delta = deltas.get(uid) ?? { posts: 0, comments: 0 };
        delta.comments++; deltas.set(uid, delta);
      }
      const people = await Promise.all([...deltas.keys()].map(uid => tx.get(boardRef(board.id).collection('participants').doc(hash(uid)))));
      let lostParticipants = 0;
      for (const person of people) {
        if (!person.exists) continue;
        const previous = person.data()!; const delta = deltas.get(previous.authorUid)!;
        const postCount = Math.max(0, (previous.postCount ?? 0) - delta.posts);
        const commentCount = Math.max(0, (previous.commentCount ?? 0) - delta.comments);
        if (previous.authorRole === 'student' && (previous.postCount || previous.commentCount) && !postCount && !commentCount) lostParticipants++;
        tx.update(person.ref, { postCount, commentCount });
      }
      tx.update(ref, { deleted: true, updatedAt: now() });
      tx.update(boardRef(board.id), { postCount: Math.max(0, (fresh.postCount ?? 0) - 1), participantCount: Math.max(0, (fresh.participantCount ?? 0) - lostParticipants), updatedAt: now() });
      return null;
    }
    if (input.version !== post.version) throw new ApiError(409, '글이 변경되었어요. 최신 글을 확인한 뒤 다시 저장해 주세요.', 'VERSION_CONFLICT');
    let parsed = boardPostInput(input, fresh);
    let restored: Data | undefined;
    if (restoring) {
      const revision = await tx.get(ref.collection('versions').doc(id(input.versionId)));
      if (!revision.exists) throw new ApiError(404, '이전 내용을 찾을 수 없어요.');
      restored = revision.data()!;
      parsed = boardPostInput(restored, fresh);
    }
    if (!owner && ('status' in input || 'pinned' in input)) throw new ApiError(403, '공개·고정은 선생님이 설정해요.');
    const attachments = restored?.attachments ?? (parsed.uploadIds ? await checkAttachments(tx, fresh, ctx, parsed.uploadIds, post.attachments) : post.attachments);
    if (!restoring && parsed.poll !== undefined && JSON.stringify(parsed.poll) !== JSON.stringify(post.poll ? { question: post.poll.question, options: post.poll.options.map((v: Data) => ({ id: v.id, text: v.text })) } : null) && post.poll?.totalVotes > 0) throw new ApiError(409, '투표가 시작된 질문은 바꿀 수 없어요. 새 투표를 만들어 주세요.');
    if (restoring && post.poll?.totalVotes > 0) throw new ApiError(409, '투표가 진행된 글은 이전 버전으로 되돌릴 수 없어요.');
    const { uploadIds: _uploads, ...changes } = parsed;
    const changedContent = Object.keys(changes).some(k => !['status', 'pinned'].includes(k)) || parsed.uploadIds !== undefined || restoring;
    const value: Data = { ...post, ...changes, attachments, version: post.version + 1, updatedAt: now() };
    if (parsed.poll !== undefined) value.poll = post.poll?.totalVotes ? post.poll : parsed.poll ? { ...parsed.poll, options: parsed.poll.options.map(v => ({ ...v, count: 0 })), totalVotes: 0 } : null;
    if (!owner && changedContent && fresh.moderation) value.status = 'pending';
    contentPresent(value);
    tx.set(ref.collection('versions').doc(String(post.version)), contentVersion(post));
    if (post.version > 20) tx.delete(ref.collection('versions').doc(String(post.version - 20)));
    const { id: _id, ...record } = value;
    tx.set(ref, record);
    attachments.filter((a: Data) => !post.attachments.some((p: Data) => p.id === a.id)).forEach((a: Data) => { if (!restoring) tx.update(uploadRef(board.id, a.id), { consumedBy: post.id }); });
    tx.update(boardRef(board.id), { updatedAt: now() });
    return { board: fresh, post: value };
  });
  return result ? json({ post: await postView(ctx, result.board, result.post) }) : json({ ok: true });
}
async function versions(ctx: Context, board: StoredBoard, postId: string) {
  const post = await loadPost(ctx, board, postId);
  if (!isBoardOwner(ctx, board) && post.authorUid !== ctx.uid) throw new ApiError(403, '내 글의 수정 이력만 볼 수 있어요.');
  const revisions = await postRef(board.id, postId).collection('versions').limit(20).get();
  return json({ versions: revisions.docs.map(d => ({ id: d.id, version: d.data().version, title: d.data().title, body: d.data().body, link: d.data().link, createdAt: d.data().createdAt })).sort((a, b) => b.version - a.version) });
}
async function comments(ctx: Context, board: StoredBoard, postId: string, request: Request, commentId?: string) {
  const collection = postRef(board.id, postId).collection('comments');
  if (request.method === 'GET') {
    const post = await loadPost(ctx, board, postId);
    const docs = await collection.where('deleted', '==', false).limit(300).get();
    return json({ comments: docs.docs.filter(d => canViewBoardComment(ctx, board, post as any, d.data() as any)).map(d => commentView(ctx, board, map(d))).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) });
  }
  const input = request.method === 'DELETE' ? {} : await body(request);
  const ref = collection.doc(commentId ? id(commentId) : requestKey(input, ctx, `comment:${board.id}:${postId}`));
  const authorData = await author(ctx);
  const result = await db().runTransaction(async tx => {
    const [freshDoc, snapshot, existing, participation] = await Promise.all([tx.get(boardRef(board.id)), tx.get(postRef(board.id, postId)), tx.get(ref), tx.get(boardRef(board.id).collection('participants').doc(hash(ctx.uid)))]);
    const fresh = asBoard(freshDoc); assertBoardWrite(ctx, fresh);
    const post = requirePost(ctx, fresh, snapshot);
    if (!fresh.commentsEnabled && !isBoardOwner(ctx, fresh)) throw new ApiError(403, '댓글을 잠시 닫아 두었어요.');
    if (request.method === 'POST' && existing.exists) {
      if (existing.data()?.deleted) throw new ApiError(409, '이미 삭제한 댓글이에요.');
      return { board: fresh, comment: map(existing) };
    }
    if (request.method !== 'POST') {
      if (!existing.exists || !canViewBoardComment(ctx, fresh, post as any, existing.data() as any)) throw new ApiError(404, '댓글을 찾을 수 없어요.');
      if (!isBoardOwner(ctx, fresh) && existing.data()?.authorUid !== ctx.uid) throw new ApiError(403, '내 댓글만 수정할 수 있어요.');
      if (request.method === 'DELETE') {
        const originalAuthor = await tx.get(boardRef(board.id).collection('participants').doc(hash(existing.data()!.authorUid)));
        const losesParticipant = existing.data()!.authorRole === 'student' && originalAuthor.data()?.commentCount === 1 && !(originalAuthor.data()?.postCount);
        tx.update(ref, { deleted: true, updatedAt: now() }); tx.update(snapshot.ref, { commentCount: Math.max(0, post.commentCount - 1) });
        if (originalAuthor.exists) tx.update(originalAuthor.ref, { commentCount: Math.max(0, (originalAuthor.data()?.commentCount ?? 0) - 1) });
        tx.update(boardRef(board.id), { participantCount: Math.max(0, (fresh.participantCount ?? 0) - (losesParticipant ? 1 : 0)), updatedAt: now() });
        return null;
      }
      const changes: Data = { updatedAt: now() };
      if ('text' in input) { changes.text = text(input.text, '댓글', 2000); if (fresh.moderation && !isBoardOwner(ctx, fresh)) changes.status = 'pending'; }
      if ('status' in input) { assertBoardOwner(ctx, fresh); if (!['published', 'pending', 'hidden'].includes(input.status)) throw new ApiError(400, '댓글 상태를 확인해 주세요.'); changes.status = input.status; }
      tx.update(ref, changes); tx.update(boardRef(board.id), { updatedAt: now() }); return { board: fresh, comment: { ...map(existing), ...changes } };
    }
    if (post.commentCount >= 300) throw new ApiError(409, '한 글에는 댓글 300개까지 남길 수 있어요. 새 글에서 이야기를 이어 주세요.');
    const value = { text: text(input.text, '댓글', 2000), ...authorData, status: fresh.moderation && !isBoardOwner(ctx, fresh) ? 'pending' : 'published', deleted: false, createdAt: now(), updatedAt: now() };
    tx.create(ref, value); tx.update(snapshot.ref, { commentCount: (post.commentCount ?? 0) + 1, totalCommentWrites: (post.totalCommentWrites ?? post.commentCount ?? 0) + 1 });
    tx.set(participation.ref, { ...authorData, postCount: participation.data()?.postCount ?? 0, commentCount: (participation.data()?.commentCount ?? 0) + 1, updatedAt: now() });
    tx.update(boardRef(board.id), { updatedAt: now(), participantCount: (fresh.participantCount ?? 0) + (!(participation.data()?.postCount || participation.data()?.commentCount) && ctx.role === 'student' ? 1 : 0) });
    return { board: fresh, comment: { ...value, id: ref.id } };
  });
  return result ? json({ comment: commentView(ctx, result.board, result.comment) }, request.method === 'POST' ? 201 : 200) : json({ ok: true });
}
async function engagement(ctx: Context, board: StoredBoard, postId: string, request: Request, voting = false) {
  const input = await body(request);
  const ref = postRef(board.id, postId);
  const ownRef = engagementRef(board.id, ctx.uid, postId);
  const result = await db().runTransaction(async tx => {
    const [freshDoc, snapshot, previous] = await Promise.all([tx.get(boardRef(board.id)), tx.get(ref), tx.get(ownRef)]);
    const fresh = asBoard(freshDoc); assertBoardWrite(ctx, fresh);
    const post = requirePost(ctx, fresh, snapshot);
    if (post.status !== 'published') throw new ApiError(403, '공개된 글에 참여해 주세요.');
    if (voting) {
      const optionId = id(input.optionId);
      if (!post.poll || !post.poll.options.some((o: Data) => o.id === optionId)) throw new ApiError(400, '투표 선택지를 확인해 주세요.');
      const old = previous.data()?.vote;
      const options = post.poll.options.map((o: Data) => ({ ...o, count: Math.max(0, o.count - (old === o.id ? 1 : 0)) + (optionId === o.id ? 1 : 0) }));
      const poll = { ...post.poll, options, totalVotes: post.poll.totalVotes + (old ? 0 : 1) };
      tx.set(ownRef, { vote: optionId }, { merge: true }); tx.update(ref, { poll }); tx.update(boardRef(board.id), { updatedAt: now() });
      return { poll: { ...poll, ownVote: optionId } };
    }
    if (!fresh.reactionsEnabled) throw new ApiError(403, '응원이 꺼져 있어요.');
    const kind = input.kind === null ? null : text(input.kind, '응원', 10);
    const reactionCounts = changedReaction(post.reactionCounts, previous.data()?.reaction, kind);
    tx.set(ownRef, { reaction: kind }, { merge: true }); tx.update(ref, { reactionCounts }); tx.update(boardRef(board.id), { updatedAt: now() });
    return { reactionCounts, ownReaction: kind };
  });
  return json(result);
}
async function reorder(ctx: Context, board: StoredBoard, request: Request) {
  assertBoardOwner(ctx, board);
  const input = await body(request);
  if (!Array.isArray(input.posts) || input.posts.length < 1 || input.posts.length > BOARD_POST_LIMIT) throw new ApiError(400, '정리할 게시물을 선택해 주세요.');
  if (new Set(input.posts.map((p: Data) => p.id)).size !== input.posts.length) throw new ApiError(400, '게시물이 반복되어 있어요.');
  await db().runTransaction(async tx => {
    const fresh = asBoard(await tx.get(boardRef(board.id))); assertBoardOwner(ctx, fresh);
    const entries = input.posts.map((p: Data) => {
      if (typeof p.order !== 'number' || !Number.isFinite(p.order) || Math.abs(p.order) > Number.MAX_SAFE_INTEGER) throw new ApiError(400, '순서를 확인해 주세요.');
      const data = boardPostInput(p, fresh);
      return { ref: postRef(board.id, id(p.id)), patch: { order: p.order, ...('sectionId' in data ? { sectionId: data.sectionId } : {}), ...('x' in data ? { x: data.x } : {}), ...('y' in data ? { y: data.y } : {}) } };
    });
    const snapshots = await Promise.all(entries.map((e: Data) => tx.get(e.ref)));
    if (snapshots.some(s => !s.exists || s.data()?.deleted)) throw new ApiError(409, '게시물이 변경되었어요. 다시 확인해 주세요.');
    entries.forEach((e: Data) => tx.update(e.ref, e.patch));
    tx.update(boardRef(board.id), { updatedAt: now() });
  });
  return json({ ok: true });
}
async function participants(ctx: Context, board: StoredBoard) {
  assertBoardOwner(ctx, board);
  const [roster, participation] = await Promise.all([db().collection(`classes/${board.classId}/students`).get(), boardRef(board.id).collection('participants').limit(500).get()]);
  const records = new Map(participation.docs.map(doc => [doc.data().authorStudentId, doc.data()]));
  return json({ students: roster.docs.filter(doc => !doc.data().disabled).map(doc => ({ id: doc.id, name: doc.data().name, number: doc.data().number, character: doc.data().character ?? 'cat', postCount: records.get(doc.id)?.postCount ?? 0, commentCount: records.get(doc.id)?.commentCount ?? 0 })).sort((a, b) => a.number - b.number) });
}

/** Expired upload capabilities get a grace period before cleanup. Reserve accounting is released
 * only after all unreferenced physical bytes are deleted; published assets are never removed. */
async function cleanupUploads(board: StoredBoard) {
  const cutoff = new Date(Date.now() - 60 * 60_000).toISOString();
  const stale = await quotaRef(board.ownerUid).collection('uploads').where('expiresAt', '<=', cutoff).orderBy('expiresAt').limit(20).get();
  let cleaned = 0;
  for (const queue of stale.docs) {
    const doc = await uploadRef(id(queue.data().boardId), id(queue.data().uploadId)).get();
    if (!doc.exists) { await queue.ref.delete(); continue; }
    const uploadBoardId = id(queue.data().boardId);
    const cleanupLease = randomUUID();
    const claimed = await db().runTransaction(async tx => {
      const snapshot = await tx.get(doc.ref); const value = snapshot.data();
      if (!value || value.expiresAt > cutoff || value.status === 'cleaned') return null;
      if (value.status === 'processing' && Date.parse(value.processingAt) > Date.now() - 120000) return null;
      if (value.status === 'cleanup' && Date.parse(value.cleanupAt) > Date.now() - 120000) return null;
      tx.update(doc.ref, { status: 'cleanup', cleanupLease, cleanupAt: now(), previousStatus: value.previousStatus ?? value.status });
      return value;
    });
    if (!claimed) continue;
    const paths = [claimed.tempPath];
    if (!claimed.consumedBy) paths.push(`participation-assets/${uploadBoardId}/${doc.id}/original`, `participation-assets/${uploadBoardId}/${doc.id}/thumbnail.webp`);
    const deleted = await Promise.allSettled(paths.map(path => bucket().file(path).delete({ ignoreNotFound: true })));
    if (deleted.some(r => r.status === 'rejected')) continue;
    await db().runTransaction(async tx => {
      const [snapshot, quota] = await Promise.all([tx.get(doc.ref), tx.get(quotaRef(board.ownerUid))]);
      const value = snapshot.data();
      if (value?.cleanupLease !== cleanupLease || value.status !== 'cleanup') return;
      if (value.consumedBy) tx.update(doc.ref, { status: 'ready', expiresAt: '2100-01-01T00:00:00.000Z', tempCleanedAt: now() });
      else {
        const wasReady = value.previousStatus === 'ready';
        tx.set(quota.ref, { usedBytes: Math.max(0, (quota.data()?.usedBytes ?? 0) - (wasReady ? value.actualBytes ?? value.size : 0)), reservedBytes: Math.max(0, (quota.data()?.reservedBytes ?? 0) - (wasReady ? 0 : value.reservedBytes)), limitBytes: BOARD_STORAGE_LIMIT });
        tx.update(doc.ref, { status: 'cleaned', expiresAt: '2100-01-01T00:00:00.000Z', cleanedAt: now() });
      }
      tx.delete(queue.ref);
      cleaned++;
    });
  }
  return cleaned;
}

/** Uploads use a signed, exact-length PUT into a temporary path. Finalization copies to an
 * immutable path, so reusing a still-valid upload URL cannot modify an already published file. */
async function initUpload(ctx: Context, board: StoredBoard, request: Request) {
  assertBoardWrite(ctx, board);
  const input = await body(request);
  const policy = boardUploadPolicy(input.contentType, input.size);
  const key = requestKey(input, ctx, `upload:${board.id}`);
  const name = text(input.name, '파일 이름', 200).replace(/[\r\n\x00-\x1f]/g, '');
  const ref = uploadRef(board.id, key);
  const tempPath = `participation-uploads/${board.id}/${key}`;
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const reserve = policy.size + (policy.kind === 'image' ? 4 * 1024 ** 2 : 0);
  await cleanupUploads(board);
  const value = await db().runTransaction(async tx => {
    const [freshDoc, existing, quota] = await Promise.all([tx.get(boardRef(board.id)), tx.get(ref), tx.get(quotaRef(board.ownerUid))]);
    assertBoardWrite(ctx, asBoard(freshDoc));
    if (existing.exists) {
      const old = existing.data()!;
      if (old.userUid !== ctx.uid || old.status !== 'pending' || old.expiresAt <= now() || old.size !== policy.size || old.contentType !== policy.contentType || old.name !== name) throw new ApiError(409, '파일을 다시 선택해 주세요.');
      return old;
    }
    const used = quota.data()?.usedBytes ?? 0; const reserved = quota.data()?.reservedBytes ?? 0;
    if (used + reserved + reserve > BOARD_STORAGE_LIMIT) throw new ApiError(409, '참여보드 저장 공간이 가득 찼어요. 선생님께 알려 주세요.', 'STORAGE_LIMIT');
    const record = { ...policy, name, tempPath, userUid: ctx.uid, ownerUid: board.ownerUid, status: 'pending', expiresAt, createdAt: now(), reservedBytes: reserve, consumedBy: null };
    tx.create(ref, record); tx.set(quota.ref, { usedBytes: used, reservedBytes: reserved + reserve, limitBytes: BOARD_STORAGE_LIMIT });
    tx.set(quota.ref.collection('uploads').doc(hash(`${board.id}:${key}`)), { boardId: board.id, uploadId: key, expiresAt });
    return record;
  });
  const [uploadUrl] = await bucket().file(tempPath).getSignedUrl({ version: 'v4', action: 'write', expires: new Date(value.expiresAt), contentType: policy.contentType, extensionHeaders: { 'content-length': String(policy.size) } });
  return json({ uploadId: key, uploadUrl, method: 'PUT', headers: { 'Content-Type': policy.contentType }, expiresAt: value.expiresAt });
}
async function validFileHeader(file: ReturnType<ReturnType<typeof bucket>['file']>, value: Data) {
  const [head] = await file.download({ start: 0, end: Math.min(1023, value.size - 1) });
  const type = value.contentType as string;
  const ascii = head.toString('latin1');
  let valid = true;
  if (type === 'application/pdf') valid = ascii.startsWith('%PDF-');
  else if (type.includes('openxmlformats')) valid = head[0] === 0x50 && head[1] === 0x4b;
  else if (type === 'video/mp4' || type === 'video/quicktime' || type === 'audio/mp4') valid = ascii.slice(4, 8) === 'ftyp';
  else if (type.endsWith('/webm')) valid = head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  else if (type === 'audio/ogg') valid = ascii.startsWith('OggS');
  else if (type === 'audio/wav') valid = ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE';
  else if (type === 'audio/mpeg') valid = ascii.startsWith('ID3') || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
  if (!valid) throw new ApiError(400, '파일 내용과 형식이 달라요. 원본 파일을 다시 선택해 주세요.', 'FILE_CONTENT');
}
async function finalizeUpload(ctx: Context, board: StoredBoard, uploadId: string) {
  assertBoardWrite(ctx, board);
  const ref = uploadRef(board.id, uploadId);
  const lease = randomUUID();
  const claimed: Data = await db().runTransaction(async tx => {
    const [freshDoc, snapshot] = await Promise.all([tx.get(boardRef(board.id)), tx.get(ref)]);
    assertBoardWrite(ctx, asBoard(freshDoc));
    const value = snapshot.data();
    if (!value || value.userUid !== ctx.uid) throw new ApiError(404, '파일을 찾을 수 없어요.');
    if (value.status === 'ready') return { ...value, id: snapshot.id };
    if (value.status === 'processing' && Date.parse(value.processingAt) > Date.now() - 120000) throw new ApiError(409, '파일을 준비하고 있어요. 잠시 뒤 다시 시도해 주세요.', 'UPLOAD_PROCESSING');
    if (!['pending', 'processing'].includes(value.status) || value.expiresAt <= now()) throw new ApiError(409, '파일 업로드 시간이 지났어요. 다시 선택해 주세요.');
    tx.update(ref, { status: 'processing', lease, processingAt: now() });
    return { ...value, id: snapshot.id, status: 'processing' };
  });
  if (claimed.status === 'ready') return json({ attachment: await attachmentView(claimed) });
  const value: Data = claimed;
  const file = bucket().file(value.tempPath);
  const path = `participation-assets/${board.id}/${uploadId}/original`;
  const thumbnailPath = `participation-assets/${board.id}/${uploadId}/thumbnail.webp`;
  let actualBytes = value.size;
  try {
    const [metadata] = await file.getMetadata().catch(() => { throw new ApiError(409, '파일 전송을 먼저 마쳐 주세요.', 'UPLOAD_INCOMPLETE'); });
    if (Number(metadata.size) !== value.size || metadata.contentType !== value.contentType) throw new ApiError(400, '파일 정보가 달라요.', 'UPLOAD_MISMATCH');
    const immutableSource = bucket().file(value.tempPath, { generation: metadata.generation });
    const sourceGeneration = String(metadata.generation);
    const reuseImmutable = async (destinationPath: string, action: () => Promise<unknown>) => {
      try { await action(); }
      catch (error) {
        if (Number((error as { code?: unknown }).code) !== 412) throw error;
        const [existing] = await bucket().file(destinationPath).getMetadata();
        if (String(existing.metadata?.sourceGeneration) !== sourceGeneration) throw new ApiError(409, '파일이 업로드 중 변경되었어요. 새 파일로 다시 올려 주세요.', 'UPLOAD_CHANGED');
      }
    };
    await validFileHeader(immutableSource, value);
    if (value.kind === 'image') {
      const [bytes] = await immutableSource.download();
      const processor = sharp(bytes, { limitInputPixels: 40_000_000, animated: false });
      const info = await processor.metadata();
      const expected: Data = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
      if (info.format !== expected[value.contentType]) throw new ApiError(400, '사진 형식을 확인해 주세요.');
      const thumbnail = await processor.rotate().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      actualBytes += thumbnail.byteLength;
      await reuseImmutable(thumbnailPath, () => bucket().file(thumbnailPath).save(thumbnail, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: 'image/webp', cacheControl: 'private,max-age=300', metadata: { sourceGeneration } } }));
    }
    await reuseImmutable(path, () => immutableSource.copy(bucket().file(path), { preconditionOpts: { ifGenerationMatch: 0 }, cacheControl: 'private,max-age=300', metadata: { sourceGeneration, firebaseStorageDownloadTokens: null } }));
    const stored = await db().runTransaction(async tx => {
      const [snapshot, quota, freshDoc] = await Promise.all([tx.get(ref), tx.get(quotaRef(board.ownerUid)), tx.get(boardRef(board.id))]);
      if (snapshot.data()?.lease !== lease || snapshot.data()?.status !== 'processing') throw new ApiError(409, '파일 처리 상태가 바뀌었어요. 다시 확인해 주세요.');
      assertBoardWrite(ctx, asBoard(freshDoc));
      const attachment: Data = { ...value, path, ...(value.kind === 'image' ? { thumbnailPath } : {}), status: 'ready', actualBytes, readyAt: now() };
      const { id: _id, ...record } = attachment;
      tx.update(ref, record);
      tx.set(quota.ref, { usedBytes: (quota.data()?.usedBytes ?? 0) + actualBytes, reservedBytes: Math.max(0, (quota.data()?.reservedBytes ?? 0) - value.reservedBytes), limitBytes: BOARD_STORAGE_LIMIT });
      return attachment;
    });
    await immutableSource.delete({ ignoreNotFound: true }).catch(() => {});
    return json({ attachment: await attachmentView(stored) });
  } catch (error) {
    await db().runTransaction(async tx => { const s = await tx.get(ref); if (s.data()?.lease === lease && s.data()?.status === 'processing') tx.update(ref, { status: 'pending', processingAt: null }); });
    throw error;
  }
}

export async function handleParticipation(request: Request, segments: string[] = []) {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) assertOrigin(request);
    const ctx = await getContext(request);
    segments.forEach(v => id(v));
    const method = request.method;
    if (!segments.length) {
      if (method === 'GET') return await list(ctx, request);
      if (method === 'POST') return await create(ctx, request);
    } else {
      const [boardId, section, postId, action, commentId] = segments;
      const board = await loadBoard(ctx, boardId);
      if (segments.length === 1 && method === 'GET') return await detail(ctx, board, request);
      if (segments.length === 1 && ['PATCH', 'DELETE'].includes(method)) return await settings(ctx, board, request);
      if (segments.length === 2 && section === 'duplicate' && method === 'POST') return await create(ctx, request, board);
      if (segments.length === 2 && section === 'participants' && method === 'GET') return await participants(ctx, board);
      if (segments.length === 2 && section === 'cleanup' && method === 'POST') { assertBoardOwner(ctx, board); return json({ cleaned: await cleanupUploads(board) }); }
      if (segments.length === 2 && section === 'reorder' && method === 'POST') return await reorder(ctx, board, request);
      if (section === 'uploads') {
        if (segments.length === 2 && method === 'POST') return await initUpload(ctx, board, request);
        if (segments.length === 4 && action === 'finalize' && method === 'POST') return await finalizeUpload(ctx, board, postId);
      }
      if (section === 'posts') {
        if (segments.length === 2 && method === 'POST') return await createPost(ctx, board, request);
        if (segments.length === 3 && method === 'GET') return json({ post: await postView(ctx, board, await loadPost(ctx, board, postId)) });
        if (segments.length === 3 && ['PATCH', 'DELETE'].includes(method)) return await mutatePost(ctx, board, postId, request);
        if (action === 'comments' && ((segments.length === 4 && ['GET', 'POST'].includes(method)) || (segments.length === 5 && ['PATCH', 'DELETE'].includes(method)))) return await comments(ctx, board, postId, request, commentId);
        if (segments.length === 4 && action === 'reaction' && method === 'POST') return await engagement(ctx, board, postId, request);
        if (segments.length === 4 && action === 'vote' && method === 'POST') return await engagement(ctx, board, postId, request, true);
        if (segments.length === 4 && action === 'versions' && method === 'GET') return await versions(ctx, board, postId);
        if (segments.length === 4 && action === 'restore' && method === 'POST') return await mutatePost(ctx, board, postId, request, true);
      }
    }
    throw new ApiError(404, '요청한 기능을 찾을 수 없어요.', 'NOT_FOUND');
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message, code: error.code }, error.status);
    console.error('Participation operation failed', (error as { code?: unknown }).code ?? 'INTERNAL');
    return json({ error: '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 'INTERNAL_ERROR' }, 500);
  }
}
