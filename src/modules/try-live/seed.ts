import 'server-only';
import {getAuth} from 'firebase-admin/auth';
import {db} from '@/lib/server/admin';
import {students, works, rooms} from '@/modules/try-demo/data';
import {docentItems} from '@/modules/try-demo/docent';
import {tryDemoClassId, tryDemoUid} from './server-config';

/**
 * The tour's demo teacher and class. Everything Berry can read or write for a visitor lives under this one teacher, and
 * resetTryDemo() puts it back to this starting state every night. Only documents owned by the demo teacher (or in the
 * demo class) are ever deleted.
 */
const PREFIX = 'try-demo/v1';
const OWNED = ['assignments', 'exhibitions', 'participationBoards', 'classPolls', 'teacherEvents'];

const kst = (now: number, daysFromToday: number, hour: number, minute = 0) => {
  const day = new Date(now + 9 * 3600_000); day.setUTCDate(day.getUTCDate() + daysFromToday); day.setUTCHours(hour, minute, 0, 0);
  return new Date(day.getTime() - 9 * 3600_000).toISOString();
};
const nextFriday = (now: number) => {const weekday = new Date(now + 9 * 3600_000).getUTCDay(); return (5 - weekday + 7) % 7 || 7;};

async function ensureTeacher() {
  const uid = tryDemoUid(), auth = getAuth();
  try {await auth.getUser(uid);}
  catch {await auth.createUser({uid, displayName: '체험 선생님', email: 'try-demo@ourclass.co.kr', emailVerified: true, disabled: false});}
  await db().doc(`users/${uid}`).set({uid, role: 'teacher', displayName: '체험 선생님', email: 'try-demo@ourclass.co.kr', disabled: false, tryDemo: true}, {merge: true});
  return uid;
}

async function clearOwned(uid: string, classId: string) {
  for (const name of OWNED) {
    const docs = await db().collection(name).where('ownerUid', '==', uid).get();
    for (const doc of docs.docs) await db().recursiveDelete(doc.ref);
  }
  const subs = await db().collection('submissions').where('classId', '==', classId).get();
  for (const doc of subs.docs) await db().recursiveDelete(doc.ref);
  for (const path of [`teacherWorkspaces/${uid}`, `teacherNotebooks/${uid}`]) await db().recursiveDelete(db().doc(path));
}

