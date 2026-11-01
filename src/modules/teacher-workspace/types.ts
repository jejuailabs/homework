/** Teacher workspace: time, lessons and work folders. Server-only storage under teacherWorkspaces/{uid}. */
export const CALENDAR_KINDS = ['school', 'lesson', 'meeting', 'personal', 'deadline'] as const;
export type CalendarKind = typeof CALENDAR_KINDS[number];
export const CALENDAR_KIND_LABELS: Record<CalendarKind, string> = {school: '학교', lesson: '수업', meeting: '회의', personal: '개인', deadline: '마감'};
export const WORKSPACE_SOURCES = ['form', 'import', 'chat', 'activity'] as const;
export type WorkspaceSource = typeof WORKSPACE_SOURCES[number];
export const FOLDER_KINDS = ['class', 'admin', 'assessment', 'event', 'training', 'etc'] as const;
export type FolderKind = typeof FOLDER_KINDS[number];
export const FOLDER_KIND_LABELS: Record<FolderKind, string> = {class: '학급', admin: '행정', assessment: '평가', event: '행사', training: '연수', etc: '기타'};
export const ITEM_TYPES = ['note', 'file', 'checklist', 'link'] as const;
export type ItemType = typeof ITEM_TYPES[number];
export const ITEM_TYPE_LABELS: Record<ItemType, string> = {note: '메모', file: '파일', checklist: '체크리스트', link: '링크'};
export type Sensitivity = 'normal' | 'sensitive';
export type WorkspaceStudentRef = {classId: string; studentId: string};

export type CalendarEvent = {
  id: string; title: string; start: string; end: string; allDay: boolean; kind: CalendarKind; classId: string | null;
  source: WorkspaceSource; pending: boolean; startDate: string; endDate: string; readOnly?: boolean; assignmentId?: string;
};
export type TimetableSlot = {day: number; period: number; subject: string; room?: string; classId?: string};
export type Timetable = {weekKey: string; slots: TimetableSlot[]; source: WorkspaceSource | null; inheritedFrom: string | null; updatedAt: string | null};
export type LessonEntry = {id: string; period?: number; subject: string; unit?: string; note: string; source: WorkspaceSource; pending: boolean};
export type LessonDay = {date: string; entries: LessonEntry[]; updatedAt: string};
export type WorkFolder = {id: string; name: string; kind: FolderKind; parentId: string | null; createdAt: string};
export type ChecklistItem = {text: string; done: boolean};
export type WorkFileMeta = {fileId: string; fileName: string; contentType: string; size: number};
/** List view: never carries the body. */
export type WorkItemSummary = {
  id: string; folderId: string; type: ItemType; title: string; dueAt: string | null; tags: string[]; classId: string | null;
  sensitivity: Sensitivity; source: WorkspaceSource; pending: boolean; hasFile: boolean; updatedAt: string;
};
export type WorkItem = WorkItemSummary & {body: string; url: string | null; checklist: ChecklistItem[]; students: WorkspaceStudentRef[]; file: WorkFileMeta | null; createdAt: string};

/** Write-side event log line. Summaries are generic: no student names, no bodies, no titles. */
export const WORKSPACE_EVENT_TYPES = [
  'calendar.created', 'calendar.updated', 'calendar.deleted', 'calendar.imported', 'calendar.confirmed',
  'timetable.saved', 'lesson.saved', 'lesson.confirmed',
  'folder.created', 'folder.updated', 'folder.deleted',
  'item.created', 'item.updated', 'item.deleted', 'item.confirmed', 'item.file',
  'notebook.created', 'notebook.confirmed', 'workspace.exported',
] as const;
export type WorkspaceEventType = typeof WORKSPACE_EVENT_TYPES[number];
export type WorkspaceLogEvent = {id: string; type: WorkspaceEventType; at: string; ref: {collection: string; id: string}; summary: string; sensitive: boolean};
