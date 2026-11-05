import 'server-only';
import {createHash} from 'node:crypto';
import {FieldValue} from 'firebase-admin/firestore';
import sharp, {type Metadata} from 'sharp';
import {bucket, db} from './admin';
import {ApiError} from './policy';
import {FILE_CACHE_CONTROL} from '../storage-cache';
import {BOARD_POST_LIMIT, changedReaction} from './participation-policy';
import {EXHIBITION_ARTWORK_LIMIT, EXHIBITION_PIXEL_LIMIT, exhibitionStorageLimit, settleExhibitionBytes} from './exhibition-policy';
import {artworkToday} from '../exhibition-metadata';
import {autoTags} from '../exhibition-tags';
import {moduleOptions} from '@/modules/artwork-extensions/types';
import {homeworkSyncTargets, syncDue, syncableUploads, type HomeworkSync} from './homework-sync-policy';

/**
 * Homework auto-sync: a homework room may own one exhibition and/or one participation board in the same class.
 * Each student's latest submission appears there — one artwork and one post per student, replaced on resubmission.
 * The submission stays the source of truth; a failed sync never touches the submission and is retried on the next
 * trigger (finalize, the student's video status check, or a teacher opening the linked room).
 */
type Data = Record<string, any>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
const stateRef = (assignmentId: string, studentId: string) => db().doc(`homeworkSync/${assignmentId}_${studentId}`);
const RECONCILE_EVERY_MS = 60_000;

type Room = {title: string; description: string; classId: string; cls: Data; ownerUid: string; linkedAssignmentId?: string};
/** A class exhibition open to its students at once; teacher uploads only. Same defaults as the exhibition screen otherwise. */
export function exhibitionRoomValue(room: Room) {
  const stamp = now();
  return {
    title: room.title, description: room.description.slice(0, 2000), classId: room.classId, className: room.cls.name, ownerUid: room.ownerUid,
    status: 'open', commentsEnabled: true, allowStudentUploads: false, publicSharingEnabled: false,
    grade: String(room.cls.grade ?? '').trim() || room.cls.name, year: room.cls.year ?? null, theme: 'cozy', artworkModules: moduleOptions(undefined),
    artworkCount: 0, approvedCount: 0, ...(room.linkedAssignmentId ? {linkedAssignmentId: room.linkedAssignmentId} : {}), createdAt: stamp, updatedAt: stamp,
    tags: autoTags({title: room.title, description: room.description, grade: room.cls.grade, createdAt: stamp, linkedAssignmentId: room.linkedAssignmentId}), tagsEdited: false,
  };
}
/** An open wall board with the board screen's defaults. */
export function boardRoomValue(room: Room) {
  const stamp = now();
  return {
    classId: room.classId, className: room.cls.name, ownerUid: room.ownerUid, title: room.title, description: room.description.slice(0, 2000),
    layout: 'wall', theme: 'peach', character: 'cat', status: 'open', commentsEnabled: true, reactionsEnabled: true,
    moderation: false, anonymous: false, revealMode: false, revealed: true, sections: [], sort: 'manual',
    postCount: 0, participantCount: 0, ...(room.linkedAssignmentId ? {linkedAssignmentId: room.linkedAssignmentId} : {}), createdAt: stamp, updatedAt: stamp,
  };
}

/** Creates the linked rooms inside the homework-room transaction. Exhibitions open to the class at once; boards are open. */
export function createLinkedRooms(tx: FirebaseFirestore.Transaction, input: {assignmentId: string; title: string; description: string; submissionType: string; classId: string; cls: Data; ownerUid: string; sync: unknown}): HomeworkSync {
  const targets = homeworkSyncTargets(input.sync, input.submissionType);
  const result: HomeworkSync = {exhibitionId: null, boardId: null}, room = {title: input.title, description: '', classId: input.classId, cls: input.cls, ownerUid: input.ownerUid, linkedAssignmentId: input.assignmentId};
  if (targets.exhibition) {const ref = db().collection('exhibitions').doc(); tx.create(ref, exhibitionRoomValue({...room, description: input.description})); result.exhibitionId = ref.id;}
  if (targets.board) {const ref = db().doc(`participationBoards/hw_${hash(`homework-board:${input.assignmentId}`).slice(0, 32)}`); tx.create(ref, boardRoomValue(room)); result.boardId = ref.id;}
  return result;
}

