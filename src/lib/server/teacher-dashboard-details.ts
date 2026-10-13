import 'server-only';
import {NextResponse} from 'next/server';
import {db} from './admin';
import {requireTeacher} from './auth';
import {ApiError, canManageClass, id} from './policy';
import {dashboardRoster, dashboardSubmissionDetails} from './teacher-dashboard-details-policy';
import type {DashboardRecord} from './teacher-dashboard-policy';
import type {DashboardSubmissionStatus, TeacherDashboardDetailsResponse} from '../teacher-dashboard-types';
import type {DashboardPeriod} from '../teacher-dashboard-period';

const json = (value: unknown, status = 200) => NextResponse.json(value, {status, headers: {'Cache-Control': 'private, no-store'}});
const records = (snapshot: FirebaseFirestore.QuerySnapshot): DashboardRecord[] => snapshot.docs.map(doc => ({...doc.data(), id: doc.id}));

export async function teacherDashboardDetails(request: Request) {
  try {
    const ctx = await requireTeacher(request), params = new URL(request.url).searchParams;
    const classId = id(params.get('classId'), '학급'), kind = params.get('kind');
    const period = params.get('period') || 'all', year = Number(params.get('year'));
    const offset = Number(params.get('offset') || '0');
    if (!['students', 'pending', 'submitted', 'done', 'revision'].includes(kind || '') || !['all', 'year', 'first', 'second'].includes(period)
      || !Number.isSafeInteger(year) || year < 2020 || year > 2100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new ApiError(400, '조회 범위를 확인해 주세요.');
    const classroom = await db().doc(`classes/${classId}`).get();
    if (!classroom.exists) throw new ApiError(404, '학급을 찾을 수 없어요.', 'NOT_FOUND');
    if (!canManageClass(ctx.role, ctx.uid, classroom.data()?.ownerUid)) throw new ApiError(403, '이 학급을 관리할 권한이 없어요.', 'FORBIDDEN');
    // Names are loaded on card click, without access codes, answers, media or signing work.
    const rosterPromise = db().collection(`classes/${classId}/students`).select('name', 'number', 'character').get();
    const now = new Date();
    if (kind === 'students') {
      const students = dashboardRoster(records(await rosterPromise));
      return json({students, submissions: [], total: students.length, unavailableCount: 0, nextOffset: null, generatedAt: now.toISOString()} satisfies TeacherDashboardDetailsResponse);
    }
    const [roster, assignments, submissions] = await Promise.all([rosterPromise,
      db().collection('assignments').where('classId', '==', classId).select('ownerUid', 'classId', 'title', 'submissionType', 'createdAt', 'dueAt', 'targetStudentIds', 'targetCount').get(),
      db().collection('submissions').where('classId', '==', classId).select('assignmentId', 'classId', 'studentId', 'status', 'submittedAt', 'reviewedAt').get(),
    ]);
    const result = dashboardSubmissionDetails(ctx, {classroom: {...classroom.data(), id: classroom.id}, students: records(roster), assignments: records(assignments), submissions: records(submissions)},
      {status: kind as DashboardSubmissionStatus, period: period as DashboardPeriod, year}, now);
    const end = offset + 100;
    return json({students: [], submissions: result.rows.slice(offset, end), total: result.total, unavailableCount: result.unavailableCount,
      nextOffset: end < result.rows.length ? end : null, generatedAt: now.toISOString()} satisfies TeacherDashboardDetailsResponse);
  } catch (error) {
    if (error instanceof ApiError) return json({error: error.message, code: error.code}, error.status);
    console.error('Teacher dashboard details failed', (error as {code?: string}).code ?? 'INTERNAL');
    return json({error: '상세 내용을 불러오지 못했어요.', code: 'INTERNAL_ERROR'}, 500);
  }
}