export async function resetTryDemo(now = Date.now()) {
  const uid = await ensureTeacher(), classId = tryDemoClassId(), created = new Date(now).toISOString();
  await clearOwned(uid, classId);
  const classRef = db().doc(`classes/${classId}`);
  await db().recursiveDelete(classRef.collection('students'));
  await classRef.set({name: '햇살초 3학년 2반 (체험)', grade: '3', year: 2026, ownerUid: uid, createdAt: created, studentCount: students.length, tryDemo: true});
  const batch = db().batch();
  for (const s of students) batch.set(classRef.collection('students').doc(s.id), {id: s.id, number: s.number, name: s.name, classId, character: s.character, points: s.bomal, pointsEarnedTotal: s.bomal, createdAt: created});

  // Homework: one waiting to be checked, one with three missing, one already checked and hanging in the forest room.
  const homework = [
    {id: 'try-hw-space', title: '내가 가 보고 싶은 우주', description: '우주에 간다면 무엇을 만나고 싶나요? 상상해서 그리고 한 줄로 소개해 주세요.', submissionType: 'photo', dueAt: kst(now, nextFriday(now), 18), from: ['s1', 's2', 's3', 's4', 's5', 's9'], status: 'submitted'},
    {id: 'try-hw-reading', title: '독서 감상문', description: '이번 주에 읽은 책을 한 문단으로 소개해 주세요.', submissionType: 'text', dueAt: kst(now, 0, 23, 59), from: ['s1', 's2', 's3', 's5', 's6', 's7', 's9'], status: 'submitted'},
    {id: 'try-hw-taekwondo', title: '태권도 띠 발표 자료', description: '태권도 띠 색깔을 주제로 발표 자료를 만들고 목소리로 설명해 주세요.', submissionType: 'photo', dueAt: kst(now, -3, 18), from: ['s4', 's6', 's7'], status: 'done'},
  ];
  for (const hw of homework) {
    const reviewed = hw.status === 'done' ? hw.from.length : 0;
    batch.set(db().doc(`assignments/${hw.id}`), {classId, className: '햇살초 3학년 2반 (체험)', ownerUid: uid, title: hw.title, description: hw.description, submissionType: hw.submissionType, dueAt: hw.dueAt, targetStudentIds: students.map(s => s.id), targetCount: students.length, createdAt: kst(now, -4, 9), materials: [], submittedCount: hw.from.length, reviewedCount: reviewed, visibility: 'visible', visibilityVersion: 1, tryDemo: true});
    hw.from.forEach((studentId, i) => {
      const s = students.find(x => x.id === studentId)!;
      batch.set(db().doc(`submissions/${hw.id}_${studentId}`), {id: `${hw.id}_${studentId}`, assignmentId: hw.id, classId, studentId, studentName: s.name, text: hw.submissionType === 'text' ? '책 속 주인공이 친구를 도와주는 장면이 가장 기억에 남았어요.' : '', title: hw.title, uploads: [], attemptId: 'a1', attemptNumber: 1, status: hw.status, feedback: hw.status === 'done' ? '발표 자료를 정성껏 만들었어요.' : '', submittedAt: kst(now, -1, 16, 10 + i * 7), reviewedAt: hw.status === 'done' ? kst(now, -2, 15) : null, fingerprint: `${hw.id}-${studentId}`, rewardGranted: hw.status === 'done', tryDemo: true});
    });
  }

  // Rooms: the three the tour lets you walk into. Two works in the space room wait for approval.
  const roomDocs = [
    {id: 'try-room-space', title: rooms.find(r => r.id === 'space')!.title, theme: 'saturn', works: works.filter(w => w.roomId === 'space').map(w => ({id: w.id, title: w.title, studentId: w.studentId, path: `${PREFIX}/art/${w.id}`}))},
    {id: 'try-room-sea', title: rooms.find(r => r.id === 'sea')!.title, theme: 'coral', works: works.filter(w => w.roomId === 'sea').map(w => ({id: w.id, title: w.title, studentId: w.studentId, path: `${PREFIX}/art/${w.id}`}))},
    {id: 'try-room-forest', title: '태권도 띠 발표 자료', theme: 'forest', works: docentItems.map(d => ({id: d.id, title: d.title, studentId: d.studentId, path: `${PREFIX}/docent/${d.id}`}))},
  ];
  for (const room of roomDocs) {
    const approved = room.works.length - (room.id === 'try-room-space' ? 2 : 0);
    batch.set(db().doc(`exhibitions/${room.id}`), {title: room.title, description: '', classId, className: '햇살초 3학년 2반 (체험)', ownerUid: uid, commentsEnabled: true, grade: '3', year: 2026, theme: room.theme, createdAt: kst(now, -10, 9), updatedAt: created, artworkCount: room.works.length, approvedCount: approved, publicSharingEnabled: false, status: 'open', allowStudentUploads: true, tryDemo: true});
    room.works.forEach((w, i) => {
      const s = students.find(x => x.id === w.studentId)!;
      batch.set(db().doc(`exhibitions/${room.id}/artworks/${w.id}`), {id: w.id, exhibitionId: room.id, classId, uploaderUid: uid, studentId: s.id, studentName: s.name, studentNumber: s.number, title: w.title, description: '', status: i >= approved ? 'pending' : 'approved', feedback: '', displayPath: `${w.path}.webp`, thumbnailPath: `${w.path}-thumb.webp`, width: 1200, height: 900, storedBytes: 0, createdAt: kst(now, -2, 10, i), reviewedAt: i >= approved ? null : kst(now, -1, 9), commentCount: 0, reactionCounts: {colors: 0, idea: 0, story: 0}});
    });
  }
  await batch.commit();
  return {uid, classId, homework: homework.length, rooms: roomDocs.length};
}
