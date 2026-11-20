import 'server-only';
import { db } from '@/lib/server/admin';
import { requireTeacher, type Context } from '@/lib/server/auth';
import { ApiError, id } from '@/lib/server/policy';
import { artworkToday } from '@/lib/exhibition-metadata';
import { recordPeriod } from './policy';
import type { RecordKind, StudentRecord, StudentRecords } from './types';

/**
 * 학생별 모아 보기: what the teacher already wrote about each student while checking homework,
 * approving artwork and giving 보말. Read-only. It writes nothing and adds no new stored data.
 */
type Data = Record<string, any>;
const SUBMISSIONS = 3000, ROOMS = 200, ROOM_WORKS = 400, LEDGER = 120;
const dayOf = (iso: unknown) => typeof iso === 'string' && iso ? artworkToday(new Date(iso)) : '';

export async function classList(ctx: Context) {
  const docs = (await db().collection('classes').where('ownerUid', '==', ctx.uid).limit(100).get()).docs;
  return docs.map(doc => ({id: doc.id, name: String(doc.data().name || ''), year: Number(doc.data().year) || 0})).sort((a, b) => b.year - a.year || a.name.localeCompare(b.name, 'ko'));
}
async function inBatches<T>(list: T[], size: number, run: (item: T) => Promise<void>) {
  for (let i = 0; i < list.length; i += size) await Promise.all(list.slice(i, i + size).map(run));
}

export async function studentRecords(request: Request, classId: string, params: URLSearchParams): Promise<StudentRecords> {
  const ctx = await requireTeacher(request), cls = await db().doc('classes/' + id(classId, '학급')).get();
  if (!cls.exists || cls.data()?.ownerUid !== ctx.uid) throw new ApiError(404, '학급을 찾을 수 없어요.');
  const {from, to} = recordPeriod(params.get('from'), params.get('to'));
  const within = (date: string) => !!date && date >= from && date <= to;
  const [roster, assignments, submissions, rooms] = await Promise.all([
    db().collection(`classes/${cls.id}/students`).limit(300).get(),
    db().collection('assignments').where('classId', '==', cls.id).select('title', 'ownerUid').limit(500).get(),
    db().collection('submissions').where('classId', '==', cls.id).select('assignmentId', 'studentId', 'feedback', 'status', 'reviewedAt', 'submittedAt').limit(SUBMISSIONS).get(),
    db().collection('exhibitions').where('classId', '==', cls.id).select('title', 'ownerUid').limit(ROOMS).get(),
  ]);
  const students = roster.docs.filter(s => !s.data().disabled), records = new Map<string, StudentRecord[]>(students.map(s => [s.id, []]));
  const add = (studentId: unknown, kind: RecordKind, date: string, title: string, text: unknown) => {
    const list = typeof studentId === 'string' ? records.get(studentId) : undefined, value = typeof text === 'string' ? text.trim() : '';
    if (list && value && within(date)) list.push({kind, date, title, text: value});
  };
  const titles = new Map(assignments.docs.filter(doc => doc.data().ownerUid === ctx.uid).map(doc => [doc.id, String(doc.data().title || '숙제')]));
  for (const doc of submissions.docs) {
    const s = doc.data();
    if (titles.has(s.assignmentId)) add(s.studentId, 'homework', dayOf(s.reviewedAt || s.submittedAt), titles.get(s.assignmentId)!, s.feedback);
  }
  await inBatches(rooms.docs.filter(doc => doc.data().ownerUid === ctx.uid), 10, async room => {
    const arts = await room.ref.collection('artworks').select('studentId', 'feedback', 'title', 'artworkDate', 'createdAt', 'reviewedAt').limit(ROOM_WORKS).get();
    for (const doc of arts.docs) {
      const a: Data = doc.data();
      add(a.studentId, 'artwork', dayOf(a.reviewedAt || a.createdAt), `${room.data().title || '전시'} · ${a.title || '작품'}`, a.feedback);
    }
  });
  await inBatches(students, 10, async student => {
    const ledger = await student.ref.collection('pointLedger').orderBy('createdAt', 'desc').limit(LEDGER).get();
    for (const doc of ledger.docs) {
      const entry: Data = doc.data();
      // Only praise the teacher wrote by hand: automatic rewards carry no observation.
      if (entry.kind === 'earn' && entry.source === 'manual') add(student.id, 'points', dayOf(entry.createdAt), `보말 +${Number(entry.amount) || 0}`, entry.reason);
    }
  });
  return {
    classId: cls.id, className: String(cls.data()!.name || '우리 반'), from, to, truncated: submissions.size >= SUBMISSIONS,
    students: students.map(s => ({id: s.id, name: String(s.data().name || ''), number: Number(s.data().number) || 0, records: records.get(s.id)!.sort((a, b) => a.date.localeCompare(b.date))}))
      .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name, 'ko')),
  };
}
