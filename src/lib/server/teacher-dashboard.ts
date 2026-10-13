import 'server-only';
import { NextResponse } from 'next/server';
import { db } from './admin';
import { requireTeacher } from './auth';
import { ApiError } from './policy';
import { summarizeTeacherDashboard, type DashboardRecord } from './teacher-dashboard-policy';

const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const records = (snapshot: FirebaseFirestore.QuerySnapshot): DashboardRecord[] => snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));

export async function teacherDashboard(request: Request) {
  try {
    const ctx = await requireTeacher(request);
    // Project only summary fields. No child names, answers, photos, or signed URLs are read.
    const [classes, assignments, exhibitions] = await Promise.all([
      db().collection('classes').where('ownerUid', '==', ctx.uid).select('ownerUid', 'name', 'grade', 'year', 'studentCount').get(),
      db().collection('assignments').where('ownerUid', '==', ctx.uid).select('ownerUid', 'classId', 'title', 'submissionType', 'dueAt', 'createdAt', 'targetStudentIds', 'targetCount').get(),
      db().collection('exhibitions').where('ownerUid', '==', ctx.uid).select('ownerUid', 'classId', 'title', 'status', 'artworkCount', 'approvedCount', 'createdAt').get(),
    ]);
    const classIds = classes.docs.map(doc => doc.id);
    const submissions: DashboardRecord[] = [];
    // The single-field in query needs no composite index. Keep batches within
    // Firestore's 30-value bound without truncating an entire school year's work.
    const batches = Array.from({ length: Math.ceil(classIds.length / 30) }, (_, i) => classIds.slice(i * 30, (i + 1) * 30));
    for (let offset = 0; offset < batches.length; offset += 4) {
      const snapshots = await Promise.all(batches.slice(offset, offset + 4).map(ids =>
        db().collection('submissions').where('classId', 'in', ids).select('assignmentId', 'classId', 'studentId', 'status').get(),
      ));
      snapshots.forEach(snapshot => submissions.push(...records(snapshot)));
    }
    return json(summarizeTeacherDashboard(ctx, { classes: records(classes), assignments: records(assignments), exhibitions: records(exhibitions), submissions }));
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message, code: error.code }, error.status);
    console.error('Teacher dashboard failed', (error as { code?: string }).code ?? 'INTERNAL');
    return json({ error: '대시보드를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 'INTERNAL_ERROR' }, 500);
  }
}
