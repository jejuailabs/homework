import 'server-only';
import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {bucket, db} from '@/lib/server/admin';
import {assertOrigin, requireTeacher} from '@/lib/server/auth';
import {runMeteredAi} from '@/lib/server/ai';
import {AiError, completedAiText, providerFailure, readBoundedJson} from '@/lib/server/ai-policy';
import {ApiError} from '@/lib/server/policy';
import {documentText} from './documents';
import {
  AttachError, KEEP_FILES, LESSON_INSTRUCTIONS, LESSON_SCHEMA, MAX_PER_MESSAGE, PREVIEW_CHARS, READ_INSTRUCTIONS, TEXT_MAX, TIMETABLE_INSTRUCTIONS, TIMETABLE_SCHEMA,
  assertContent, attachmentInput, clip, extensionOf, lessonDraft, sizeLimit, tidy, timetableDraft, type AttachKind, type AttachStatus, type AttachmentView,
} from './policy';

/**
 * Teacher attachments (Berry, timetable, lesson log). The browser uploads straight to Storage with a signed URL, so
 * no file body passes through Vercel. Reading turns the file into text once, keeps the text and deletes the original.
 */
type Doc = {name: string; kind: AttachKind; size: number; path: string; status: AttachStatus; stored: boolean; text: string; error: string | null; createdAt: string; readAt?: string};
const json = (value: unknown, status = 200) => NextResponse.json(value, {status, headers: {'Cache-Control': 'private, no-store'}});
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const ID = /^[A-Za-z0-9]{12,40}$/, UPLOAD_WINDOW = 15 * 60_000, STALE_MS = 60 * 60_000, MATERIAL_MAX = 20_000;
const files = (uid: string) => db().collection('teacherAttachments').doc(uid).collection('files');
const pathOf = (uid: string, id: string) => `teacher-attachments/${uid}/${id}`;
const model = () => process.env.ATTACH_AI_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-6-luna';
const transcribeModel = () => process.env.ATTACH_TRANSCRIBE_MODEL?.trim() || 'gpt-transcribe';
export const attachmentsAvailable = () => process.env.ATTACHMENTS_DISABLED !== 'true' && Boolean(process.env.OPENAI_API_KEY?.trim());
const view = (id: string, doc: Doc): AttachmentView => ({id, name: doc.name, kind: doc.kind, size: doc.size, status: doc.status, chars: doc.text.length, preview: doc.text.slice(0, PREVIEW_CHARS), error: doc.error, createdAt: doc.createdAt});
const safeId = (value: unknown) => {if (typeof value !== 'string' || !ID.test(value)) throw new ApiError(400, '첨부 파일을 확인해 주세요.'); return value;};
const remove = (path: string) => bucket().file(path).delete().catch(() => {});

async function openAi(path: string, init: RequestInit, timeout: number, failure: string) {
  const signal = AbortSignal.timeout(timeout);
  let response: Response;
  try {response = await fetch(`https://api.openai.com/v1/${path}`, {...init, headers: {Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, ...init.headers}, signal, cache: 'no-store'});}
  catch {throw new AiError(signal.aborted ? 504 : 503, failure, signal.aborted ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE');}
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 400 || response.status === 413) throw new ApiError(422, '이 파일은 읽을 수 없었어요. 더 작게 나누거나 다른 형식으로 올려 주세요.', 'ATTACH_UNREADABLE');
    throw providerFailure(response.status);
  }
  return response;
}
const responses = (body: object, failure: string) => openAi('responses', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({model: model(), service_tier: 'default', store: false, reasoning: {effort: 'none'}, ...body})}, 100_000, failure);

