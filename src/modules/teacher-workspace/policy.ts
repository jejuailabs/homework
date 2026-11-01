import {createHash} from 'node:crypto';
import {CALENDAR_KINDS, CALENDAR_KIND_LABELS, FOLDER_KINDS, ITEM_TYPES, type CalendarEvent, type CalendarKind, type ChecklistItem, type FolderKind, type ItemType, type LessonEntry, type Sensitivity, type TimetableSlot, type WorkItemSummary, type WorkspaceEventType, type WorkspaceSource, type WorkspaceStudentRef} from './types';

export class WorkspaceError extends Error {constructor(message: string, public status = 400, public code = 'INVALID_REQUEST') {super(message);}}
export const MAX_TITLE = 120, MAX_FOLDER_NAME = 80, MAX_ITEM_BODY = 8000, MAX_LESSON_NOTE = 500, MAX_SUBJECT = 40, MAX_UNIT = 80;
export const MAX_IMPORT = 500, MAX_EVENT_DAYS = 92, MAX_RANGE_DAYS = 400, MAX_LESSON_ENTRIES = 12, MAX_TAGS = 10, MAX_TAG = 20;
export const MAX_CHECKLIST = 50, MAX_FOLDER_DEPTH = 4, MAX_FOLDERS = 300, MAX_STUDENTS = 40, DEFAULT_RETENTION_DAYS = 365;
export const WORKSPACE_FILE_BYTES = 50 * 1024 * 1024;
const DAY = 86_400_000, SEOUL_OFFSET = 9 * 3_600_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/, ID = /^[A-Za-z0-9_-]{1,200}$/;

/** Students and the kill switch: the workspace is for teachers only and can be stopped without deleting data. */
export const workspaceAllowed = (role: string, killSwitch?: string) => killSwitch !== 'true' && role !== 'student';
export const safeId = (value: unknown, label = '항목') => {
  if (typeof value !== 'string' || !ID.test(value)) throw new WorkspaceError(`${label}을(를) 확인해 주세요.`);
  return value;
};
export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

// ---- Dates. Korea has no daylight saving, so Asia/Seoul is always UTC+9. ----
export function isoDate(value: unknown, label = '날짜'): string {
  if (typeof value !== 'string' || !DATE.test(value)) throw new WorkspaceError(`${label}를 확인해 주세요.`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < '2020-01-01' || value > '2100-12-31') throw new WorkspaceError(`${label}를 확인해 주세요.`);
  return value;
}
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
/** Seoul calendar date of an instant. */
export const seoulDate = (value: string | number) => new Date((typeof value === 'number' ? value : Date.parse(value)) + SEOUL_OFFSET).toISOString().slice(0, 10);
/** Instant of 00:00 Seoul on a date. */
export const seoulMidnight = (date: string) => Date.parse(`${date}T00:00:00Z`) - SEOUL_OFFSET;
export function rangeInput(fromValue: unknown, toValue: unknown, maxDays = MAX_RANGE_DAYS) {
  const from = isoDate(fromValue, '시작일'), to = isoDate(toValue, '종료일');
  if (to < from) throw new WorkspaceError('종료일이 시작일보다 앞서 있어요.');
  if (daysBetween(from, to) > maxDays) throw new WorkspaceError(`기간은 ${maxDays}일까지 고를 수 있어요.`);
  return {from, to};
}

/**
 * "2026-11-05" (a whole day), "2026-11-05 09:00" / "2026-11-05T09:00" (Seoul wall clock),
 * or a full ISO instant with Z or an offset.
 */
export function parseInstant(value: unknown, label = '시각'): {ms: number; dateOnly: boolean; date: string} {
  if (typeof value !== 'string' || value.length > 40) throw new WorkspaceError(`${label}을(를) 확인해 주세요.`);
  const text = value.trim();
  if (DATE.test(text)) return {ms: seoulMidnight(isoDate(text, label)), dateOnly: true, date: text};
  const local = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (local) {
    const [, date, h, m, s] = local;
    isoDate(date, label);
    if (Number(h) > 23 || Number(m) > 59 || Number(s ?? 0) > 59) throw new WorkspaceError(`${label}을(를) 확인해 주세요.`);
    const ms = seoulMidnight(date) + (Number(h) * 60 + Number(m)) * 60_000 + Number(s ?? 0) * 1000;
    return {ms, dateOnly: false, date};
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(text)) {
    const ms = Date.parse(text);
    if (Number.isNaN(ms)) throw new WorkspaceError(`${label}을(를) 확인해 주세요.`);
    const date = seoulDate(ms);
    isoDate(date, label);
    return {ms, dateOnly: false, date};
  }
  throw new WorkspaceError(`${label}을(를) YYYY-MM-DD 또는 YYYY-MM-DD HH:mm으로 적어 주세요.`);
}

