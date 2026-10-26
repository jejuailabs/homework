import { assignmentSubmissionType } from '../assignment-submission';
import type { TeacherDashboardAssignment, TeacherDashboardExhibition, TeacherDashboardResponse } from '../teacher-dashboard-types';
import { ApiError, type Role } from './policy';

export type DashboardRecord = { id: string; [key: string]: unknown };
type DashboardActor = { uid: string; role: Role; displayName?: string | null };
type DashboardRecords = { classes: DashboardRecord[]; assignments: DashboardRecord[]; submissions: DashboardRecord[]; exhibitions: DashboardRecord[] };

const label = (value: unknown) => typeof value === 'string' ? value : '';
const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
function date(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}
function newestFirst(a: { id: string; createdAt: string | null }, b: { id: string; createdAt: string | null }) {
  return (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.id.localeCompare(b.id);
}

/** Aggregate only each owner's classes and each assignment's original roster snapshot. */
export function summarizeTeacherDashboard(actor: DashboardActor, records: DashboardRecords, now = new Date()): TeacherDashboardResponse {
  if (actor.role === 'student') throw new ApiError(403, '선생님만 사용할 수 있어요.', 'FORBIDDEN');
  const classes = records.classes.filter(row => row.ownerUid === actor.uid).map(row => ({
    id: row.id, name: label(row.name), grade: typeof row.grade === 'number' ? String(row.grade) : label(row.grade),
    year: count(row.year), studentCount: count(row.studentCount),
  })).sort((a, b) => b.year - a.year || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const classById = new Map(classes.map(row => [row.id, row]));
  const assignmentById = new Map<string, { summary: TeacherDashboardAssignment; targets: Set<string> }>();

  for (const row of records.assignments) {
    const classroom = classById.get(label(row.classId));
    if (row.ownerUid !== actor.uid || !classroom || row.visibility === 'hidden') continue;
    const targets = new Set<string>(Array.isArray(row.targetStudentIds) ? row.targetStudentIds.filter((id): id is string => typeof id === 'string' && !!id) : []);
    // The snapshot remains authoritative after roster additions or student deactivation.
    const targetCount = Array.isArray(row.targetStudentIds) ? targets.size : count(row.targetCount);
    const summary: TeacherDashboardAssignment = {
      id: row.id, classId: classroom.id, className: classroom.name, title: label(row.title),
      submissionType: assignmentSubmissionType(row.submissionType), dueAt: date(row.dueAt), createdAt: date(row.createdAt),
      targetCount, pending: targetCount, submitted: 0, done: 0, revision: 0, overdue: 0,
    };
    assignmentById.set(row.id, { summary, targets });
  }

  const counted = new Set<string>();
  for (const row of records.submissions) {
    const assignmentId = label(row.assignmentId), studentId = label(row.studentId);
    const task = assignmentById.get(assignmentId);
    if (!task || row.classId !== task.summary.classId || !task.targets.has(studentId)) continue;
    const key = `${assignmentId}_${studentId}`;
    // Current submissions use this deterministic document ID; attempts and orphan rows never count.
    if (row.id !== key || counted.has(key)) continue;
    if (row.status !== 'submitted' && row.status !== 'done' && row.status !== 'revision') continue;
    counted.add(key);
    task.summary[row.status]++;
    task.summary.pending--;
  }

  const assignments = Array.from(assignmentById.values(), ({ summary }) => ({
    ...summary, overdue: summary.dueAt && Date.parse(summary.dueAt) < now.getTime() ? summary.pending : 0,
  })).sort(newestFirst);
  const exhibitions = records.exhibitions.flatMap<TeacherDashboardExhibition>(row => {
    const classroom = classById.get(label(row.classId));
    if (row.ownerUid !== actor.uid || !classroom) return [];
    const artworkCount = count(row.artworkCount);
    return [{
      id: row.id, classId: classroom.id, className: classroom.name, title: label(row.title),
      status: row.status === 'open' || row.status === 'closed' ? row.status : 'draft' as const,
      artworkCount, approvedCount: Math.min(artworkCount, count(row.approvedCount)), createdAt: date(row.createdAt),
    }];
  }).sort(newestFirst);

  return { viewer: { displayName: actor.displayName ?? null, role: actor.role }, classes, assignments, exhibitions, generatedAt: now.toISOString() };
}