/** Photo or PDF → text, by the model. */
async function seeText(uid: string, doc: Doc, bytes: Uint8Array) {
  const base64 = Buffer.from(bytes).toString('base64'), mime = bytes[0] === 0x89 ? 'image/png' : bytes[0] === 0x52 ? 'image/webp' : 'image/jpeg';
  const content = doc.kind === 'pdf' ? {type: 'input_file', filename: 'document.pdf', file_data: `data:application/pdf;base64,${base64}`} : {type: 'input_image', image_url: `data:${mime};base64,${base64}`, detail: 'high'};
  return runMeteredAi(uid, 'attachment-read', model(), hash(bytes), async observe => {
    const response = await responses({max_output_tokens: 8000, instructions: READ_INSTRUCTIONS, input: [{role: 'user', content: [content]}]}, '파일을 읽지 못했어요. 잠시 후 다시 시도해 주세요.');
    const payload = await readBoundedJson(response, 512 * 1024);
    observe(payload, {serviceTier: 'default'});
    return completedAiText(payload);
  });
}
const AUDIO_TYPES: Record<string, string> = {m4a: 'audio/mp4', mp4: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg'};
/** Recording → text. The original is never kept after this. */
async function hearText(uid: string, doc: Doc, bytes: Uint8Array) {
  const extension = extensionOf(doc.name), name = transcribeModel();
  return runMeteredAi(uid, 'attachment-audio', name, hash(bytes), async observe => {
    const form = new FormData();
    form.set('file', new Blob([Uint8Array.from(bytes)], {type: AUDIO_TYPES[extension] ?? 'application/octet-stream'}), `recording.${extension || 'm4a'}`);
    form.set('model', name); form.set('language', 'ko'); form.set('response_format', 'json');
    const response = await openAi('audio/transcriptions', {method: 'POST', body: form}, 100_000, '녹음을 글로 옮기지 못했어요. 잠시 후 다시 시도해 주세요.');
    const payload = await readBoundedJson(response, 1024 * 1024) as {text?: unknown};
    observe(payload);
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    if (!text) throw new ApiError(422, '녹음에서 말소리를 알아듣지 못했어요.', 'ATTACH_EMPTY');
    return text;
  });
}

/** Keeps the newest files and drops originals that were never read (a closed tab, a failed upload). */
async function prune(uid: string) {
  const snap = await files(uid).orderBy('createdAt', 'desc').limit(KEEP_FILES + 20).get(), cutoff = new Date(Date.now() - STALE_MS).toISOString();
  await Promise.all(snap.docs.map(async (doc, index) => {
    const data = doc.data() as Doc;
    if (index >= KEEP_FILES - 1) {if (data.stored) await remove(data.path); await doc.ref.delete();}
    else if (data.stored && data.createdAt < cutoff) {await remove(data.path); await doc.ref.update({stored: false, ...(data.status === 'uploading' ? {status: 'failed', error: '올리기가 끝나지 않았어요. 다시 올려 주세요.'} : {})});}
  }));
}
async function create(uid: string, input: Record<string, unknown>) {
  let file: ReturnType<typeof attachmentInput>;
  try {file = attachmentInput(input);} catch (error) {throw new ApiError(400, (error as Error).message);}
  await prune(uid);
  const ref = files(uid).doc(), path = pathOf(uid, ref.id);
  await ref.set({...file, path, status: 'uploading', stored: true, text: '', error: null, createdAt: new Date().toISOString()} satisfies Doc);
  const [uploadUrl] = await bucket().file(path).getSignedUrl({version: 'v4', action: 'write', expires: Date.now() + UPLOAD_WINDOW, contentType: 'application/octet-stream', extensionHeaders: {'content-length': String(file.size)}});
  return {id: ref.id, uploadUrl, headers: {'Content-Type': 'application/octet-stream'}};
}
async function owned(uid: string, id: string) {
  const ref = files(uid).doc(safeId(id)), snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, '첨부 파일을 찾을 수 없어요. 다시 올려 주세요.', 'NOT_FOUND');
  return {ref, doc: snap.data() as Doc};
}
async function read(uid: string, id: string) {
  const {ref, doc} = await owned(uid, id);
  if (doc.status === 'read') return view(ref.id, doc);
  if (!doc.stored) throw new ApiError(409, '파일을 다시 올려 주세요.', 'ATTACH_GONE');
  let bytes: Uint8Array;
  try {const [data] = await bucket().file(doc.path).download(); bytes = new Uint8Array(data);}
  catch {throw new ApiError(409, '파일이 아직 다 올라가지 않았어요. 잠시 뒤 다시 눌러 주세요.', 'ATTACH_NOT_UPLOADED');}
  const done = async (patch: Partial<Doc>) => {const next = {...doc, ...patch, stored: false, readAt: new Date().toISOString()}; await remove(doc.path); await ref.set(next); return view(ref.id, next);};
  try {
    if (bytes.length > sizeLimit(doc.kind)) throw new AttachError('파일이 너무 커요.');
    assertContent(doc.kind, bytes);
    const text = documentText(doc.kind, bytes) ?? tidy(doc.kind === 'audio' ? await hearText(uid, doc, bytes) : await seeText(uid, doc, bytes));
    if (!text) throw new AttachError('파일에서 읽을 글이 없었어요.');
    return done({status: 'read', text: clip(text), error: null});
  } catch (error) {
    // A busy or unreachable model keeps the original so the same file can be read again without a new upload.
    if (error instanceof AiError && error.status >= 500) throw error;
    return done({status: 'failed', text: '', error: error instanceof AttachError || error instanceof ApiError ? error.message : '파일을 읽지 못했어요. 다른 형식으로 저장해 다시 올려 주세요.'});
  }
}
async function destroy(uid: string, id: string) {
  const ref = files(uid).doc(safeId(id)), snap = await ref.get();
  if (snap.exists) {if ((snap.data() as Doc).stored) await remove((snap.data() as Doc).path); await ref.delete();}
  return {deleted: snap.exists};
}

