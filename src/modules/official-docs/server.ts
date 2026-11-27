import 'server-only';
import {NextResponse} from 'next/server';
import {db} from '@/lib/server/admin';
import {assertOrigin, requireTeacher} from '@/lib/server/auth';
import {AiError} from '@/lib/server/ai-policy';
import {ApiError} from '@/lib/server/policy';
import {STORE_ONLY_NOTE} from '@/modules/attachments/policy';
import {attachmentTexts, attachmentsAvailable, teacherAiText} from '@/modules/attachments/server';
import {calendarInput} from '@/modules/teacher-workspace/policy';
import {createCalendarEvent, workspaceOpenFor} from '@/modules/teacher-workspace/server';
import {
  DRAFT_INSTRUCTIONS, DRAFT_MAX, MATERIAL_MAX, OFFICIAL_SCHEMA, analysisInstructions, deadlineTitle, looksOfficial, officialAnalysis,
  type OfficialAnalysis, type OfficialCalendarLink, type OfficialDoc, type OfficialDraft,
} from './policy';

/**
 * 공문처리. A teacher's official document (an attachment) is read once into a summary, deadlines and to-dos.
 * Each deadline becomes a calendar event of kind "deadline", which Berry's event feed turns into a reminder.
 * The reply document is drafted on request and edited by the teacher; nothing is ever sent anywhere from here.
 */
type Stored = Omit<OfficialDoc, 'id'>;
const ID = /^[A-Za-z0-9]{12,40}$/;
const json = (value: unknown, status = 200) => NextResponse.json(value, {status, headers: {'Cache-Control': 'private, no-store'}});
const docs = (uid: string) => db().collection('teacherWorkspaces').doc(uid).collection('officialDocs');
const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const safeId = (value: unknown) => {if (typeof value !== 'string' || !ID.test(value)) throw new ApiError(400, '공문을 확인해 주세요.'); return value;};
const view = (id: string, data: Stored): OfficialDoc => ({...data, id, deadlines: Array.isArray(data.deadlines) ? data.deadlines : [], actions: Array.isArray(data.actions) ? data.actions : [], draft: data.draft ?? null, done: !!data.done});

async function sourceText(uid: string, attachmentId: string) {
  const [file] = await attachmentTexts(uid, [attachmentId], 1);
  if (!file || !file.text.trim() || file.text === STORE_ONLY_NOTE) throw new ApiError(422, '이 파일은 내용을 글로 읽지 못했어요. PDF·한글(HWP/HWPX)·사진으로 올려 주세요.', 'OFFICIAL_UNREADABLE');
  return file;
}
async function analyse(uid: string, text: string): Promise<OfficialAnalysis> {
  const answer = await teacherAiText(uid, 'official-doc', analysisInstructions(today()), text.slice(0, MATERIAL_MAX), {maxTokens: 3500, format: {name: 'official_document', schema: OFFICIAL_SCHEMA}});
  try {return officialAnalysis(JSON.parse(answer));} catch {throw new AiError(502, '공문을 정리한 결과를 읽지 못했어요. 다시 시도해 주세요.', 'AI_INVALID_RESPONSE');}
}
/** One calendar event per deadline. A time, when the document gives one, goes into the title; the event itself is all-day. */
async function toCalendar(uid: string, analysis: OfficialAnalysis): Promise<OfficialCalendarLink[]> {
  const links: OfficialCalendarLink[] = [];
  for (const deadline of analysis.deadlines) {
    const what = deadline.time ? `${deadline.time}까지 ${deadline.what}` : deadline.what;
    const event = await createCalendarEvent(uid, calendarInput({title: deadlineTitle(what, analysis.title), start: deadline.date, allDay: true, kind: 'deadline'}), 'activity').catch(() => null);
    links.push({...deadline, eventId: event?.id ?? null});
  }
  return links;
}

