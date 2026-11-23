import 'server-only';
import {db} from './admin';
import {ApiError} from './policy';
import {requireStudent, type Context} from './auth';
import {canViewBoard} from './participation-policy';
import {canViewExhibition} from './exhibition-policy';
import type {ExhibitionStatus} from '../exhibition-types';
import {newItemIds, newsCutoff, seenIds, seenRequest, type StudentSeenKind} from '../student-news';

type StudentContext = Context & {studentId: string; classId: string};
const RECENT_LIMIT = 40;

/** One document per student: `{assignments: {id: openedAt}, boards: {id: openedAt}}`. Exhibitions keep `exhibitionVisits`. */
export const studentSeenRef = (uid: string) => db().doc(`studentSeen/${uid}`);

export async function markStudentSeen(uid: string, kind: StudentSeenKind, id: string) {
  await studentSeenRef(uid).set({[kind]: {[id]: new Date().toISOString()}, updatedAt: new Date().toISOString()}, {merge: true});
}

const recent = (collection: string, classId: string, cutoff: string) =>
  db().collection(collection).where('classId', '==', classId).where('createdAt', '>=', cutoff).orderBy('createdAt', 'desc').limit(RECENT_LIMIT).get();

/** Recent boards and exhibitions this student has not opened, plus the opened-homework set for the home list. */
export async function studentNews(ctx: StudentContext) {
  const now = Date.now(), cutoff = newsCutoff(now);
  const [seen, visits, boards, exhibitions] = await Promise.all([
    studentSeenRef(ctx.uid).get(),
    db().doc(`exhibitionVisits/${ctx.uid}`).get(),
    recent('participationBoards', ctx.classId, cutoff),
    recent('exhibitions', ctx.classId, cutoff),
  ]);
  const visibleBoards = boards.docs.map(doc => ({id: doc.id, createdAt: doc.data().createdAt, ownerUid: String(doc.data().ownerUid ?? ''), classId: String(doc.data().classId ?? ''), status: String(doc.data().status ?? '')}))
    .filter(board => canViewBoard(ctx, board));
  const visibleRooms = exhibitions.docs.map(doc => ({id: doc.id, createdAt: doc.data().createdAt, ownerUid: String(doc.data().ownerUid ?? ''), classId: String(doc.data().classId ?? ''), status: doc.data().status as ExhibitionStatus}))
    .filter(room => (room.status === 'open' || room.status === 'closed') && canViewExhibition(ctx, room));
  return {
    seenAssignments: seenIds(seen.data()?.assignments),
    newBoardIds: newItemIds(visibleBoards, seenIds(seen.data()?.boards), now),
    newExhibitionIds: newItemIds(visibleRooms, seenIds(visits.data()?.rooms), now),
  };
}

/** Recent boards this student has not opened, for the NEW tags on the board list. */
export async function unseenBoardIds(ctx: Context, boards: readonly {id: string; createdAt?: unknown}[]) {
  if (ctx.role !== 'student' || !boards.length) return [];
  const seen = await studentSeenRef(ctx.uid).get();
  return newItemIds(boards, seenIds(seen.data()?.boards), Date.now());
}

/** POST /api/student/seen `{kind, id}`: the student opened this homework or board. Routed through `handle` for the origin check. */
export async function studentSeen(request: Request) {
  const ctx = await requireStudent(request);
  const input = seenRequest(await request.json().catch(() => null));
  if (!input) throw new ApiError(400, '확인할 항목을 다시 골라 주세요.', 'SEEN_INPUT');
  await markStudentSeen(ctx.uid, input.kind, input.id);
  return {ok: true};
}