/** Read attachments by id, for Berry and for drafts. Unknown, unread or foreign ids are refused. */
export async function attachmentTexts(uid: string, ids: unknown, max = MAX_PER_MESSAGE) {
  if (!Array.isArray(ids) || ids.length > max) throw new ApiError(400, `파일은 한 번에 ${max}개까지 붙일 수 있어요.`);
  const unique = [...new Set(ids.map(safeId))], snaps = unique.length ? await db().getAll(...unique.map(id => files(uid).doc(id))) : [];
  return snaps.map(snap => {
    const doc = snap.data() as Doc | undefined;
    if (!doc || doc.status !== 'read') throw new ApiError(400, '아직 읽지 못한 파일이 있어요. 파일을 다시 붙여 주세요.', 'ATTACH_NOT_READY');
    return {id: snap.id, name: doc.name, kind: doc.kind, text: doc.text};
  });
}
export async function attachmentPage(uid: string, id: unknown, offset: number, size: number) {
  const {ref, doc} = await owned(uid, typeof id === 'string' ? id : '');
  if (doc.status !== 'read') throw new ApiError(400, doc.error ?? '아직 읽지 못한 파일이에요.', 'ATTACH_NOT_READY');
  const start = Math.min(Math.max(0, offset), doc.text.length), text = doc.text.slice(start, start + size);
  return {attachment_id: ref.id, name: doc.name, total_chars: doc.text.length, offset: start, text, next_offset: start + text.length < doc.text.length ? start + text.length : null};
}
export async function recentAttachments(uid: string, limit = 10) {
  const snap = await files(uid).orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map(doc => view(doc.id, doc.data() as Doc)).filter(file => file.status === 'read').map(file => ({attachment_id: file.id, name: file.name, kind: file.kind, chars: file.chars, uploaded_at: file.createdAt}));
}

/** Timetable cells or lesson log lines from attachments and/or typed text. Nothing is saved here. */
async function draft(uid: string, input: Record<string, unknown>) {
  const purpose = input.purpose === 'timetable' || input.purpose === 'lesson' ? input.purpose : null;
  if (!purpose) throw new ApiError(400, '무엇을 만들지 확인해 주세요.');
  const typed = typeof input.text === 'string' ? input.text.trim().slice(0, MATERIAL_MAX) : '';
  const attached = await attachmentTexts(uid, input.attachment_ids ?? []);
  const material = [...attached.map(file => `[${file.name}]\n${file.text}`), typed].filter(Boolean).join('\n\n').slice(0, MATERIAL_MAX);
  if (!material) throw new ApiError(400, '파일을 붙이거나 내용을 적어 주세요.');
  const timetable = purpose === 'timetable';
  const result = await runMeteredAi(uid, 'attachment-draft', model(), hash(JSON.stringify(['attachment-draft-v1', purpose, material])), async observe => {
    const response = await responses({
      max_output_tokens: 4000, instructions: timetable ? TIMETABLE_INSTRUCTIONS : LESSON_INSTRUCTIONS,
      text: {format: {type: 'json_schema', name: timetable ? 'timetable' : 'lesson_log', strict: true, schema: timetable ? TIMETABLE_SCHEMA : LESSON_SCHEMA}},
      input: [{role: 'user', content: [{type: 'input_text', text: material}]}],
    }, '정리하지 못했어요. 잠시 후 다시 시도해 주세요.');
    const payload = await readBoundedJson(response, 512 * 1024);
    observe(payload, {serviceTier: 'default'});
    try {return JSON.parse(completedAiText(payload)) as unknown;} catch {throw new AiError(502, '정리한 결과를 읽지 못했어요. 다시 시도해 주세요.', 'AI_INVALID_RESPONSE');}
  });
  return timetable ? {purpose, ...timetableDraft(result)} : {purpose, ...lessonDraft(result)};
}

async function body(request: Request) {
  const raw = await request.text();
  if (raw.length > TEXT_MAX) throw new ApiError(413, '내용이 너무 커요.');
  try {const data = JSON.parse(raw || '{}'); if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;} catch {}
  throw new ApiError(400, '입력 내용을 확인해 주세요.');
}
export async function handleAttachments(request: Request, segments: string[]) {
  try {
    const method = request.method, [head, action] = segments;
    if (method !== 'GET') assertOrigin(request);
    const ctx = await requireTeacher(request), available = attachmentsAvailable();
    if (head === 'status' && method === 'GET') return json({available});
    if (!available) throw new ApiError(503, '파일 읽기를 지금은 쓸 수 없어요.', 'ATTACH_UNAVAILABLE');
    if (method === 'POST' && !head) return json(await create(ctx.uid, await body(request)), 201);
    if (method === 'POST' && head === 'draft' && !action) return json(await draft(ctx.uid, await body(request)));
    if (method === 'POST' && head && action === 'read') return json(await read(ctx.uid, head));
    if (method === 'POST' && head && action === 'delete') return json(await destroy(ctx.uid, head));
    throw new ApiError(404, '찾을 수 없어요.');
  } catch (error) {
    if (error instanceof ApiError) return json({error: error.message, code: error.code}, error.status);
    console.error('Attachments failed', (error as {code?: string}).code || 'INTERNAL');
    return json({error: '처리하지 못했어요. 잠시 후 다시 시도해 주세요.', code: 'INTERNAL_ERROR'}, 500);
  }
}
