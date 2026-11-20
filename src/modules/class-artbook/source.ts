import 'server-only';
import { createHash } from 'node:crypto';
import { db } from '@/lib/server/admin';
import { requireTeacher, type Context } from '@/lib/server/auth';
import { ApiError, id } from '@/lib/server/policy';
import { stableReadUrl } from '@/lib/server/signed-urls';
import { artworkToday } from '@/lib/exhibition-metadata';
import { isR2Path } from '@/lib/video-storage';
import { classArtbookAllowed } from './access';
import { inPeriod, whoLabel } from './policy';
import { CLASS_BOOK_LIMIT, type BookItem, type ClassBookOptions, type Overview, type PreviewItem, type RoomSummary, type Selection } from './types';

/** Read-only adapter over classes, exhibitions, homework and boards. Nothing in this file writes. */
type Data = Record<string, any>;
export type BookHost = {ctx: Context; classId: string; className: string};
export const hash = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');
const ROOM_QUERY = 300, ROOM_WORKS = 400, HOMEWORK_QUERY = 200, BOARD_QUERY = 100, BOARD_POSTS = 300, PICTURES_PER_ENTRY = 4;
const closedDoor = () => new ApiError(404, '작품집 기능을 찾을 수 없어요.');

export async function teacher(request: Request) {
  const ctx = await requireTeacher(request);
  if (!classArtbookAllowed(ctx)) throw closedDoor();
  return ctx;
}
export async function classList(ctx: Context) {
  const docs = (await db().collection('classes').where('ownerUid', '==', ctx.uid).limit(100).get()).docs;
  return docs.map(doc => ({id: doc.id, name: String(doc.data().name || ''), grade: String(doc.data().grade || ''), year: Number(doc.data().year) || 0}))
    .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name, 'ko'));
}
export async function bookHost(request: Request, classId: string): Promise<BookHost> {
  const ctx = await teacher(request), cls = await db().doc('classes/' + id(classId, '학급')).get();
  if (!cls.exists || cls.data()?.ownerUid !== ctx.uid) throw new ApiError(404, '학급을 찾을 수 없어요.');
  return {ctx, classId: cls.id, className: String(cls.data()!.name || '우리 반')};
}
const available = (room: Data | undefined, host: BookHost) =>
  !!room && room.ownerUid === host.ctx.uid && room.classId === host.classId && ['open', 'closed'].includes(room.status);
const workDate = (a: Data) => typeof a.artworkDate === 'string' && a.artworkDate ? a.artworkDate : artworkToday(new Date(a.createdAt));
const dayOf = (iso: unknown) => artworkToday(new Date(typeof iso === 'string' && iso ? iso : Date.now()));
const picture = (file: Data) => typeof file?.path === 'string' && !!file.path && !isR2Path(file.path) && String(file.contentType || '').startsWith('image/');

async function roster(host: BookHost) {
  const docs = (await db().collection(`classes/${host.classId}/students`).limit(300).get()).docs;
  return new Map(docs.filter(s => !s.data().disabled).map(s => [s.id, {name: String(s.data().name || ''), number: Number(s.data().number) || 0}]));
}
async function inBatches<T, R>(list: T[], size: number, run: (item: T) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < list.length; i += size) out.push(...await Promise.all(list.slice(i, i + size).map(run)));
  return out;
}
const homeworkOf = async (host: BookHost) => (await db().collection('assignments').where('classId', '==', host.classId).limit(HOMEWORK_QUERY).get()).docs.filter(doc => doc.data().ownerUid === host.ctx.uid);
const boardsOf = async (host: BookHost) => (await db().collection('participationBoards').where('classId', '==', host.classId).limit(BOARD_QUERY).get()).docs.filter(doc => doc.data().ownerUid === host.ctx.uid && doc.data().status !== 'archived');

/** Every open or closed room of the class with its counts, and the roster with each student's work count. */
export async function overview(host: BookHost): Promise<Overview> {
  const [roomDocs, students, homework, boards] = await Promise.all([db().collection('exhibitions').where('classId', '==', host.classId).limit(ROOM_QUERY).get(), roster(host), homeworkOf(host), boardsOf(host)]);
  const rooms = roomDocs.docs.filter(doc => available(doc.data(), host)), works = new Map<string, number>();
  const summaries = await inBatches(rooms, 10, async (doc): Promise<RoomSummary> => {
    const arts = await doc.ref.collection('artworks').select('status', 'studentId', 'artworkDate', 'createdAt').limit(ROOM_WORKS + 1).get();
    let approved = 0, linked = 0, firstDate = '', lastDate = '';
    for (const s of arts.docs) {
      const a = s.data();
      if (a.status !== 'approved') continue;
      approved++;
      const date = workDate(a);
      if (!firstDate || date < firstDate) firstDate = date;
      if (date > lastDate) lastDate = date;
      if (a.studentId && students.has(a.studentId)) {linked++; works.set(a.studentId, (works.get(a.studentId) ?? 0) + 1);}
    }
    const r = doc.data();
    return {id: doc.id, title: String(r.title || '전시'), theme: String(r.theme || 'cozy'), status: r.status, createdAt: String(r.createdAt || ''), approved, linked, unlinked: approved - linked, firstDate, lastDate};
  });
  return {
    classId: host.classId, className: host.className, truncated: roomDocs.size >= ROOM_QUERY, homeworkCount: homework.length, boardCount: boards.length,
    rooms: summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    students: [...students].map(([sid, s]) => ({id: sid, name: s.name, number: s.number, works: works.get(sid) ?? 0})).sort((a, b) => a.number - b.number || a.name.localeCompare(b.name, 'ko')),
  };
}