async function boardPost(assignment: Data, submission: Data, boardId: string) {
  const boardRef = db().doc(`participationBoards/${boardId}`), postRef = boardRef.collection('posts').doc(hash(`homework-sync:${assignment.id}:${submission.studentId}`));
  const roster = (await db().doc(`classes/${assignment.classId}/students/${submission.studentId}`).get()).data();
  const person = {authorUid: roster?.authUid || `former-${submission.studentId}`, authorRole: 'student', authorName: submission.studentName || roster?.name || '우리 반 작가', authorCharacter: roster?.character || 'cat', authorStudentId: submission.studentId, authorNumber: roster?.number || 0};
  const attachments = (submission.uploads || []).map((item: Data) => ({id: item.id, name: item.fileName, contentType: item.contentType, size: item.size || 0, kind: ['image/jpeg', 'image/png', 'image/webp'].includes(item.contentType) ? 'image' : String(item.contentType).startsWith('video/') ? 'video' : 'file', path: item.path, ...(item.thumbnailPath ? {thumbnailPath: item.thumbnailPath} : {})}));
  const source = {kind: 'assignment', assignmentId: assignment.id, title: assignment.title, version: submission.attemptId, submissionId: submission.id, auto: true};
  await db().runTransaction(async tx => {
    const [board, previous, participation] = await Promise.all([tx.get(boardRef), tx.get(postRef), tx.get(boardRef.collection('participants').doc(hash(person.authorUid)))]);
    const fresh = board.data();
    if (!fresh || fresh.status === 'archived' || fresh.classId !== assignment.classId) return;
    const stamp = now();
    if (previous.exists) {
      // The teacher removed this student's card on purpose; a resubmission does not bring it back.
      if (previous.data()?.deleted) return;
      tx.update(postRef, {body: submission.text || '', attachments, authorName: person.authorName, source, version: (previous.data()?.version || 1) + 1, updatedAt: stamp, ...(previous.data()?.withdrawnByStudent ? {status: 'published', withdrawnByStudent: FieldValue.delete()} : {})});
      tx.update(boardRef, {updatedAt: stamp});
      return;
    }
    if ((fresh.postCount || 0) >= BOARD_POST_LIMIT) throw new ApiError(409, '참여보드가 가득 찼어요.', 'BOARD_FULL');
    const placement = (fresh.postSequence || 0) % BOARD_POST_LIMIT;
    tx.create(postRef, {title: assignment.title, body: submission.text || '', attachments, ...person, sourceAnonymous: false, source, sectionId: '', color: fresh.theme, link: '', x: 18 + (placement % 4) * 320, y: 18 + Math.floor(placement / 4) * 600, location: null, poll: null, status: 'published', pinned: false, order: Date.now(), reactionCounts: changedReaction(), commentCount: 0, totalCommentWrites: 0, deleted: false, version: 1, createdAt: stamp, updatedAt: stamp});
    const first = !(participation.data()?.postCount || participation.data()?.commentCount);
    tx.set(participation.ref, {...person, postCount: (participation.data()?.postCount || 0) + 1, commentCount: participation.data()?.commentCount || 0, updatedAt: stamp});
    tx.update(boardRef, {postCount: (fresh.postCount || 0) + 1, postSequence: (fresh.postSequence || 0) + 1, participantCount: (fresh.participantCount || 0) + (first ? 1 : 0), updatedAt: stamp});
  });
}

