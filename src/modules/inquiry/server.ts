import 'server-only';
import {FieldPath, FieldValue, Timestamp} from 'firebase-admin/firestore';
import {db} from '@/lib/server/admin';
import {assertOrigin, getContext} from '@/lib/server/auth';
import {ApiError, isAdmin} from '@/lib/server/policy';
import {consumeModuleRate, digest, moduleJson, moduleOrigin} from '@/modules/artwork-extensions/server-utils';
import {dayKey, inquiryMail, inquiryRetentionDays, inquiryConsentText, inquirySources, inquiryStatuses, isBot, sourceOf, validateInquiry, type InquiryInput, type InquirySummary} from './policy';

// Own collections only: inquiries (the letters) and inquiryStats (one counter document per Korea-time day).
const inquiries = () => db().collection('inquiries');
const stats = (day: string) => db().doc(`inquiryStats/${day}`);
const headers = {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'};
const json = (value: unknown, status = 200) => Response.json(value, {status, headers});
const address = (request: Request) => (request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();

/** Sends through Resend when RESEND_API_KEY and INQUIRY_MAIL_TO are set. A mail failure never loses the inquiry: it is already saved. */
async function mail(value: InquiryInput, createdAt: string): Promise<'sent' | 'failed' | 'off'> {
  const key = process.env.RESEND_API_KEY, to = process.env.INQUIRY_MAIL_TO;
  if (!key || !to) return 'off';
  const {subject, text, html} = inquiryMail(value, createdAt);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({from: process.env.INQUIRY_MAIL_FROM || '모두의 교실 문의 <onboarding@resend.dev>', to: to.split(',').map(s => s.trim()).filter(Boolean), reply_to: value.email, subject, text, html}),
    });
    if (!response.ok) console.error('inquiry mail failed', response.status, (await response.text()).slice(0, 300));
    return response.ok ? 'sent' : 'failed';
  } catch (error) {
    console.error('inquiry mail failed', error instanceof Error ? error.message : error);
    return 'failed';
  }
}

async function submit(request: Request) {
  moduleOrigin(request);
  const input = await moduleJson(request);
  if (isBot(input)) return {ok: true};
  const checked = validateInquiry(input);
  if (!checked.ok) throw new ApiError(400, checked.error);
  const ip = digest(address(request));
  await consumeModuleRate([
    {key: `inquiry:ip:${ip}`, limit: 5, windowMs: 3600_000},
    {key: `inquiry:ip-day:${ip}`, limit: 15, windowMs: 86_400_000},
    {key: 'inquiry:all', limit: 300, windowMs: 86_400_000},
  ]);
  const now = Date.now(), createdAt = new Date(now).toISOString(), ref = inquiries().doc();
  await ref.create({...checked.value, status: 'new', adminNote: '', mail: 'pending', consent: {agreed: true, text: inquiryConsentText, at: createdAt}, ipHash: ip, createdAt, updatedAt: createdAt, expiresAt: Timestamp.fromMillis(now + inquiryRetentionDays * 86_400_000)});
  await stats(dayKey(now)).set({day: dayKey(now), submitted: {[checked.value.source]: FieldValue.increment(1)}}, {merge: true});
  const sent = await mail(checked.value, createdAt);
  await ref.update({mail: sent});
  return {ok: true};
}

/** One arrival on the inquiry page = one press of a button. The page sends it once per browser tab. */
async function view(request: Request) {
  moduleOrigin(request);
  const input = await moduleJson(request), source = sourceOf(input.source), now = Date.now();
  try {await consumeModuleRate([{key: `inquiry:view:${digest(address(request))}`, limit: 30, windowMs: 3600_000}]);}
  catch (error) {if (error instanceof ApiError && error.status === 429) return {ok: true}; throw error;} // A flood is simply not counted.
  await stats(dayKey(now)).set({day: dayKey(now), views: {[source]: FieldValue.increment(1)}}, {merge: true});
  return {ok: true};
}

function summary(doc: FirebaseFirestore.DocumentSnapshot): InquirySummary {
  const v = doc.data()!;
  return {id: doc.id, name: v.name, email: v.email, phone: v.phone, school: v.school, topic: v.topic, message: v.message, source: v.source, status: v.status, createdAt: v.createdAt, mail: v.mail === 'pending' ? 'failed' : v.mail};
}

async function adminList() {
  const now = Date.now();
  // Retention promise in the consent text: drop anything past its time whenever an operator opens the list.
  const expired = await inquiries().where('expiresAt', '<', Timestamp.fromMillis(now)).limit(100).get();
  if (!expired.empty) {const batch = db().batch(); expired.docs.forEach(d => batch.delete(d.ref)); await batch.commit();}
  const days = Array.from({length: 30}, (_, i) => dayKey(now - i * 86_400_000));
  const [list, newCount, statDocs] = await Promise.all([
    inquiries().orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(100).get(),
    inquiries().where('status', '==', 'new').count().get(),
    db().getAll(...days.map(stats)),
  ]);
  const empty = () => Object.fromEntries(inquirySources.map(s => [s, 0])) as Record<string, number>;
  const daily = statDocs.map((doc, i) => {
    const v = doc.data() || {}, views = {...empty(), ...(v.views || {})}, submitted = {...empty(), ...(v.submitted || {})};
    return {day: days[i], views, submitted};
  });
  return {items: list.docs.map(summary), newCount: newCount.data().count, daily, mailReady: Boolean(process.env.RESEND_API_KEY && process.env.INQUIRY_MAIL_TO)};
}

async function adminUpdate(request: Request, id: string, uid: string) {
  if (!/^[A-Za-z0-9]{20}$/.test(id)) throw new ApiError(400, '문의 번호를 확인해 주세요.');
  const input = await moduleJson(request);
  if (!(inquiryStatuses as readonly unknown[]).includes(input.status)) throw new ApiError(400, '처리 상태를 확인해 주세요.');
  const ref = inquiries().doc(id);
  if (!(await ref.get()).exists) throw new ApiError(404, '문의를 찾을 수 없어요.');
  const updatedAt = new Date().toISOString();
  await ref.update({status: input.status, updatedAt, updatedBy: uid});
  await db().collection('adminAudit').doc().create({actorUid: uid, action: 'inquiry.update', target: id, kind: 'change', outcome: 'success', createdAt: updatedAt, details: {after: {status: input.status}}});
  return {ok: true};
}

export async function handleInquiry(request: Request, segments: string[]) {
  try {
    const [first, second, ...rest] = segments;
    if (rest.length) throw new ApiError(404, '찾을 수 없어요.');
    if (first === 'admin') {
      if (request.method !== 'GET') assertOrigin(request);
      const ctx = await getContext(request);
      if (!isAdmin(ctx.role)) throw new ApiError(403, '운영자만 문의를 볼 수 있어요.');
      if (request.method === 'GET' && !second) return json(await adminList());
      if (request.method === 'PATCH' && second) return json(await adminUpdate(request, second, ctx.uid));
      throw new ApiError(405, '요청 방식을 확인해 주세요.');
    }
    if (request.method !== 'POST' || second) throw new ApiError(405, '요청 방식을 확인해 주세요.');
    if (!first) return json(await submit(request));
    if (first === 'view') return json(await view(request));
    throw new ApiError(404, '찾을 수 없어요.');
  } catch (error) {
    if (!(error instanceof ApiError)) console.error('inquiry failed', error);
    return json({error: error instanceof ApiError ? error.message : '문의를 보내지 못했어요. 잠시 후 다시 시도해 주세요.'}, error instanceof ApiError ? error.status : 500);
  }
}
