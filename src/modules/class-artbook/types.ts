/**
 * 우리 반 작품집: one class's approved exhibition artworks, gathered into PDFs.
 * This module only reads exhibition data. It keeps its own jobs and files and
 * never changes the per-room "학생별 아트북" (src/modules/digital-artbook).
 */
/** Works one request may gather. Narrow by rooms, students or dates above this. */
export const CLASS_BOOK_LIMIT = 400;
/** Works per class volume. More than this continues in the next volume. */
export const VOLUME_SIZE = 80;
/** Works per student book. The single-student renderer is verified up to this size. */
export const STUDENT_VOLUME_SIZE = 60;
export const ROOM_LIMIT = 80;
/** Saved books per teacher. Finished books are removed after RETENTION_DAYS. */
export const JOB_LIMIT = 6;
export const RETENTION_DAYS = 30;

export type BookMode = 'class' | 'students';
export type BookOrder = 'student' | 'room' | 'date';
export type BookNames = 'name' | 'number' | 'hidden';
export type BookCover = 'sage' | 'peach' | 'sky';

export type ClassBookOptions = {
  mode: BookMode;
  title: string;
  cover: BookCover;
  /** Class book only. */
  order: BookOrder; perPage: 1 | 2 | 4; names: BookNames;
  /** Class book only: the student's own words, the teacher's private note. */
  story: boolean; feedback: boolean;
  /** Class book only: approved works that are not linked to a student. */
  unlinked: boolean;
  /** Student books only: A4 for print, or a phone-sized page. */
  format: 'a4' | 'mobile';
  dedication: string;
};

export type BookItem = {
  key: string; roomId: string; artworkId: string; roomTitle: string;
  title: string; description: string; feedback: string; date: string;
  /** Empty for a work that is not linked to a student. */
  studentId: string; studentName: string; studentNumber: number; artistName: string;
  sourcePath: string; version: string; width: number; height: number;
  /** Where the picture came from, and the document to re-check before printing or download. */
  origin: 'exhibition' | 'homework' | 'board'; ref: string;
};

/** One PDF file: a class volume or one student's book. `indexes` point into BookSnapshot.items, in print order. */
export type BookOutput = {
  kind: BookMode; file: string; title: string; displayName: string;
  studentId: string; volume: number; volumes: number; indexes: number[];
};

export type BookSnapshot = {
  schema: 1; classId: string; className: string; from: string; to: string; createdAt: string;
  options: ClassBookOptions; items: BookItem[]; outputs: BookOutput[];
};

export type JobStatus = 'assets' | 'render' | 'pack' | 'ready' | 'failed' | 'deleting';
export type BookJob = {
  id: string; title: string; mode: BookMode; status: JobStatus; createdAt: string; expiresAt: string;
  /** Works prepared / PDFs rendered / PDFs packed, each against its own total. */
  completed: number; total: number; rendered: number; outputs: number; packed: number;
  /** Works left out because the image or its approval could not be confirmed. */
  skipped: {title: string; reason: string}[];
  fileName: string; size: number; error: string; busy: boolean;
};

export type RoomSummary = {
  id: string; title: string; theme: string; status: 'open' | 'closed'; createdAt: string;
  approved: number; linked: number; unlinked: number; firstDate: string; lastDate: string;
};
export type StudentSummary = {id: string; name: string; number: number; works: number};
export type Overview = {classId: string; className: string; rooms: RoomSummary[]; students: StudentSummary[]; truncated: boolean; homeworkCount: number; boardCount: number};
export type PreviewItem = {key: string; title: string; date: string; roomTitle: string; who: string; thumbnailUrl: string};
/** `homework` adds checked homework photos, `board` adds published board photos. A work already hanging in a chosen room is not added twice. */
export type Selection = {roomIds: string[]; studentIds: string[]; from: string; to: string; exclude: string[]; homework: boolean; board: boolean};