/** Display and thumbnail WebP copies in the exhibition's own storage, so deleting the room never touches homework files. */
async function exhibitionImages(exhibitionId: string, fileId: string, sourcePaths: string[]) {
  let buffer: Buffer | null = null, info: Metadata | null = null;
  for (const path of sourcePaths) {
    // Phones may send HEIC originals; the phone-made JPEG thumbnail is the fallback source.
    try {const [data] = await bucket().file(path).download(); const meta = await sharp(data, {limitInputPixels: EXHIBITION_PIXEL_LIMIT, animated: false}).metadata(); if (meta.width && meta.height) {buffer = data; info = meta; break;}} catch {}
  }
  if (!buffer || !info) throw new ApiError(400, '전시용 사진을 만들 수 없어요.', 'IMAGE_INVALID');
  const image = sharp(buffer, {limitInputPixels: EXHIBITION_PIXEL_LIMIT, animated: false});
  const display = await image.clone().rotate().resize({width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true}).webp({quality: 86}).toBuffer();
  const thumbnail = await image.clone().rotate().resize({width: 480, height: 480, fit: 'inside', withoutEnlargement: true}).webp({quality: 78}).toBuffer();
  const displayPath = `exhibition-assets/${exhibitionId}/${fileId}/display.webp`, thumbnailPath = `exhibition-assets/${exhibitionId}/${fileId}/thumbnail.webp`;
  const options = {resumable: false, metadata: {contentType: 'image/webp', cacheControl: FILE_CACHE_CONTROL}};
  await Promise.all([bucket().file(displayPath).save(display, options), bucket().file(thumbnailPath).save(thumbnail, options)]);
  const swapped = [5, 6, 7, 8].includes(info.orientation ?? 1);
  return {displayPath, thumbnailPath, width: swapped ? info.height! : info.width!, height: swapped ? info.width! : info.height!, storedBytes: display.length + thumbnail.length};
}

async function exhibitionArtwork(assignment: Data, submission: Data, exhibitionId: string) {
  const media = syncableUploads(submission.uploads || [])[0];
  // Text answers are not shown in exhibitions; an edit that took the last picture away takes the artwork down too.
  if (!media) return setArtworkWithdrawn(assignment, submission.studentId, exhibitionId, true);
  const roomRef = db().doc(`exhibitions/${exhibitionId}`), room = (await roomRef.get()).data();
  if (!room || room.classId !== assignment.classId) return;
  const fileId = `hs_${hash(`${assignment.id}:${submission.studentId}:${submission.attemptId}`).slice(0, 24)}`;
  const video = media.kind === 'video';
  // A video artwork keeps playing the homework's processed file; only its poster is copied.
  const sources = (video ? [media.upload.thumbnailPath] : [media.upload.path, media.upload.thumbnailPath]).filter((path): path is string => !!path);
  const image = await exhibitionImages(exhibitionId, fileId, sources);
  const slot = roomRef.collection('studentWorks').doc(submission.studentId);
  const roster = (await db().doc(`classes/${assignment.classId}/students/${submission.studentId}`).get()).data();
  const cleanupJobs: string[] = [];
  try {
    await db().runTransaction(async tx => {
      const quota = await tx.get(db().doc(`exhibitionStorage/${room.ownerUid}`));
      const [fresh, freshSlot] = await Promise.all([tx.get(roomRef), tx.get(slot)]);
      if (!fresh.exists) throw new ApiError(404, '전시실을 찾을 수 없어요.');
      const ref = roomRef.collection('artworks').doc(freshSlot.data()?.artworkId || `hw_${submission.studentId}`);
      const previous = await tx.get(ref);
      if (previous.data()?.uploadId === fileId) return;
      if (!previous.exists && (fresh.data()!.artworkCount ?? 0) >= EXHIBITION_ARTWORK_LIMIT) throw new ApiError(409, '전시 한 곳에는 작품 300점까지 담을 수 있어요.', 'ARTWORK_LIMIT');
      const usage = settleExhibitionBytes({usedBytes: quota.data()?.usedBytes ?? 0, reservedBytes: quota.data()?.reservedBytes ?? 0, limitBytes: exhibitionStorageLimit(process.env.EXHIBITION_STORAGE_LIMIT_BYTES)}, 0, image.storedBytes);
      const stamp = now();
      tx.set(ref, {
        id: ref.id, uploadId: fileId, exhibitionId, classId: assignment.classId, uploaderUid: room.ownerUid,
        studentId: submission.studentId, studentName: submission.studentName || roster?.name || '', studentNumber: roster?.number || 0,
        // The day the child handed it in, not the day it reached the room.
        title: assignment.title, description: '', artworkDate: artworkToday(new Date(Date.parse(submission.submittedAt) || Date.now())), artistName: submission.studentName || roster?.name || '', status: 'approved', feedback: '',
        ...image, ...(video ? {mediaType: 'video', videoPath: media.upload.path, videoContentType: media.upload.contentType} : {}),
        source: {kind: 'assignment', assignmentId: assignment.id, submissionId: submission.id, attemptId: submission.attemptId},
        createdAt: previous.data()?.createdAt || stamp, reviewedAt: stamp, commentCount: previous.data()?.commentCount || 0, reactionCounts: previous.data()?.reactionCounts || {colors: 0, idea: 0, story: 0},
      });
      tx.set(slot, {artworkId: ref.id});
      if (previous.exists && previous.data()?.displayPath) {
        const old = previous.data()!, oldFile = old.uploadId || old.displayPath.split('/')[2], jobId = hash(`${exhibitionId}:${oldFile}`);
        tx.set(db().doc(`exhibitionAssetCleanup/${jobId}`), {ownerUid: room.ownerUid, paths: [old.displayPath, old.thumbnailPath], bytes: old.storedBytes || 0, originalManifest: oldFile});
        cleanupJobs.push(jobId);
      }
      tx.set(quota.ref, {...usage, updatedAt: stamp});
      tx.update(roomRef, {artworkCount: (fresh.data()!.artworkCount ?? 0) + (previous.exists ? 0 : 1), approvedCount: (fresh.data()!.approvedCount ?? 0) + (previous.exists && previous.data()?.status === 'approved' ? 0 : 1), updatedAt: stamp});
    });
  } catch (error) {
    await Promise.allSettled([bucket().file(image.displayPath).delete({ignoreNotFound: true}), bucket().file(image.thumbnailPath).delete({ignoreNotFound: true})]);
    throw error;
  }
  // Imported here: exhibitions.ts also imports this module.
  if (cleanupJobs.length) await import('./exhibitions').then(module => module.cleanupReplacedArtworks(room.ownerUid, cleanupJobs)).catch(() => console.error('Synced artwork cleanup deferred'));
}

