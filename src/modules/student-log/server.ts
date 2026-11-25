import 'server-only';
import {NextResponse} from 'next/server';
import {db} from '@/lib/server/admin';
import {assertOrigin, requireTeacher} from '@/lib/server/auth';
import {AiError} from '@/lib/server/ai-policy';
import {ApiError} from '@/lib/server/policy';
import {attachmentTexts, attachmentsAvailable, teacherAiText} from '@/modules/attachments/server';
import {studentRecords} from '@/modules/student-records/server';
import {RECORD_KIND_LABELS} from '@/modules/student-records/types';
import {openEnvelope, sealEnvelope, vaultKey} from '@/modules/teacher-notebook/vault';
import {NotebookError} from '@/modules/teacher-notebook/policy';
import {workspaceOpenFor} from '@/modules/teacher-workspace/server';
import {LogInputError, MAX_FILES, MAX_SUMMARY, SUMMARY_INSTRUCTIONS, logInput, seoulToday, summaryMaterial, type SummaryMaterial} from './policy';
import {LOG_KIND_LABELS, type LogFile, type LogKind, type StudentLogEntry, type StudentLogs, type StudentSummary} from './types';

/**
 * 행동발달 누가기록. One document per note about one student, written by the class teacher only.
 * Bodies and summaries are sealed with the notebook vault (own label), like work items. Files are teacher
 * attachments: the note keeps their ids and names, the originals stay in Storage.
 */
type Stored = {classId: string; studentId: string; date: string; kind: LogKind; body: unknown; files: LogFile[]; createdAt: string; updatedAt: string};
type StoredSummary = {classId: string; studentId: string; text: unknown; createdAt: string; entries: number; comments: number};
const ID = /^[A-Za-z0-9_-]{1,200}$/, LIMIT = 3000;
const json = (value: unknown, status = 200) => NextResponse.json(value, {status, headers: {'Cache-Control': 'private, no-store'}});
const space = (uid: string) => db().collection('teacherWorkspaces').doc(uid);
const logs = (uid: string) => space(uid).collection('studentLogs');
const summaries = (uid: string) => space(uid).collection('studentSummaries');
const key = () => vaultKey('student-log');
const seal = (uid: string, id: string, body: string) => sealEnvelope(key(), ['student-log', uid, id], body);
const open = (uid: string, id: string, body: unknown) => openEnvelope(key(), ['student-log', uid, id], body) ?? '';
const safeId = (value: unknown, label: string) => {if (typeof value !== 'string' || !ID.test(value)) throw new ApiError(400, `${label}을(를) 확인해 주세요.`); return value;};
const entry = (uid: string, id: string, data: Stored): StudentLogEntry => ({id, studentId: data.studentId, date: data.date, kind: data.kind, body: open(uid, id, data.body), files: Array.isArray(data.files) ? data.files : [], createdAt: data.createdAt, updatedAt: data.updatedAt});

async function ownClass(uid: string, classId: unknown) {
  const cls = await db().doc(`classes/${safeId(classId, '학급')}`).get();
  if (!cls.exists || cls.data()?.ownerUid !== uid) throw new ApiError(404, '학급을 찾을 수 없어요.');
  return cls;
}
async function roster(classId: string) {
  const snap = await db().collection(`classes/${classId}/students`).limit(300).get();
  return snap.docs.filter(doc => !doc.data().disabled).map(doc => ({id: doc.id, name: String(doc.data().name || ''), number: Number(doc.data().number) || 0})).sort((a, b) => a.number - b.number || a.name.localeCompare(b.name, 'ko'));
}
async function input(request: Request) {
  const raw = await request.text();
  if (raw.length > 30_000) throw new ApiError(413, '내용이 너무 커요.');
  try {const data = JSON.parse(raw || '{}'); if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;} catch {}
  throw new ApiError(400, '입력 내용을 확인해 주세요.');
}
/** Only the teacher's own, finished attachments can be tied to a note. */
async function filesOf(uid: string, ids: string[]): Promise<LogFile[]> {
  if (!ids.length) return [];
  return (await attachmentTexts(uid, ids, MAX_FILES)).map(file => ({id: file.id, name: file.name}));
}