/** Registers an attachment as an official document. The same file is never analysed twice. */
export async function registerOfficialDoc(uid: string, attachmentId: unknown, source: 'upload' | 'berry'): Promise<OfficialDoc> {
  const id = safeId(attachmentId), existing = await docs(uid).where('attachmentId', '==', id).limit(1).get();
  if (!existing.empty) return view(existing.docs[0].id, existing.docs[0].data() as Stored);
  const file = await sourceText(uid, id), analysis = await analyse(uid, file.text);
  const stored: Stored = {...analysis, title: analysis.title || file.name, attachmentId: id, fileName: file.name, deadlines: await toCalendar(uid, analysis), draft: null, done: false, source, createdAt: new Date().toISOString()};
  const ref = docs(uid).doc();
  await ref.set(stored);
  return view(ref.id, stored);
}
export async function listOfficialDocs(uid: string, limit = 100) {
  const snap = await docs(uid).orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map(doc => view(doc.id, doc.data() as Stored));
}
/** Files attached to Berry that read like an official document are registered here too; anything else is left alone. */
async function detect(uid: string, ids: unknown) {
  if (!Array.isArray(ids) || ids.length > 3) throw new ApiError(400, '파일을 확인해 주세요.');
  const files = await attachmentTexts(uid, ids, 3).catch(() => []), registered: OfficialDoc[] = [];
  for (const file of files) if (looksOfficial(file.text)) registered.push(await registerOfficialDoc(uid, file.id, 'berry'));
  return {registered};
}
async function owned(uid: string, id: string) {
  const ref = docs(uid).doc(safeId(id)), snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, '공문을 찾을 수 없어요.', 'NOT_FOUND');
  return {ref, data: snap.data() as Stored};
}
async function draft(uid: string, id: string, input: Record<string, unknown>) {
  const {ref, data} = await owned(uid, id), file = await sourceText(uid, data.attachmentId);
  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 4000) : '';
  const material = [
    `[공문 분석]\n${JSON.stringify({title: data.title, sender: data.sender, summary: data.summary, actions: data.actions, submission: data.submission, deadlines: data.deadlines.map(({what, date, time}) => ({what, date, time}))})}`,
    `[공문 원문]\n${file.text.slice(0, MATERIAL_MAX)}`,
    notes ? `[선생님 메모]\n${notes}` : '',
  ].filter(Boolean).join('\n\n');
  const text = (await teacherAiText(uid, 'official-doc-draft', DRAFT_INSTRUCTIONS, material, {maxTokens: 5000, nonce: new Date().toISOString()})).trim().slice(0, DRAFT_MAX);
  if (!text) throw new AiError(502, '문서를 만들지 못했어요. 다시 시도해 주세요.', 'AI_INVALID_RESPONSE');
  const made: OfficialDraft = {text, createdAt: new Date().toISOString(), note: notes};
  await ref.update({draft: made});
  return view(ref.id, {...data, draft: made});
}
async function update(uid: string, id: string, input: Record<string, unknown>) {
  const {ref, data} = await owned(uid, id), patch: Partial<Stored> = {};
  if (typeof input.done === 'boolean') patch.done = input.done;
  if (typeof input.draftText === 'string') {
    const text = input.draftText.replace(/\r\n?/g, '\n').slice(0, DRAFT_MAX);
    patch.draft = {text, createdAt: data.draft?.createdAt ?? new Date().toISOString(), note: data.draft?.note ?? ''};
  }
  if (Object.keys(patch).length) await ref.update(patch);
  return view(ref.id, {...data, ...patch});
}
async function body(request: Request) {
  const raw = await request.text();
  if (raw.length > 40_000) throw new ApiError(413, '내용이 너무 커요.');
  try {const data = JSON.parse(raw || '{}'); if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;} catch {}
  throw new ApiError(400, '입력 내용을 확인해 주세요.');
}

export async function handleOfficialDocs(request: Request, segments: string[]) {
  try {
    const method = request.method, [head, action] = segments;
    if (method !== 'GET') assertOrigin(request);
    const ctx = await requireTeacher(request);
    if (!workspaceOpenFor(ctx)) {
      // Berry asks after every attachment; a teacher without the workspace simply has nothing registered.
      if (method === 'POST' && head === 'detect') return json({registered: []});
      throw new ApiError(403, '아직 준비 중인 기능이에요.', 'WORKSPACE_DISABLED');
    }
    if (segments.length > 2) throw new ApiError(404, '찾을 수 없어요.');
    if (method === 'GET' && !head) return json({available: attachmentsAvailable(), docs: await listOfficialDocs(ctx.uid)});
    if (method === 'DELETE' && head && !action) {const {ref} = await owned(ctx.uid, head); await ref.delete(); return json({deleted: true});}
    if (method !== 'POST') throw new ApiError(404, '찾을 수 없어요.');
    if (head && !action && head !== 'detect') return json({doc: await update(ctx.uid, head, await body(request))});
    if (!attachmentsAvailable()) throw new ApiError(503, '공문 분석을 지금은 쓸 수 없어요.', 'AI_UNAVAILABLE');
    if (!head) return json({doc: await registerOfficialDoc(ctx.uid, (await body(request)).attachmentId, 'upload')}, 201);
    if (head === 'detect' && !action) return json(await detect(ctx.uid, (await body(request)).attachmentIds));
    if (action === 'draft') return json({doc: await draft(ctx.uid, head, await body(request))});
    throw new ApiError(404, '찾을 수 없어요.');
  } catch (error) {
    if (error instanceof ApiError) return json({error: error.message, code: error.code}, error.status);
    const known = error as {status?: number; message?: string};
    if (typeof known.status === 'number' && known.status < 500 && known.message) return json({error: known.message}, known.status);
    console.error('[official-docs]', error instanceof Error ? error.message : 'unknown');
    return json({error: '처리하지 못했어요. 잠시 후 다시 시도해 주세요.'}, 500);
  }
}