/**
 * A deleted submission leaves the rooms through their own "hidden" state, so comments and reactions survive an undo.
 * `withdrawnByStudent` tells this apart from a teacher hiding it, which a student's undo must never reverse.
 */
async function setPostWithdrawn(assignment: Data, studentId: string, boardId: string, withdrawn: boolean) {
  const boardRef = db().doc(`participationBoards/${boardId}`), postRef = boardRef.collection('posts').doc(hash(`homework-sync:${assignment.id}:${studentId}`));
  await db().runTransaction(async tx => {
    const post = (await tx.get(postRef)).data();
    if (!post || post.deleted || (withdrawn ? post.status !== 'published' : !post.withdrawnByStudent)) return;
    tx.update(postRef, withdrawn ? {status: 'hidden', withdrawnByStudent: true, updatedAt: now()} : {status: 'published', withdrawnByStudent: FieldValue.delete(), updatedAt: now()});
    tx.update(boardRef, {updatedAt: now()});
  });
}
async function setArtworkWithdrawn(assignment: Data, studentId: string, exhibitionId: string, withdrawn: boolean) {
  const roomRef = db().doc(`exhibitions/${exhibitionId}`), slot = roomRef.collection('studentWorks').doc(studentId);
  await db().runTransaction(async tx => {
    const artworkId = (await tx.get(slot)).data()?.artworkId;
    if (!artworkId) return;
    const ref = roomRef.collection('artworks').doc(artworkId), [artwork, room] = await Promise.all([tx.get(ref), tx.get(roomRef)]), value = artwork.data();
    if (!value || !room.exists || value.source?.assignmentId !== assignment.id || (withdrawn ? value.status !== 'approved' : !value.withdrawnByStudent)) return;
    tx.update(ref, withdrawn ? {status: 'hidden', withdrawnByStudent: true} : {status: 'approved', withdrawnByStudent: FieldValue.delete()});
    tx.update(roomRef, {approvedCount: Math.max(0, (room.data()?.approvedCount ?? 0) + (withdrawn ? -1 : 1)), updatedAt: now()});
  });
}
/** Takes one student's copies out of the linked rooms, or puts them back on restore. Safe to repeat; never throws. */
export async function setSyncedWithdrawn(assignmentId: string, studentId: string, withdrawn: boolean) {
  try {
    const doc = await db().doc(`assignments/${assignmentId}`).get(), assignment = doc.exists ? {...doc.data(), id: doc.id} as Data : null, sync = assignment?.sync as HomeworkSync | undefined;
    if (!assignment || !sync) return;
    const attempt = async (work: () => Promise<void>) => {try {await work();} catch {await new Promise(resolve => setTimeout(resolve, 1000)); await work();}};
    const results = await Promise.allSettled([
      ...(sync.boardId ? [attempt(() => setPostWithdrawn(assignment, studentId, sync.boardId!, withdrawn))] : []),
      ...(sync.exhibitionId ? [attempt(() => setArtworkWithdrawn(assignment, studentId, sync.exhibitionId!, withdrawn))] : []),
    ]);
    if (results.some(result => result.status === 'rejected')) console.error('Homework room withdrawal deferred');
  } catch {console.error('Homework room withdrawal failed');}
}

