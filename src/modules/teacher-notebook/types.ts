export const NOTEBOOK_TAGS = ['learning', 'life', 'friends', 'counsel', 'health', 'family', 'parent', 'etc'] as const;
export type NotebookTag = typeof NOTEBOOK_TAGS[number];
export const NOTEBOOK_TAG_LABELS: Record<NotebookTag, string> = {learning: '학습', life: '생활', friends: '교우관계', counsel: '상담', health: '건강', family: '가정', parent: '학부모 연락', etc: '기타'};
/** Entries with these tags are always sensitive: excluded from reports, handoff and MCP unless chosen. */
export const SENSITIVE_TAGS: readonly NotebookTag[] = ['counsel', 'health', 'family'];
export type NotebookStudentRef = {classId: string; studentId: string};
export type NotebookEntry = {id: string; date: string; body: string; students: NotebookStudentRef[]; tags: NotebookTag[]; sensitive: boolean; createdAt: string; updatedAt: string; pending?: boolean; source?: 'chat'; files?: NotebookFile[]};
/** A teacher attachment tied to a record: the original stays in Storage and downloads through /api/attachments/{id}/download. */
export type NotebookFile = {id: string; name: string};
export type NotebookDaySummary = {entries: number; students: number; sensitive: number; todos?: number};
export type NotebookTodo = {id: string; text: string; due: string | null; done: boolean; createdAt: string};
export type NotebookRosterStudent = {id: string; name: string; number: number};
export type NotebookRosterClass = {id: string; name: string; students: NotebookRosterStudent[]};
export type NotebookStatus = {available: boolean; unlocked: boolean; expiresAt: number | null; hasPassword?: boolean};
export type NotebookAccessMode = 'off' | 'allowlist' | 'all';
export type NotebookAccessConfig = {mode: NotebookAccessMode; teacherUids: string[]};
export type NotebookAuditEvent = {id: string; action: string; target: string | null; at: string; details: Record<string, unknown>};