function cleanText(value: unknown, label: string, max: number, optional = false): string {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string') throw new WorkspaceError(`${label}을(를) 확인해 주세요.`);
  const text = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!optional && !text) throw new WorkspaceError(`${label}을(를) 입력해 주세요.`);
  if (text.length > max) throw new WorkspaceError(`${label}은(는) ${max}자까지 쓸 수 있어요.`);
  return text;
}
const oneLine = (value: unknown, label: string, max: number, optional = false) => cleanText(value, label, max, optional).replace(/\s*\n\s*/g, ' ');
const optionalId = (value: unknown, label: string) => value === undefined || value === null || value === '' ? null : safeId(value, label);

// ---- Calendar ----
export type CalendarInput = {title: string; start: string; end: string; allDay: boolean; kind: CalendarKind; classId: string | null};
/** All-day events are stored from Seoul midnight to the Seoul midnight after the last day (exclusive). */
export function calendarInput(value: Record<string, unknown>): CalendarInput {
  const title = oneLine(value.title, '일정 제목', MAX_TITLE);
  const kind = value.kind === undefined ? 'school' : value.kind;
  if (!CALENDAR_KINDS.includes(kind as CalendarKind)) throw new WorkspaceError('일정 종류를 확인해 주세요.');
  const start = parseInstant(value.start, '시작'), end = value.end === undefined || value.end === null || value.end === '' ? null : parseInstant(value.end, '끝');
  const allDay = value.allDay === true || (value.allDay !== false && start.dateOnly && (!end || end.dateOnly));
  let startMs: number, endMs: number;
  if (allDay) {
    const last = end ? end.date : start.date;
    if (last < start.date) throw new WorkspaceError('끝 날짜가 시작보다 앞서 있어요.');
    startMs = seoulMidnight(start.date); endMs = seoulMidnight(addDays(last, 1));
  } else {
    if (start.dateOnly || end?.dateOnly) throw new WorkspaceError('시간이 있는 일정은 시작과 끝에 시각을 함께 적어 주세요.');
    startMs = start.ms; endMs = end ? end.ms : start.ms + 3_600_000;
    if (endMs < startMs) throw new WorkspaceError('끝 시각이 시작보다 앞서 있어요.');
  }
  if (endMs - startMs > MAX_EVENT_DAYS * DAY) throw new WorkspaceError(`일정 하나는 ${MAX_EVENT_DAYS}일까지 이어질 수 있어요.`);
  return {title, start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), allDay, kind: kind as CalendarKind, classId: optionalId(value.classId, '학급')};
}
/** Inclusive Seoul dates an event covers, for display and day grouping. */
export function eventDates(start: string, end: string, allDay: boolean) {
  const startMs = Date.parse(start), endMs = Date.parse(end);
  return {startDate: seoulDate(startMs), endDate: seoulDate(allDay ? Math.max(startMs, endMs - 1) : endMs)};
}
/** Query window for events overlapping [from, to]: starts are fetched from MAX_EVENT_DAYS earlier, then filtered. */
export function calendarWindow(from: string, to: string) {
  const fromMs = seoulMidnight(from), toMs = seoulMidnight(addDays(to, 1));
  return {fromMs, toMs, queryStart: new Date(fromMs - MAX_EVENT_DAYS * DAY).toISOString(), queryEnd: new Date(toMs).toISOString()};
}
export function overlaps(start: string, end: string, fromMs: number, toMs: number) {
  const s = Date.parse(start), e = Date.parse(end);
  return s < toMs && (e > fromMs || (e === s && s >= fromMs));
}
export function sortEvents(events: CalendarEvent[]) {
  return events.sort((a, b) => a.start.localeCompare(b.start) || Number(b.allDay) - Number(a.allDay) || a.title.localeCompare(b.title));
}

