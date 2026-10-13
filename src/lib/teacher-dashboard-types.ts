import type { AssignmentSubmissionType } from './assignment-submission';
import type { ExhibitionStatus } from './exhibition-types';
import type { Character } from './characters';

export type DashboardSubmissionStatus = 'pending' | 'submitted' | 'done' | 'revision';
export type DashboardDetailKind = 'students' | 'assignments' | 'rooms' | DashboardSubmissionStatus;
export type DashboardStudentSummary = {id: string; name: string | null; number: number | null; character: Character};
export type DashboardSubmissionSummary = {
  id: string; assignmentId: string; assignmentTitle: string; dueAt: string | null;
  student: DashboardStudentSummary; status: DashboardSubmissionStatus;
  submittedAt: string | null; reviewedAt: string | null; overdue: boolean;
};
export type TeacherDashboardDetailsResponse = {
  students: DashboardStudentSummary[]; submissions: DashboardSubmissionSummary[];
  total: number; unavailableCount: number; nextOffset: number | null; generatedAt: string;
};

export type TeacherDashboardClass = {
  id: string; name: string; grade: string; year: number; studentCount: number;
};

export type TeacherDashboardAssignment = {
  id: string; classId: string; className: string; title: string;
  submissionType: AssignmentSubmissionType;
  dueAt: string | null; createdAt: string | null; targetCount: number;
  /** Each targeted student belongs to exactly one of these four states. */
  pending: number; submitted: number; done: number; revision: number;
  /** Pending submissions whose assignment due date has passed. */
  overdue: number;
};

export type TeacherDashboardExhibition = {
  id: string; classId: string; className: string; title: string;
  status: ExhibitionStatus; artworkCount: number; approvedCount: number;
  createdAt: string | null;
};

export type TeacherDashboardResponse = {
  viewer: { displayName: string | null; role: string };
  classes: TeacherDashboardClass[];
  assignments: TeacherDashboardAssignment[];
  exhibitions: TeacherDashboardExhibition[];
  generatedAt: string;
};

export type TeacherDashboardData = TeacherDashboardResponse;