type Gathered = BookItem & {thumbnailPath: string};
/**
 * The works a request covers, with fresh student names from the roster. Exhibition works come first;
 * a homework photo or board photo is added only when its submission is not already among them.
 * `exclude` is applied last.
 */
export async function gather(host: BookHost, selection: Selection, options: Pick<ClassBookOptions, 'mode' | 'unlinked'>): Promise<Gathered[]> {
  const [roomDocs, students] = await Promise.all([selection.roomIds.length ? db().getAll(...selection.roomIds.map(room => db().doc('exhibitions/' + id(room, '전시실')))) : [], roster(host)]);
  if (roomDocs.some(doc => !available(doc.data(), host))) throw new ApiError(409, '전시실 상태가 바뀌었어요. 전시를 다시 선택해 주세요.');
  const wanted = selection.studentIds.length ? new Set(selection.studentIds) : null, excluded = new Set(selection.exclude), items: Gathered[] = [];
  /** Submissions already printed: `assignmentId_studentId`, the id the homework sync stamps on its copies. */
  const printed = new Set<string>();
  /** Who a picture belongs to, or null when the request does not cover it. */
  const owner = (studentId: unknown, artistName = '') => {
    const student = typeof studentId === 'string' && studentId ? students.get(studentId) : undefined;
    // A work linked to a student who left the roster is left out rather than printed under a stale name.
    if (studentId ? !student || (wanted && !wanted.has(studentId as string)) : options.mode !== 'class' || !options.unlinked) return null;
    return {studentId: student ? String(studentId) : '', studentName: student?.name ?? '', studentNumber: student?.number ?? 0, artistName: student ? '' : artistName};
  };
  const push = (item: Gathered) => {if (!excluded.has(item.key) && inPeriod(item.date, selection.from, selection.to)) items.push(item);};

  await inBatches(roomDocs, 8, async doc => {
    const arts = await doc.ref.collection('artworks').limit(ROOM_WORKS + 1).get(), room = doc.data()!;
    if (arts.size > ROOM_WORKS) throw new ApiError(409, `"${room.title}" 전시실에 작품이 너무 많아요. 한 전시실에서 ${ROOM_WORKS}점까지 모을 수 있어요.`);
    for (const s of arts.docs) {
      const a = s.data();
      if (a.status !== 'approved' || !a.displayPath) continue;
      // Marked before the owner check: a copy that hangs in a chosen room is never added again from its source.
      if (a.source?.submissionId) printed.add(String(a.source.submissionId));
      const who = owner(a.studentId, String(a.artistName || ''));
      if (!who) continue;
      push({
        ...who, key: `${doc.id}:${s.id}`, roomId: doc.id, artworkId: s.id, roomTitle: String(room.title || '전시'), title: String(a.title || '제목 없는 작품'), description: String(a.description || ''),
        feedback: String(a.feedback || ''), date: workDate(a), sourcePath: String(a.displayPath), thumbnailPath: String(a.thumbnailPath || a.displayPath),
        version: hash(JSON.stringify({path: a.displayPath, updatedAt: a.updatedAt || a.createdAt, title: a.title, description: a.description})),
        width: Number(a.width) || 0, height: Number(a.height) || 0, origin: 'exhibition', ref: `exhibitions/${doc.id}/artworks/${s.id}`,
      });
    }
  });

  if (selection.homework) await inBatches(await homeworkOf(host), 8, async doc => {
    const task = doc.data(), submissions = await db().collection('submissions').where('assignmentId', '==', doc.id).limit(ROOM_WORKS).get();
    for (const s of submissions.docs) {
      const sub = s.data();
      // Only work the teacher has checked, and only while its files are still kept.
      if (sub.status !== 'done' || sub.filesRemoved || printed.has(s.id)) continue;
      const who = owner(sub.studentId);
      if (!who) continue;
      const pictures = (Array.isArray(sub.uploads) ? sub.uploads : []).filter(picture).slice(0, PICTURES_PER_ENTRY);
      if (pictures.length) printed.add(s.id);
      pictures.forEach((file: Data, n: number) => push({
        ...who, key: `hw-${doc.id}:${sub.studentId}-${n}`, roomId: 'hw-' + doc.id, artworkId: `${sub.studentId}-${n}`, roomTitle: `숙제 · ${task.title || '숙제'}`,
        title: String(task.title || '숙제') + (pictures.length > 1 ? ` ${n + 1}` : ''), description: n === 0 ? String(sub.text || '') : '', feedback: n === 0 ? String(sub.feedback || '') : '',
        date: dayOf(sub.submittedAt), sourcePath: String(file.path), thumbnailPath: String(file.thumbnailPath || file.path),
        version: hash(JSON.stringify({path: file.path, attempt: sub.attemptId, text: sub.text})), width: 0, height: 0, origin: 'homework', ref: 'submissions/' + s.id,
      }));
    }
  });

  if (selection.board) await inBatches(await boardsOf(host), 6, async doc => {
    const board = doc.data(), posts = await doc.ref.collection('posts').where('deleted', '==', false).limit(BOARD_POSTS).get();
    for (const p of posts.docs) {
      const post = p.data(), submission = post.source?.submissionId ? String(post.source.submissionId) : '';
      if (post.status !== 'published' || post.authorRole !== 'student' || (submission && printed.has(submission))) continue;
      // An anonymous board keeps its promise in print: such a post is treated as having no named owner.
      const hidden = board.anonymous === true || post.sourceAnonymous === true;
      const who = owner(hidden ? '' : post.authorStudentId);
      if (!who) continue;
      const pictures = (Array.isArray(post.attachments) ? post.attachments : []).filter((a: Data) => a.kind === 'image' && picture(a)).slice(0, PICTURES_PER_ENTRY);
      if (pictures.length && submission) printed.add(submission);
      pictures.forEach((file: Data, n: number) => push({
        ...who, key: `bd-${doc.id}:${p.id}-${n}`, roomId: 'bd-' + doc.id, artworkId: `${p.id}-${n}`, roomTitle: `보드 · ${board.title || '참여보드'}`,
        title: String(post.title || board.title || '참여보드 글') + (pictures.length > 1 ? ` ${n + 1}` : ''), description: n === 0 ? String(post.body || '') : '', feedback: '',
        date: dayOf(post.createdAt), sourcePath: String(file.path), thumbnailPath: String(file.thumbnailPath || file.path),
        version: hash(JSON.stringify({path: file.path, updatedAt: post.updatedAt, body: post.body})), width: 0, height: 0, origin: 'board', ref: `participationBoards/${doc.id}/posts/${p.id}`,
      }));
    }
  });
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

/** Thumbnails for the "빼고 싶은 작품" step. Shows every matching work so an excluded one can be put back. */
export async function preview(host: BookHost, selection: Selection, options: ClassBookOptions): Promise<{items: PreviewItem[]; total: number; limit: number}> {
  const items = await gather(host, {...selection, exclude: []}, options), shown = items.slice(0, CLASS_BOOK_LIMIT + 100);
  const urls = await inBatches(shown, 24, item => stableReadUrl(item.thumbnailPath).catch(() => ''));
  return {
    total: items.length, limit: CLASS_BOOK_LIMIT,
    items: shown.map((item, i) => ({key: item.key, title: item.title, date: item.date, roomTitle: item.roomTitle, who: whoLabel(item, 'name'), thumbnailUrl: urls[i]})),
  };
}

/** Why a snapshot work can no longer be printed, or '' when it still stands. Read again at every step and download. */
export async function staleReasons(host: BookHost, items: BookItem[]): Promise<string[]> {
  if (!items.length) return [];
  // Books made before homework and boards were added carry no origin: they are exhibition works.
  const exhibition = (i: BookItem) => !i.origin || i.origin === 'exhibition';
  const roomIds = [...new Set(items.filter(exhibition).map(i => i.roomId))];
  const [roomDocs, docs] = await Promise.all([
    roomIds.length ? db().getAll(...roomIds.map(room => db().doc('exhibitions/' + id(room)))) : [],
    db().getAll(...items.map(i => db().doc(exhibition(i) ? `exhibitions/${id(i.roomId)}/artworks/${id(i.artworkId)}` : i.ref))),
  ]);
  const rooms = new Map(roomDocs.map(doc => [doc.id, doc.data()]));
  return items.map((item, n) => {
    const data = docs[n].data();
    if (item.origin === 'homework') {
      if (!data || data.classId !== host.classId || data.status !== 'done' || data.filesRemoved) return '숙제 검사 상태가 바뀌었거나 파일이 지워졌어요.';
      return (data.uploads ?? []).some((file: Data) => file.path === item.sourcePath) ? '' : '숙제 사진이 바뀌었어요.';
    }
    if (item.origin === 'board') {
      if (!data || data.deleted || data.status !== 'published') return '보드 글이 숨겨졌거나 지워졌어요.';
      return (data.attachments ?? []).some((file: Data) => file.path === item.sourcePath) ? '' : '보드 사진이 바뀌었어요.';
    }
    if (!available(rooms.get(item.roomId), host)) return '전시실 상태가 바뀌었어요.';
    if (!data || data.status !== 'approved') return '승인이 취소됐거나 지워진 작품이에요.';
    if ((data.studentId || '') !== item.studentId && item.studentId) return '작품의 학생 연결이 바뀌었어요.';
    if (String(data.displayPath) !== item.sourcePath) return '작품 사진이 바뀌었어요.';
    return '';
  });
}
