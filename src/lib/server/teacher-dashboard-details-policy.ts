import {characters, type Character} from '../characters';
import {assignmentInPeriod, type DashboardPeriod} from '../teacher-dashboard-period';
import type {DashboardStudentSummary, DashboardSubmissionStatus, DashboardSubmissionSummary} from '../teacher-dashboard-types';
import {ApiError, canManageClass, type Role} from './policy';
import {summarizeTeacherDashboard, type DashboardRecord} from './teacher-dashboard-policy';

type Actor = {uid: string; role: Role};
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const studentValue = (row: DashboardRecord | undefined, studentId: string): DashboardStudentSummary => ({
  id: studentId, name: typeof row?.name === 'string' ? row.name : null,
  number: typeof row?.number === 'number' && Number.isInteger(row.number) ? row.number : null,
  character: characters.includes(row?.character as Character) ? row!.character as Character : 'cat',
});

/** Matches the dashboard's roster snapshots and current-state counting exactly. */
export function dashboardSubmissionDetails(actor: Actor, records: {
  classroom: DashboardRecord; assignments: DashboardRecord[]; submissions: DashboardRecord[]; students: DashboardRecord[];
}, scope: {status: DashboardSubmissionStatus; period: DashboardPeriod; year: number}, now = new Date()) {
  if (!canManageClass(actor.role, actor.uid, records.classroom.ownerUid)) throw new ApiError(403, '이 학급을 관리할 권한이 없어요.', 'FORBIDDEN');
  const summary = summarizeTeacherDashboard(actor, {classes: [records.classroom], assignments: records.assignments, submissions: records.submissions, exhibitions: []}, now);
  const tasks = summary.assignments.filter(task => assignmentInPeriod(task.createdAt, scope.period, scope.year));
  const targets = new Map(records.assignments.map(task => [task.id, new Set<string>(Array.isArray(task.targetStudentIds) ? task.targetStudentIds.filter((value): value is string => typeof value === 'string' && !!value) : [])]));
  const students = new Map(records.students.map(student => [student.id, student]));
  const current = new Map<string, DashboardRecord>();
  for (const row of records.submissions) {
    if (row.id !== `${row.assignmentId}_${row.studentId}` || row.classId !== records.classroom.id || !['submitted', 'done', 'revision'].includes(String(row.status))) continue;
    if (!current.has(row.id)) current.set(row.id, row);
  }
  const rows: DashboardSubmissionSummary[] = [];
  for (const task of tasks) {
    const roster = [...(targets.get(task.id) || [])].map(studentId => studentValue(students.get(studentId), studentId))
      .sort((a, b) => (a.number ?? 10000) - (b.number ?? 10000) || a.id.localeCompare(b.id));
    for (const student of roster) {
      const key = `${task.id}_${student.id}`, submission = current.get(key);
      const status = (submission?.status || 'pending') as DashboardSubmissionStatus;
      if (status !== scope.status) continue;
      rows.push({id: key, assignmentId: task.id, assignmentTitle: task.title, dueAt: task.dueAt, student, status,
        submittedAt: date(submission?.submittedAt), reviewedAt: date(submission?.reviewedAt),
        overdue: status === 'pending' && !!task.dueAt && Date.parse(task.dueAt) < now.getTime()});
    }
  }
  const total = tasks.reduce((sum, task) => sum + task[scope.status], 0);
  return {rows, total, unavailableCount: Math.max(0, total - rows.length)};
}

export function dashboardRoster(students: DashboardRecord[]) {
  return students.map(row => studentValue(row, row.id)).sort((a, b) => (a.number ?? 10000) - (b.number ?? 10000) || a.id.localeCompare(b.id));
}
