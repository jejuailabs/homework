// Rules for the public "how do I start for real?" inquiry. Pure functions so the runner can test them without a server.

/** Where the visitor pressed the button. Anything else is counted as 'other' so the tally cannot be flooded with new keys. */
export const inquirySources = ['try-header', 'try-start', 'try-end', 'landing', 'other'] as const;
export type InquirySource = typeof inquirySources[number];
export const inquirySourceLabels: Record<InquirySource, string> = {
  'try-header': '체험 화면 위 버튼',
  'try-start': '체험 마지막 코너',
  'try-end': '체험 마지막 다음 버튼',
  landing: '첫 화면',
  other: '직접 방문·기타',
};

export const inquiryTopics = ['start', 'school', 'other'] as const;
export type InquiryTopic = typeof inquiryTopics[number];
export const inquiryTopicLabels: Record<InquiryTopic, string> = {
  start: '우리 반에서 정식으로 쓰고 싶어요',
  school: '학년·학교 단위로 쓰고 싶어요',
  other: '기타 문의',
};

export const inquiryStatuses = ['new', 'contacted', 'done'] as const;
export type InquiryStatus = typeof inquiryStatuses[number];
export const inquiryStatusLabels: Record<InquiryStatus, string> = {new: '새 문의', contacted: '연락함', done: '처리 끝'};

export const inquiryLimits = {name: 40, email: 120, phone: 20, school: 60, message: 2000};
/** Shown next to the consent box and stored with every inquiry, so what the visitor agreed to is on record. */
export const inquiryConsentText = '문의 답변을 위해 이름·이메일·(적은 경우) 전화번호와 학교, 문의 내용을 모으고, 답변을 마치고 1년 뒤 지웁니다. 동의하지 않으면 문의를 보낼 수 없어요.';
export const inquiryRetentionDays = 365;

export type InquiryInput = {name: string; email: string; phone: string; school: string; topic: InquiryTopic; message: string; source: InquirySource};
export type InquirySummary = InquiryInput & {id: string; status: InquiryStatus; createdAt: string; mail: 'sent' | 'failed' | 'off'};

export function sourceOf(value: unknown): InquirySource {
  return typeof value === 'string' && (inquirySources as readonly string[]).includes(value) ? value as InquirySource : 'other';
}

const clean = (value: unknown) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : '';
const oneLine = (value: unknown) => clean(value).replace(/\s+/g, ' ');

/** Returns the cleaned inquiry or a Korean message naming the field to fix. */
export function validateInquiry(input: Record<string, unknown>): {ok: true; value: InquiryInput} | {ok: false; error: string} {
  const name = oneLine(input.name), email = oneLine(input.email).toLowerCase(), phone = oneLine(input.phone), school = oneLine(input.school), message = clean(input.message);
  if (!name) return {ok: false, error: '이름을 적어 주세요.'};
  if (name.length > inquiryLimits.name) return {ok: false, error: `이름은 ${inquiryLimits.name}자까지 적을 수 있어요.`};
  if (!email || email.length > inquiryLimits.email || !/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(email)) return {ok: false, error: '답장받을 이메일 주소를 확인해 주세요.'};
  if (phone && (phone.length > inquiryLimits.phone || !/^\+?[0-9][0-9 -]{7,}$/.test(phone))) return {ok: false, error: '전화번호는 숫자와 - 만 적어 주세요. 비워 두어도 돼요.'};
  if (school.length > inquiryLimits.school) return {ok: false, error: `학교 이름은 ${inquiryLimits.school}자까지 적을 수 있어요.`};
  if (!(inquiryTopics as readonly unknown[]).includes(input.topic)) return {ok: false, error: '문의 종류를 골라 주세요.'};
  if (message.length > inquiryLimits.message) return {ok: false, error: `문의 내용은 ${inquiryLimits.message}자까지 적을 수 있어요.`};
  if (input.topic === 'other' && !message) return {ok: false, error: '기타 문의는 내용을 적어 주세요.'};
  if (input.consent !== true) return {ok: false, error: '개인정보 수집·이용에 동의해 주세요.'};
  return {ok: true, value: {name, email, phone, school, topic: input.topic as InquiryTopic, message, source: sourceOf(input.source)}};
}

/** A filled hidden field means a bot; it is answered as if accepted and then dropped. */
export const isBot = (input: Record<string, unknown>) => typeof input.website === 'string' && input.website.trim() !== '';

/** Korea-time day key, e.g. 2026-11-24. */
export const dayKey = (now: number) => new Date(now + 9 * 3600_000).toISOString().slice(0, 10);

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]!);

/** Email to the operator. Every visitor value is escaped; the subject is one line. */
export function inquiryMail(value: InquiryInput, createdAt: string) {
  const rows: [string, string][] = [
    ['문의 종류', inquiryTopicLabels[value.topic]], ['이름', value.name], ['이메일', value.email], ['전화번호', value.phone || '(적지 않음)'],
    ['학교', value.school || '(적지 않음)'], ['누른 곳', inquirySourceLabels[value.source]], ['받은 시각', new Date(createdAt).toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'})],
  ];
  const subject = `[모두의 교실 문의] ${inquiryTopicLabels[value.topic]} - ${value.name}`.slice(0, 150);
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\n${value.message || '(내용 없음)'}\n\n관리자 화면: /admin/inquiries`;
  const html = `<table style="border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><th style="text-align:left;padding:4px 12px 4px 0;color:#555">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}</table><p style="white-space:pre-wrap;font-size:14px">${escapeHtml(value.message || '(내용 없음)')}</p>`;
  return {subject, text, html};
}