async function list(uid: string, classId: string): Promise<StudentLogs> {
  const cls = await ownClass(uid, classId);
  const [students, entries, made] = await Promise.all([
    roster(cls.id),
    logs(uid).where('classId', '==', cls.id).limit(LIMIT).get(),
    summaries(uid).where('classId', '==', cls.id).limit(400).get(),
  ]);
  return {
    classId: cls.id, className: String(cls.data()!.name || '우리 반'), students,
    entries: entries.docs.map(doc => entry(uid, doc.id, doc.data() as Stored)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    summaries: made.docs.map(doc => {const data = doc.data() as StoredSummary; return {studentId: data.studentId, text: open(uid, doc.id, data.text), createdAt: data.createdAt, entries: data.entries, comments: data.comments};}),
  };
}
async function save(uid: string, classId: string, value: Record<string, unknown>, id?: string) {
  const cls = await ownClass(uid, classId), data = logInput(value);
  if (!(await db().doc(`classes/${cls.id}/students/${data.studentId}`).get()).exists) throw new ApiError(404, '학생을 찾을 수 없어요.');
  const ref = id ? logs(uid).doc(safeId(id, '기록')) : logs(uid).doc(), now = new Date().toISOString();
  const old = id ? (await ref.get()).data() as Stored | undefined : undefined;
  if (id && (!old || old.classId !== cls.id)) throw new ApiError(404, '기록을 찾을 수 없어요.');
  const stored: Stored = {classId: cls.id, studentId: data.studentId, date: data.date, kind: data.kind, body: seal(uid, ref.id, data.body), files: await filesOf(uid, data.attachmentIds), createdAt: old?.createdAt ?? now, updatedAt: now};
  await ref.set(stored);
  return entry(uid, ref.id, stored);
}
async function remove(uid: string, classId: string, id: string) {
  const ref = logs(uid).doc(safeId(id, '기록')), snap = await ref.get();
  if (!snap.exists || (snap.data() as Stored).classId !== classId) throw new ApiError(404, '기록을 찾을 수 없어요.');
  // The attached originals stay in the teacher's files; only this note goes.
  await ref.delete();
  return {deleted: true};
}

/** 평어: everything recorded about one student, turned into one positive paragraph. The name never reaches the model. */
async function summarize(request: Request, uid: string, classId: string, value: Record<string, unknown>): Promise<StudentSummary> {
  if (!attachmentsAvailable()) throw new ApiError(503, '평어 정리를 지금은 쓸 수 없어요.', 'AI_UNAVAILABLE');
  const cls = await ownClass(uid, classId), studentId = safeId(value.studentId, '학생');
  const student = await db().doc(`classes/${cls.id}/students/${studentId}`).get();
  if (!student.exists) throw new ApiError(404, '학생을 찾을 수 없어요.');
  const name = String(student.data()!.name || ''), today = seoulToday();
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 399 * 86_400_000).toISOString().slice(0, 10);
  const [own, records] = await Promise.all([
    logs(uid).where('classId', '==', cls.id).where('studentId', '==', studentId).limit(500).get(),
    studentRecords(request, cls.id, new URLSearchParams({from, to: today})),
  ]);
  const material: SummaryMaterial[] = [];
  for (const doc of own.docs) {
    const item = entry(uid, doc.id, doc.data() as Stored);
    // A deleted or unread attachment only costs its own text, never the whole summary.
    const texts = item.files.length ? await attachmentTexts(uid, item.files.map(file => file.id), MAX_FILES).catch(() => []) : [];
    const attached = texts.map(file => `(첨부 ${file.name}: ${file.text.slice(0, 1200)})`).join(' ');
    material.push({date: item.date, label: LOG_KIND_LABELS[item.kind], text: [item.body, attached].filter(Boolean).join(' ')});
  }
  const comments = records.students.find(row => row.id === studentId)?.records ?? [];
  for (const record of comments) material.push({date: record.date, label: RECORD_KIND_LABELS[record.kind], text: `${record.title}: ${record.text}`});
  if (!material.length) throw new ApiError(400, '이 학생에게 쌓인 기록이 아직 없어요. 기록을 먼저 남겨 주세요.', 'NO_RECORDS');
  const text = (await teacherAiText(uid, 'student-summary', SUMMARY_INSTRUCTIONS, summaryMaterial(material, name), {maxTokens: 1500, nonce: new Date().toISOString()})).trim().slice(0, MAX_SUMMARY);
  if (!text) throw new AiError(502, '정리한 결과를 읽지 못했어요. 다시 시도해 주세요.', 'AI_INVALID_RESPONSE');
  const id = `${cls.id}_${studentId}`.slice(0, 400), createdAt = new Date().toISOString();
  const stored: StoredSummary = {classId: cls.id, studentId, text: seal(uid, id, text), createdAt, entries: own.size, comments: comments.length};
  await summaries(uid).doc(id).set(stored);
  return {studentId, text, createdAt, entries: own.size, comments: comments.length};
}

export async function handleStudentLog(request: Request, segments: string[]) {
  try {
    const method = request.method, [classId, id] = segments;
    if (method !== 'GET') assertOrigin(request);
    const ctx = await requireTeacher(request);
    if (!workspaceOpenFor(ctx)) throw new ApiError(403, '아직 준비 중인 기능이에요.', 'WORKSPACE_DISABLED');
    if (!classId || segments.length > 2) throw new ApiError(404, '찾을 수 없어요.');
    if (method === 'GET' && !id) return json(await list(ctx.uid, classId));
    if (method === 'POST' && !id) return json({entry: await save(ctx.uid, classId, await input(request))}, 201);
    if (method === 'POST' && id === 'summary') return json({summary: await summarize(request, ctx.uid, classId, await input(request))});
    if (method === 'POST' && id) return json({entry: await save(ctx.uid, classId, await input(request), id)});
    if (method === 'DELETE' && id) return json(await remove(ctx.uid, classId, id));
    throw new ApiError(404, '찾을 수 없어요.');
  } catch (error) {
    if (error instanceof LogInputError) return json({error: error.message}, 400);
    if (error instanceof ApiError || error instanceof NotebookError) return json({error: error.message, code: (error as ApiError).code}, (error as ApiError).status ?? 400);
    console.error('[student-log]', error instanceof Error ? error.message : 'unknown');
    return json({error: '처리하지 못했어요. 잠시 후 다시 시도해 주세요.'}, 500);
  }
}
