// 쪽지: a simple message thread between the teacher and one student, inside 카드놀이. Pure rules for the server and the screens.
// The teacher can always write and can delete any message; a student writes to the teacher only while the teacher has notes on for
// the class. There is no student-to-student path: a thread belongs to exactly one student and their teacher.
export const NOTE_TEXT_LIMIT = 500;
export const NOTE_STUDENT_PER_HOUR = 10;
export const NOTE_THREAD_PAGE = 100;
export type CardNote = {id: string; from: 'teacher' | 'student'; text: string; createdAt: string; read: boolean};
export type CardNoteThread = {studentId: string; name: string; number: number; lastAt: string | null; lastFrom: 'teacher' | 'student' | null; preview: string; unread: number};

/** Trimmed, inner runs of blank lines squeezed, 1–500 characters. Returns null when there is nothing to send or it is too long. */
export function noteText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text && [...text].length <= NOTE_TEXT_LIMIT ? text : null;
}
/** A one-line preview for the thread list. */
export const notePreview = (text: string) => [...text.replace(/\s+/gu, ' ')].slice(0, 60).join('');
/** The student's sends within the last hour, oldest dropped; `allowed` says whether one more may go now. */
export function noteRate(recent: unknown, now: number) {
  const kept = (Array.isArray(recent) ? recent : []).filter((at): at is number => typeof at === 'number' && now - at < 3600_000 && at <= now).slice(-NOTE_STUDENT_PER_HOUR);
  return {kept, allowed: kept.length < NOTE_STUDENT_PER_HOUR};
}
/** Threads for the teacher's list: every current student, those with unread notes first, then the latest, then by number. */
export function sortThreads(threads: CardNoteThread[]) {
  return [...threads].sort((a, b) => (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0) || (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || a.number - b.number);
}