// ---- ISO week keys ("2026-W45"), Monday first ----
const WEEK = /^(\d{4})-W(\d{2})$/;
function isoWeekParts(date: string) {
  const d = new Date(`${date}T00:00:00Z`), day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear(), week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return {year, week};
}
export function weekKeyOf(date: string) {
  const {year, week} = isoWeekParts(isoDate(date));
  return `${year}-W${String(week).padStart(2, '0')}`;
}
/** Monday to Sunday dates of an ISO week. */
export function weekDates(value: unknown): string[] {
  const match = typeof value === 'string' ? WEEK.exec(value) : null;
  if (!match) throw new WorkspaceError('주차를 2026-W45처럼 적어 주세요.');
  const year = Number(match[1]), week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4)), monday = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * DAY + (week - 1) * 7 * DAY);
  const first = monday.toISOString().slice(0, 10);
  if (week < 1 || weekKeyOf(first) !== value) throw new WorkspaceError('없는 주차예요.');
  return Array.from({length: 7}, (_, i) => addDays(first, i));
}
export const weekKey = (value: unknown) => {weekDates(value); return value as string;};

// ---- Timetable ----
const WEEKDAY_HEADER = /^(월|화|수|목|금|토|일|mon|tue|wed|thu|fri|sat|sun)/i;
function cellSlot(text: string): {subject: string; room?: string} | null {
  const cell = text.replace(/^"|"$/g, '').trim();
  if (!cell || cell === '-') return null;
  const match = /^(.*?)\s*[(（]\s*(.*?)\s*[)）]\s*$/.exec(cell);
  const subject = (match ? match[1] : cell).trim(), room = match?.[2].trim();
  if (!subject) return null;
  if (subject.length > MAX_SUBJECT || (room && room.length > MAX_SUBJECT)) throw new WorkspaceError(`과목·장소는 ${MAX_SUBJECT}자까지 쓸 수 있어요.`);
  return room ? {subject, room} : {subject};
}
/**
 * Pasted spreadsheet text → slots. Rows are periods (1–7), columns are Monday–Friday, split by tabs or commas.
 * An optional weekday header row and an optional "1교시" label column are recognised. "과학(과학실)" carries a room.
 */
export function parseTimetableText(text: string): TimetableSlot[] {
  if (typeof text !== 'string' || text.length > 5000) throw new WorkspaceError('시간표 내용을 확인해 주세요.');
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) throw new WorkspaceError('시간표 내용을 붙여 넣어 주세요.');
  const separator = lines.some(line => line.includes('\t')) ? '\t' : ',';
  let rows = lines.map(line => line.split(separator));
  const header = rows[0].map(cell => cell.trim());
  if (header.filter(cell => WEEKDAY_HEADER.test(cell)).length >= 2) rows = rows.slice(1);
  const slots: TimetableSlot[] = [];
  rows.forEach((row, index) => {
    const label = /^\s*(\d{1,2})\s*(교시)?\s*$/.exec(row[0] ?? '');
    const labelled = !!label || (row.length > 5 && /교시|^\s*$/.test(row[0] ?? ''));
    const period = label ? Number(label[1]) : index + 1, cells = labelled ? row.slice(1) : row;
    while (cells.length && !cells[cells.length - 1].trim()) cells.pop();
    if (period < 1 || period > 7) throw new WorkspaceError('시간표는 1~7교시까지 붙여 넣을 수 있어요.');
    if (cells.length > 5) throw new WorkspaceError('시간표는 월~금 5칸까지 붙여 넣을 수 있어요.');
    cells.forEach((cell, column) => {const slot = cellSlot(cell); if (slot) slots.push({day: column + 1, period, ...slot});});
  });
  return timetableSlots(slots);
}
export function timetableSlots(value: unknown): TimetableSlot[] {
  if (!Array.isArray(value) || value.length > 35) throw new WorkspaceError('시간표 칸을 확인해 주세요.');
  const seen = new Set<string>();
  const slots = value.map(raw => {
    const slot = (raw ?? {}) as Record<string, unknown>, day = Number(slot.day), period = Number(slot.period);
    if (!Number.isInteger(day) || day < 1 || day > 5 || !Number.isInteger(period) || period < 1 || period > 7) throw new WorkspaceError('시간표 칸을 확인해 주세요.');
    if (seen.has(`${day}:${period}`)) throw new WorkspaceError('같은 칸에 두 과목을 넣을 수 없어요.');
    seen.add(`${day}:${period}`);
    const subject = oneLine(slot.subject, '과목', MAX_SUBJECT), room = oneLine(slot.room, '장소', MAX_SUBJECT, true), classId = optionalId(slot.classId, '학급');
    return {day, period, subject, ...(room ? {room} : {}), ...(classId ? {classId} : {})};
  });
  return slots.sort((a, b) => a.day - b.day || a.period - b.period);
}

