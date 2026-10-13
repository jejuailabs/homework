import type { AssignmentSubmissionType } from './assignment-submission';
import type { ExhibitionStatus } from './exhibition-types';

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
