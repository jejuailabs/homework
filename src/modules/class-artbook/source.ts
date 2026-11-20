import 'server-only';
import { createHash } from 'node:crypto';
import { db } from '@/lib/server/admin';
import { requireTeacher, type Context } from '@/lib/server/auth';
import { ApiError, id } from '@/lib/server/policy';
import { stableReadUrl } from '@/lib/server/signed-urls';
import { artworkToday } from '@/lib/exhibition-metadata';
import { classArtbookAllowed } from './access';
import { inPeriod, whoLabel } from './policy';
import { CLASS_BOOK_LIMIT, type BookItem, type ClassBookOptions, type Overview, type PreviewItem, type RoomSummary, type Selection } from './types';

/** Read-only adapter over classes and exhibitions. Nothing in this file writes. */
type Data = Record<string, any>;
export type BookHost = {ctx: Context; classId: string; className: string};
export const hash = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');
const ROOM_QUERY = 300, ROOM_WORKS = 400;
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

async function roster(host: BookHost) {
  const docs = (await db().collection(`classes/${host.classId}/students`).limit(300).get()).docs;
  return new Map(docs.filter(s => !s.data().disabled).map(s => [s.id, {name: String(s.data().name || ''), number: Number(s.data().number) || 0}]));
}
async function inBatches<T, R>(list: T[], size: number, run: (item: T) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < list.length; i += size) out.push(...await Promise.all(list.slice(i, i + size).map(run)));
  return out;
}

/** Every open or closed room of the class with its counts, and the roster with each student's work count. */
export async function overview(host: BookHost): Promise<Overview> {
  const [roomDocs, students] = await Promise.all([db().collection('exhibitions').where('classId', '==', host.classId).limit(ROOM_QUERY).get(), roster(host)]);
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
    classId: host.classId, className: host.className, truncated: roomDocs.size >= ROOM_QUERY,
    rooms: summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    students: [...students].map(([sid, s]) => ({id: sid, name: s.name, number: s.number, works: works.get(sid) ?? 0})).sort((a, b) => a.number - b.number || a.name.localeCompare(b.name, 'ko')),
  };
}

type Gathered = BookItem & {thumbnailPath: string};
/** The approved works a request covers, with fresh student names from the roster. `exclude` is applied last. */
export async function gather(host: BookHost, selection: Selection, options: Pick<ClassBookOptions, 'mode' | 'unlinked'>): Promise<Gathered[]> {
  const [roomDocs, students] = await Promise.all([db().getAll(...selection.roomIds.map(room => db().doc('exhibitions/' + id(room, '전시실')))), roster(host)]);
  if (roomDocs.some(doc => !available(doc.data(), host))) throw new ApiError(409, '전시실 상태가 바뀌었어요. 전시를 다시 선택해 주세요.');
  const wanted = selection.studentIds.length ? new Set(selection.studentIds) : null, excluded = new Set(selection.exclude), items: Gathered[] = [];
  await inBatches(roomDocs, 8, async doc => {
    const arts = await doc.ref.collection('artworks').limit(ROOM_WORKS + 1).get(), room = doc.data()!;
    if (arts.size > ROOM_WORKS) throw new ApiError(409, `"${room.title}" 전시실에 작품이 너무 많아요. 한 전시실에서 ${ROOM_WORKS}점까지 모을 수 있어요.`);
    for (const s of arts.docs) {
      const a = s.data(), key = `${doc.id}:${s.id}`, date = workDate(a);
      if (a.status !== 'approved' || !a.displayPath || excluded.has(key) || !inPeriod(date, selection.from, selection.to)) continue;
      const student = a.studentId ? students.get(a.studentId) : undefined;
      // A work linked to a student who left the roster is left out rather than printed under a stale name.
      if (a.studentId ? !student || (wanted && !wanted.has(a.studentId)) : options.mode !== 'class' || !options.unlinked) continue;
      items.push({
        key, roomId: doc.id, artworkId: s.id, roomTitle: String(room.title || '전시'), title: String(a.title || '제목 없는 작품'), description: String(a.description || ''),
        feedback: String(a.feedback || ''), date, studentId: student ? String(a.studentId) : '', studentName: student?.name ?? '', studentNumber: student?.number ?? 0,
        artistName: student ? '' : String(a.artistName || ''), sourcePath: String(a.displayPath), thumbnailPath: String(a.thumbnailPath || a.displayPath),
        version: hash(JSON.stringify({path: a.displayPath, updatedAt: a.updatedAt || a.createdAt, title: a.title, description: a.description})),
        width: Number(a.width) || 0, height: Number(a.height) || 0,
      });
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
  const roomIds = [...new Set(items.map(i => i.roomId))];
  const [roomDocs, artDocs] = await Promise.all([
    db().getAll(...roomIds.map(room => db().doc('exhibitions/' + id(room)))),
    db().getAll(...items.map(i => db().doc(`exhibitions/${id(i.roomId)}/artworks/${id(i.artworkId)}`))),
  ]);
  const rooms = new Map(roomDocs.map(doc => [doc.id, doc.data()]));
  return items.map((item, n) => {
    const art = artDocs[n].data();
    if (!available(rooms.get(item.roomId), host)) return '전시실 상태가 바뀌었어요.';
    if (!art || art.status !== 'approved') return '승인이 취소됐거나 지워진 작품이에요.';
    if ((art.studentId || '') !== item.studentId && item.studentId) return '작품의 학생 연결이 바뀌었어요.';
    if (String(art.displayPath) !== item.sourcePath) return '작품 사진이 바뀌었어요.';
    return '';
  });
}