// ---- Lesson log ----
export type LessonEntryInput = Omit<LessonEntry, 'id' | 'source' | 'pending'> & {id?: string};
export function lessonEntryInput(value: Record<string, unknown>): LessonEntryInput {
  const period = value.period === undefined || value.period === null || value.period === '' ? undefined : Number(value.period);
  if (period !== undefined && (!Number.isInteger(period) || period < 1 || period > 10)) throw new WorkspaceError('교시를 확인해 주세요.');
  const subject = oneLine(value.subject, '과목', MAX_SUBJECT), unit = oneLine(value.unit, '단원', MAX_UNIT, true), note = cleanText(value.note, '수업 메모', MAX_LESSON_NOTE, true);
  const id = value.id === undefined ? undefined : safeId(value.id, '일지 항목');
  return {...(id ? {id} : {}), ...(period ? {period} : {}), subject, ...(unit ? {unit} : {}), note};
}
export function lessonEntries(value: unknown): LessonEntryInput[] {
  if (!Array.isArray(value) || value.length > MAX_LESSON_ENTRIES) throw new WorkspaceError(`하루 일지는 ${MAX_LESSON_ENTRIES}줄까지 쓸 수 있어요.`);
  return value.map(entry => lessonEntryInput((entry ?? {}) as Record<string, unknown>));
}
/** "3교시 국어 [2단원] 비유 표현 찾기" → period 3, subject 국어, unit 2단원, note. Period and unit are optional. */
export function parseLessonLine(line: string): LessonEntryInput {
  const text = cleanText(line, '일지', MAX_LESSON_NOTE + MAX_SUBJECT + MAX_UNIT + 20);
  const match = /^(?:(\d{1,2})\s*(?:교시)?\s+)?([^\s:：]+)(?:\s+\[([^\]]+)\])?\s*[:：-]?\s*([\s\S]*)$/.exec(text);
  if (!match) throw new WorkspaceError('과목을 먼저 적어 주세요.');
  return lessonEntryInput({period: match[1], subject: match[2], unit: match[3], note: match[4]});
}
/**
 * A teacher's save keeps the server's pending flag for entries it already holds; only the confirm action clears it.
 * New lines saved from the form are confirmed by definition.
 */
export function mergeLessonEntries(previous: LessonEntry[], next: LessonEntryInput[], newId: () => string): LessonEntry[] {
  const known = new Map(previous.map(entry => [entry.id, entry]));
  return next.map(entry => {
    const before = entry.id ? known.get(entry.id) : undefined;
    return {...entry, id: before?.id ?? newId(), source: before?.source ?? 'form', pending: before?.pending ?? false};
  });
}

// ---- Folders ----
export function folderInput(value: Record<string, unknown>) {
  const name = oneLine(value.name, '폴더 이름', MAX_FOLDER_NAME);
  const kind = value.kind === undefined ? 'etc' : value.kind;
  if (!FOLDER_KINDS.includes(kind as FolderKind)) throw new WorkspaceError('폴더 종류를 확인해 주세요.');
  return {name, kind: kind as FolderKind, parentId: optionalId(value.parentId, '상위 폴더')};
}
/** Placing `id` (null for a new folder) under `parentId` must keep the tree acyclic and at most MAX_FOLDER_DEPTH deep. */
export function assertFolderPlacement(folders: {id: string; parentId: string | null}[], id: string | null, parentId: string | null) {
  if (!parentId) return;
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  if (!byId.has(parentId)) throw new WorkspaceError('상위 폴더를 찾을 수 없어요.', 404, 'NOT_FOUND');
  let parentDepth = 0;
  for (let cursor: string | null = parentId; cursor; cursor = byId.get(cursor)?.parentId ?? null) {
    if (cursor === id) throw new WorkspaceError('폴더를 자기 안으로 옮길 수 없어요.');
    if (++parentDepth > MAX_FOLDERS) break; // a corrupted loop in stored data
  }
  // Levels below the moved folder travel with it.
  const height = (folderId: string, guard: number): number => guard > MAX_FOLDER_DEPTH ? guard : Math.max(0, ...folders.filter(folder => folder.parentId === folderId).map(folder => 1 + height(folder.id, guard + 1)));
  if (parentDepth + 1 + (id ? height(id, 0) : 0) > MAX_FOLDER_DEPTH) throw new WorkspaceError(`폴더는 ${MAX_FOLDER_DEPTH}단계까지 만들 수 있어요.`);
}