/** Brings one student's latest submission into the linked rooms. Safe to call repeatedly; never throws. */
export async function syncSubmission(assignmentId: string, studentId: string) {
  try {
    const [assignmentDoc, submissionDoc, state] = await Promise.all([db().doc(`assignments/${assignmentId}`).get(), db().doc(`submissions/${assignmentId}_${studentId}`).get(), stateRef(assignmentId, studentId).get()]);
    const assignment = assignmentDoc.exists ? {...assignmentDoc.data(), id: assignmentDoc.id} as Data : null, submission = submissionDoc.exists ? {...submissionDoc.data(), id: submissionDoc.id} as Data : null;
    const sync = assignment?.sync as HomeworkSync | undefined;
    if (!assignment || !submission || !sync || (!sync.exhibitionId && !sync.boardId) || !submission.attemptId || submission.filesRemoved) return;
    if (!syncDue(state.data(), submission.attemptId)) return;
    const errors: string[] = [];
    // One quick retry absorbs a dropped storage connection; anything else waits for the next trigger.
    const attempt = async (label: string, work: () => Promise<void>) => {try {await work();} catch {await new Promise(resolve => setTimeout(resolve, 1000)); await work().catch(error => {errors.push(`${label}:${(error as ApiError).code || 'error'}`);});}};
    if (sync.boardId) await attempt('board', () => boardPost(assignment, submission, sync.boardId!));
    if (sync.exhibitionId) await attempt('exhibition', () => exhibitionArtwork(assignment, submission, sync.exhibitionId!));
    await stateRef(assignmentId, studentId).set({assignmentId, studentId, attemptId: submission.attemptId, status: errors.length ? 'failed' : 'synced', errors, tries: state.data()?.attemptId === submission.attemptId ? (state.data()?.tries ?? 0) + 1 : 1, updatedAt: now()});
  } catch {console.error('Homework sync failed');}
}

/** Catches up every student of a linked homework room (videos finished while no one was watching, earlier failures). */
export async function reconcileHomeworkSync(assignmentId: string) {
  try {
    const run = db().doc(`homeworkSyncRuns/${assignmentId}`);
    const due = await db().runTransaction(async tx => {
      const last = (await tx.get(run)).data()?.at;
      if (last && Date.now() - Date.parse(last) < RECONCILE_EVERY_MS) return false;
      tx.set(run, {at: now()}); return true;
    });
    if (!due) return;
    const [submissions, states] = await Promise.all([db().collection('submissions').where('assignmentId', '==', assignmentId).limit(200).get(), db().collection('homeworkSync').where('assignmentId', '==', assignmentId).limit(200).get()]);
    const synced = new Map(states.docs.map(doc => [doc.data().studentId, doc.data()]));
    for (const doc of submissions.docs) {
      const value = doc.data(), done = synced.get(value.studentId);
      if (syncDue(done, value.attemptId)) await syncSubmission(assignmentId, value.studentId);
    }
  } catch {console.error('Homework sync reconcile failed');}
}