// ---- Folder items ----
export function tagsInput(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new WorkspaceError('태그를 확인해 주세요.');
  const tags = [...new Set(value.map(tag => typeof tag === 'string' ? tag.replace(/^#+/, '').trim() : '').filter(Boolean))];
  if (tags.length > MAX_TAGS || tags.some(tag => tag.length > MAX_TAG || /[\n,]/.test(tag))) throw new WorkspaceError(`태그는 ${MAX_TAG}자 이하로 ${MAX_TAGS}개까지 붙일 수 있어요.`);
  return tags;
}
export function studentRefs(value: unknown): WorkspaceStudentRef[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new WorkspaceError('학생 선택을 확인해 주세요.');
  const seen = new Set<string>(), refs: WorkspaceStudentRef[] = [];
  for (const item of value) {
    const ref = item as Partial<WorkspaceStudentRef> | null;
    if (!ref || typeof ref.classId !== 'string' || typeof ref.studentId !== 'string' || !ID.test(ref.classId) || !ID.test(ref.studentId)) throw new WorkspaceError('학생 선택을 확인해 주세요.');
    const key = `${ref.classId}_${ref.studentId}`;
    if (!seen.has(key)) {seen.add(key); refs.push({classId: ref.classId, studentId: ref.studentId});}
  }
  if (refs.length > MAX_STUDENTS) throw new WorkspaceError(`학생은 ${MAX_STUDENTS}명까지 연결할 수 있어요.`);
  return refs;
}
export type ItemInput = {folderId: string; type: ItemType; title: string; body: string; url: string | null; checklist: ChecklistItem[]; dueAt: string | null; tags: string[]; classId: string | null; students: WorkspaceStudentRef[]; sensitivity: Sensitivity};
export function itemInput(value: Record<string, unknown>): ItemInput {
  const folderId = safeId(value.folderId, '폴더');
  const type = value.type === undefined ? 'note' : value.type;
  if (!ITEM_TYPES.includes(type as ItemType)) throw new WorkspaceError('항목 종류를 확인해 주세요.');
  const title = oneLine(value.title, '제목', MAX_TITLE), body = cleanText(value.body, '내용', MAX_ITEM_BODY, true);
  let url: string | null = null;
  if (type === 'link' || (value.url !== undefined && value.url !== null && value.url !== '')) {
    const raw = typeof value.url === 'string' ? value.url.trim() : '';
    let parsed: URL | null = null;
    try {parsed = new URL(raw);} catch {}
    if (!parsed || !['https:', 'http:'].includes(parsed.protocol) || raw.length > 500 || parsed.username || parsed.password) throw new WorkspaceError('링크 주소(https://…)를 확인해 주세요.');
    url = parsed.toString();
  }
  let checklist: ChecklistItem[] = [];
  if (value.checklist !== undefined && value.checklist !== null) {
    if (!Array.isArray(value.checklist) || value.checklist.length > MAX_CHECKLIST) throw new WorkspaceError(`체크리스트는 ${MAX_CHECKLIST}줄까지 쓸 수 있어요.`);
    checklist = value.checklist.map(raw => {const row = (raw ?? {}) as Record<string, unknown>; return {text: oneLine(row.text, '체크리스트 항목', 200), done: row.done === true};});
  }
  const dueAt = value.dueAt === undefined || value.dueAt === null || value.dueAt === '' ? null : isoDate(value.dueAt, '기한');
  const sensitivity: Sensitivity = value.sensitivity === 'sensitive' || value.sensitive === true ? 'sensitive' : 'normal';
  return {folderId, type: type as ItemType, title, body, url, checklist, dueAt, tags: tagsInput(value.tags), classId: optionalId(value.classId, '학급'), students: studentRefs(value.students), sensitivity};
}
export function itemMatches(item: WorkItemSummary, filter: {q?: string; dueBefore?: string | null; folderKinds?: Map<string, FolderKind>; folderKind?: FolderKind | null}) {
  const q = filter.q?.trim().toLowerCase();
  if (q && !item.title.toLowerCase().includes(q) && !item.tags.some(tag => tag.toLowerCase().includes(q))) return false;
  if (filter.dueBefore && (!item.dueAt || item.dueAt > filter.dueBefore)) return false;
  if (filter.folderKind && filter.folderKinds?.get(item.folderId) !== filter.folderKind) return false;
  return true;
}

// ---- Files ----
const FILE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
  hwp: 'application/x-hwp', hwpx: 'application/vnd.hancom.hwpx', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain', csv: 'text/csv', zip: 'application/zip',
};
export const WORKSPACE_FILE_TYPES = [...new Set(Object.values(FILE_TYPES))];
/** Browsers often report no type for HWP and similar files: fall back to the extension, and keep a known type canonical. */
export function workspaceFileMime(file: {type: string; name: string}) {
  const byExtension = FILE_TYPES[file.name.split('.').at(-1)?.toLowerCase() ?? ''];
  return WORKSPACE_FILE_TYPES.includes(file.type) ? file.type : byExtension ?? file.type;
}
export function workspaceFileInput(value: Record<string, unknown>) {
  const fileName = oneLine(value.fileName, '파일 이름', 200).replace(/[\\/]/g, '_');
  const contentType = value.contentType, size = value.size;
  if (typeof contentType !== 'string' || !WORKSPACE_FILE_TYPES.includes(contentType)) throw new WorkspaceError('사진·PDF·한글·오피스·텍스트·ZIP 파일만 올릴 수 있어요.', 400, 'FILE_TYPE');
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0 || size > WORKSPACE_FILE_BYTES) throw new WorkspaceError('파일은 50MB까지 올릴 수 있어요.', 400, 'FILE_TOO_LARGE');
  return {fileName, contentType, size};
}
/** Ledger values may be missing or corrupted; never let them go negative. */
export function ledger(data: {storageBytes?: unknown; reservedBytes?: unknown} | undefined) {
  const n = (value: unknown) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
  return {storageBytes: n(data?.storageBytes), reservedBytes: n(data?.reservedBytes)};
}

// ---- Calendar import: ICS (RFC 5545 subset) and CSV (제목,시작,끝,종류) ----
export type ImportRow = {title: string; start: string; end: string; allDay: boolean; kind?: string; uid?: string; line: number};
const unescapeIcs = (value: string) => value.replace(/\\([\\;,nN])/g, (_, c: string) => c === 'n' || c === 'N' ? '\n' : c);
const WINDOWS_ZONES: Record<string, string> = {'Korea Standard Time': 'Asia/Seoul', 'Tokyo Standard Time': 'Asia/Tokyo', 'China Standard Time': 'Asia/Shanghai', 'UTC': 'UTC'};
/** Wall-clock time in an IANA zone → UTC milliseconds. Unknown zones fall back to Seoul. */
export function zonedToUtc(parts: [number, number, number, number, number, number], zone: string): number {
  const asUtc = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
  const tz = WINDOWS_ZONES[zone] ?? zone;
  if (tz === 'Asia/Seoul') return asUtc - SEOUL_OFFSET;
  let format: Intl.DateTimeFormat;
  try {format = new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'});} catch {return asUtc - SEOUL_OFFSET;}
  const offsetAt = (ms: number) => {
    const p = Object.fromEntries(format.formatToParts(new Date(ms)).map(part => [part.type, part.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - ms;
  };
  const guess = asUtc - offsetAt(asUtc);
  return asUtc - offsetAt(guess);
}
function icsValue(raw: string, params: Record<string, string>): {value: string; dateOnly: boolean} {
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (date || params.VALUE === 'DATE') {
    if (!date) throw new WorkspaceError('날짜 형식');
    return {value: `${date[1]}-${date[2]}-${date[3]}`, dateOnly: true};
  }
  const time = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(raw);
  if (!time) throw new WorkspaceError('시각 형식');
  const parts = time.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const ms = time[7] ? Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]) : zonedToUtc(parts, params.TZID ?? 'Asia/Seoul');
  return {value: new Date(ms).toISOString(), dateOnly: false};
}
function icsDuration(value: string): number | null {
  const match = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match) return null;
  const [, sign, w, d, h, m, s] = match, ms = ((Number(w ?? 0) * 7 + Number(d ?? 0)) * 86_400 + Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0)) * 1000;
  return sign === '-' ? -ms : ms;
}
export function parseIcs(text: string): {rows: ImportRow[]; errors: {line: number; message: string}[]; warnings: string[]} {
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const rows: ImportRow[] = [], errors: {line: number; message: string}[] = [], warnings = new Set<string>();
  let current: Record<string, {value: string; params: Record<string, string>}> | null = null, startLine = 0, depth = 0;
  lines.forEach((line, index) => {
    if (/^BEGIN:VEVENT$/i.test(line)) {current = {}; startLine = index + 1; depth = 0; return;}
    if (!current) return;
    if (/^BEGIN:/i.test(line)) {depth++; return;}
    if (/^END:/i.test(line) && depth > 0) {depth--; return;}
    if (depth > 0) return; // VALARM and other nested blocks
    if (/^END:VEVENT$/i.test(line)) {
      const event: Record<string, {value: string; params: Record<string, string>}> = current;
      current = null;
      if (event.STATUS?.value.toUpperCase() === 'CANCELLED') return;
      if (event.RRULE) warnings.add('반복 일정은 첫 번째 일정만 가져왔어요.');
      try {
        if (!event.DTSTART) throw new WorkspaceError('시작 시각이 없어요.');
        const start = icsValue(event.DTSTART.value, event.DTSTART.params);
        let end = start;
        if (event.DTEND) end = icsValue(event.DTEND.value, event.DTEND.params);
        else if (event.DURATION) {
          const duration = icsDuration(event.DURATION.value);
          if (duration === null || duration < 0) throw new WorkspaceError('기간 형식');
          end = start.dateOnly ? {value: addDays(start.value, Math.max(1, Math.round(duration / DAY))), dateOnly: true} : {value: new Date(Date.parse(start.value) + duration).toISOString(), dateOnly: false};
        } else if (start.dateOnly) end = {value: addDays(start.value, 1), dateOnly: true};
        // ICS all-day ends are exclusive; the form takes the last day inclusive.
        const allDay = start.dateOnly;
        const endValue = allDay ? (end.dateOnly ? addDays(end.value, -1) : start.value) : end.dateOnly ? start.value : end.value;
        const title = unescapeIcs(event.SUMMARY?.value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) || '(제목 없음)';
        rows.push({title, start: start.value, end: allDay && endValue < start.value ? start.value : endValue, allDay, uid: event.UID?.value.slice(0, 300), line: startLine});
      } catch (error) {errors.push({line: startLine, message: error instanceof WorkspaceError ? `일정을 읽지 못했어요 (${error.message}).` : '일정을 읽지 못했어요.'});}
      return;
    }
    const match = /^([A-Za-z0-9-]+)((?:;[^:;]+=(?:"[^"]*"|[^:;]*))*):(.*)$/.exec(line);
    if (!match) return;
    const params: Record<string, string> = {};
    for (const param of match[2].matchAll(/;([^=;]+)=("([^"]*)"|[^:;]*)/g)) params[param[1].toUpperCase()] = param[3] ?? param[2];
    const name = match[1].toUpperCase();
    if (!(name in current)) current[name] = {value: match[3].trim(), params};
  });
  return {rows, errors, warnings: [...warnings]};
}
/** RFC 4180 CSV with quoted fields; a BOM and CRLF are tolerated. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const source = text.replace(/^﻿/, '');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {cell += '"'; i++;}
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell) quoted = true;
    else if (c === ',') {row.push(cell); cell = '';}
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}
const KIND_BY_LABEL = new Map<string, CalendarKind>([...CALENDAR_KINDS.map(kind => [kind, kind] as [string, CalendarKind]), ...Object.entries(CALENDAR_KIND_LABELS).map(([kind, label]) => [label, kind as CalendarKind] as [string, CalendarKind])]);
export function parseCalendarCsv(text: string): {rows: ImportRow[]; errors: {line: number; message: string}[]; warnings: string[]} {
  const table = parseCsv(text), rows: ImportRow[] = [], errors: {line: number; message: string}[] = [];
  const header = table[0]?.[0]?.trim().toLowerCase();
  const skip = header === '제목' || header === 'title' || header === '일정' ? 1 : 0;
  table.slice(skip).forEach((cells, index) => {
    const line = index + 1 + skip, [title = '', start = '', end = '', kind = ''] = cells.map(cell => cell.trim());
    const mapped = kind ? KIND_BY_LABEL.get(kind) ?? KIND_BY_LABEL.get(kind.toLowerCase()) : undefined;
    if (kind && !mapped) {errors.push({line, message: `종류 "${kind.slice(0, 10)}"를 알 수 없어요.`}); return;}
    rows.push({title, start, end, allDay: DATE.test(start) && (!end || DATE.test(end)), ...(mapped ? {kind: mapped} : {}), line});
  });
  return {rows, errors, warnings: []};
}
export type ImportedEvent = CalendarInput & {importId: string};
/** Validates every parsed row; the deterministic importId lets a re-import update instead of duplicating. */
export function importPreview(format: unknown, text: unknown, defaultKind: CalendarKind = 'school') {
  if (format !== 'ics' && format !== 'csv') throw new WorkspaceError('ICS 또는 CSV 파일을 골라 주세요.');
  if (typeof text !== 'string' || !text.trim()) throw new WorkspaceError('가져올 내용이 비어 있어요.');
  if (text.length > 1_000_000) throw new WorkspaceError('파일이 너무 커요. 1MB 이하로 나눠 주세요.');
  const parsed = format === 'ics' ? parseIcs(text) : parseCalendarCsv(text);
  const events: ImportedEvent[] = [], errors = [...parsed.errors];
  for (const row of parsed.rows) {
    try {
      const value = calendarInput({title: row.title, start: row.start, end: row.end || undefined, allDay: row.allDay, kind: row.kind ?? defaultKind});
      const key = row.uid ? `ics:${row.uid}` : `row:${value.title}|${value.start}|${value.end}`;
      events.push({...value, importId: `imp_${sha256Hex(key).slice(0, 28)}`});
    } catch (error) {errors.push({line: row.line, message: error instanceof WorkspaceError ? error.message : '읽지 못했어요.'});}
  }
  const unique = [...new Map(events.map(event => [event.importId, event])).values()];
  if (unique.length > MAX_IMPORT) throw new WorkspaceError(`한 번에 ${MAX_IMPORT}건까지 가져올 수 있어요. 파일을 나눠 주세요.`);
  return {events: unique, errors: errors.slice(0, 50), warnings: parsed.warnings, hash: sha256Hex(JSON.stringify(unique)).slice(0, 32)};
}

// ---- Export ----
const csvCell = (value: string) => {
  // Neutralize spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
};
export const toCsv = (rows: string[][]) => '﻿' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
/** Archive paths stay inside their folder and readable on Windows. */
export const safeFileName = (value: string) => value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '_').slice(0, 120) || 'file';

// ---- Write-side event log ----
const EVENT_SUMMARIES: Record<WorkspaceEventType, string> = {
  'calendar.created': '일정 추가', 'calendar.updated': '일정 수정', 'calendar.deleted': '일정 삭제', 'calendar.imported': '일정 가져오기', 'calendar.confirmed': '일정 확정',
  'timetable.saved': '시간표 저장', 'lesson.saved': '수업 일지 저장', 'lesson.confirmed': '수업 일지 확정',
  'folder.created': '폴더 추가', 'folder.updated': '폴더 수정', 'folder.deleted': '폴더 삭제',
  'item.created': '업무 항목 추가', 'item.updated': '업무 항목 수정', 'item.deleted': '업무 항목 삭제', 'item.confirmed': '업무 항목 확정', 'item.file': '업무 파일 저장',
  'notebook.created': '교무수첩 기록 추가', 'notebook.confirmed': '교무수첩 기록 확정', 'workspace.exported': '업무 공간 내보내기',
};
/** Generic by construction: a count and a verb, never a title, body or student name. */
export const eventSummary = (type: WorkspaceEventType, count = 1) => `${EVENT_SUMMARIES[type]} ${Math.max(1, Math.floor(count))}건`;
export const sourcePending = (source: WorkspaceSource) => source === 'chat';
