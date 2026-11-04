import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import {BERRY_SCOPES, DEFAULT_SCOPES, WRITE_SCOPES, type AuthorizeRequest, type BerryAccessConfig, type BerryDerivedEvent, type BerryEvent, type BerryScope, type McpTool} from './types';

export class BerryError extends Error {constructor(message: string, public status = 400, public code = 'invalid_request') {super(message);}}
export const ACCESS_TOKEN_SECONDS = 60 * 60, AUTH_CODE_SECONDS = 10 * 60, MIN_ACCESS_DAYS = 1, MAX_ACCESS_DAYS = 365, DEFAULT_ACCESS_DAYS = 30;
export const MAX_REDIRECT_URIS = 10, MAX_CLIENT_NAME = 80;
export const CALLS_PER_MINUTE = 60, CALLS_PER_DAY = 2000, MAX_TOOL_RESULT_ITEMS = 300;
export const REGISTRATIONS_PER_HOUR = 20;
/** Redirect hosts of clients we recognise. Anything else is shown to the teacher with an "unverified app" warning. */
export const TRUSTED_REDIRECT_SUFFIXES = ['claude.ai', 'claude.com', 'anthropic.com', 'chatgpt.com', 'openai.com'] as const;
/** `extraHosts` (env BERRY_TRUSTED_REDIRECT_HOSTS) adds exact hosts we run ourselves, such as the Berry brain on Cloud Run. */
export function trustedRedirectHost(redirectUri: string, extraHosts: readonly string[] = []): boolean {
  try {
    const url = new URL(redirectUri), host = url.hostname;
    if (url.protocol === 'http:') return false;
    return extraHosts.includes(host) || TRUSTED_REDIRECT_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`));
  } catch {return false;}
}

const ID = /^[A-Za-z0-9_-]{1,200}$/, DATE = /^\d{4}-\d{2}-\d{2}$/;
export const sha256 = (value: string) => createHash('sha256').update(value).digest();
export const hashToken = (value: string) => sha256(value).toString('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const safeId = (value: unknown, label = '항목') => {
  if (typeof value !== 'string' || !ID.test(value)) throw new BerryError(`${label}을(를) 확인해 주세요.`);
  return value;
};

/** Feature switch document: off | allowlist | all, mirroring the teacher notebook pilot gate. */
export function accessConfig(value: unknown): BerryAccessConfig {
  const data = (value ?? {}) as Partial<BerryAccessConfig>;
  const mode = data.mode === 'all' || data.mode === 'allowlist' ? data.mode : 'off';
  const teacherUids = Array.isArray(data.teacherUids) ? data.teacherUids.filter((uid): uid is string => typeof uid === 'string' && ID.test(uid)).slice(0, 500) : [];
  return {mode, teacherUids};
}
/** `modeOverride` (env BERRY_CONNECTOR_MODE) replaces the stored mode; the allowlist itself still comes from Firestore. */
export function connectorAllowed(config: BerryAccessConfig, uid: string, role: string, killSwitch?: string, modeOverride?: string) {
  if (killSwitch === 'true' || role === 'student') return false;
  const mode = modeOverride === 'all' || modeOverride === 'allowlist' || modeOverride === 'off' ? modeOverride : config.mode;
  return mode === 'all' || (mode === 'allowlist' && config.teacherUids.includes(uid));
}

/** Space-separated scope string → validated, de-duplicated, catalog-ordered list. Empty → defaults. */
export function parseScopes(value: unknown): BerryScope[] {
  if (value === undefined || value === null || value === '') return [...DEFAULT_SCOPES];
  if (typeof value !== 'string' || value.length > 500) throw new BerryError('권한 범위를 확인해 주세요.', 400, 'invalid_scope');
  const wanted = new Set(value.split(/[\s,]+/).filter(Boolean));
  const unknown = [...wanted].filter(scope => !BERRY_SCOPES.includes(scope as BerryScope));
  if (unknown.length) throw new BerryError(`지원하지 않는 권한이에요: ${unknown.slice(0, 3).join(', ')}`, 400, 'invalid_scope');
  const scopes = BERRY_SCOPES.filter(scope => wanted.has(scope));
  return scopes.length ? [...scopes] : [...DEFAULT_SCOPES];
}
export const hasScope = (granted: readonly BerryScope[], needed: BerryScope) => granted.includes(needed);
export const toolAllowed = (tool: Pick<McpTool, 'scope'>, granted: readonly BerryScope[]) => (typeof tool.scope === 'string' ? [tool.scope] : tool.scope).some(scope => granted.includes(scope));
/** The consent screen starts with these unchecked: the teacher opts in to real names and to every write. */
export const checkedByDefault = (scope: BerryScope) => scope !== 'names' && !WRITE_SCOPES.includes(scope);
/** The second list must not exceed the first (refresh may narrow a grant, never widen it). */
export const scopesWithin = (granted: readonly BerryScope[], requested: readonly BerryScope[]) => requested.every(scope => granted.includes(scope));

export function accessDays(value: unknown): number {
  if (value === undefined || value === null || value === '') return DEFAULT_ACCESS_DAYS;
  const days = Number(value);
  if (!Number.isInteger(days) || days < MIN_ACCESS_DAYS || days > MAX_ACCESS_DAYS) throw new BerryError(`접근 기간은 ${MIN_ACCESS_DAYS}~${MAX_ACCESS_DAYS}일 사이로 골라 주세요.`);
  return days;
}

/** RFC 7591 dynamic registration input. Only public clients with PKCE; redirect URIs must be https or a loopback/custom app scheme. */
export function clientRegistration(value: Record<string, unknown>): {name: string; redirectUris: string[]} {
  const raw = value.redirect_uris;
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_REDIRECT_URIS) throw new BerryError('redirect_uris를 1~10개 보내 주세요.', 400, 'invalid_redirect_uri');
  const redirectUris = raw.map(uri => {
    if (typeof uri !== 'string' || uri.length > 500 || !validRedirectUri(uri)) throw new BerryError('redirect_uris 형식을 확인해 주세요.', 400, 'invalid_redirect_uri');
    return uri;
  });
  const method = value.token_endpoint_auth_method;
  if (method !== undefined && method !== 'none') throw new BerryError('공개 클라이언트(PKCE)만 등록할 수 있어요.', 400, 'invalid_client_metadata');
  const grants = value.grant_types;
  if (grants !== undefined && (!Array.isArray(grants) || grants.some(type => type !== 'authorization_code' && type !== 'refresh_token'))) throw new BerryError('authorization_code·refresh_token만 지원해요.', 400, 'invalid_client_metadata');
  const name = typeof value.client_name === 'string' && value.client_name.trim() ? value.client_name.trim().slice(0, MAX_CLIENT_NAME) : '이름 없는 앱';
  return {name, redirectUris: [...new Set(redirectUris)]};
}
export function validRedirectUri(uri: string): boolean {
  let url: URL;
  try {url = new URL(uri);} catch {return false;}
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:') return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  // Native apps register a private-use scheme such as berry://callback.
  return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol) && url.protocol !== 'javascript:' && url.protocol !== 'data:';
}

/** Authorization request query → validated request bound to a registered client. Exact redirect match only. */
export function authorizeRequest(params: URLSearchParams, client: {id: string; redirectUris: string[]} | null): AuthorizeRequest {
  const clientId = params.get('client_id') ?? '';
  if (!client || client.id !== clientId) throw new BerryError('등록되지 않은 앱이에요.', 400, 'invalid_client');
  const redirectUri = params.get('redirect_uri') ?? '';
  if (!client.redirectUris.includes(redirectUri)) throw new BerryError('앱의 돌아갈 주소가 등록된 값과 달라요.', 400, 'invalid_redirect_uri');
  if (params.get('response_type') !== 'code') throw new BerryError('response_type=code만 지원해요.', 400, 'unsupported_response_type');
  if (params.get('code_challenge_method') !== 'S256') throw new BerryError('PKCE S256이 필요해요.', 400, 'invalid_request');
  const codeChallenge = params.get('code_challenge') ?? '';
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) throw new BerryError('code_challenge를 확인해 주세요.', 400, 'invalid_request');
  const state = params.get('state') ?? '';
  if (state.length > 1000) throw new BerryError('state가 너무 길어요.', 400, 'invalid_request');
  const resource = params.get('resource');
  return {clientId, redirectUri, scopes: parseScopes(params.get('scope')), state, codeChallenge, resource: resource && resource.length <= 500 ? resource : null};
}
export function verifyPkce(codeVerifier: unknown, codeChallenge: string): boolean {
  if (typeof codeVerifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) return false;
  const expected = Buffer.from(sha256(codeVerifier).toString('base64url')), actual = Buffer.from(codeChallenge);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function redirectWith(redirectUri: string, params: Record<string, string>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  return url.toString();
}

/** Students leave the server as "학생 07" unless the grant carries the names scope and the caller asks. */
export const alias = (number: number) => `학생 ${String(number).padStart(2, '0')}`;
export function studentLabel(student: {number: number; name: string}, scopes: readonly BerryScope[], reveal: unknown): string {
  return reveal === true && hasScope(scopes, 'names') ? student.name : alias(student.number);
}

export function isoDate(value: unknown, label = '날짜'): string {
  if (typeof value !== 'string' || !DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new BerryError(`${label}를 YYYY-MM-DD로 적어 주세요.`);
  return value;
}
export function boundedInt(value: unknown, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new BerryError(`${label}은(는) ${min}~${max} 사이여야 해요.`);
  return n;
}

export type AssignmentSummary = {id: string; classId: string; title: string; dueAt: string | null; createdAt: string; targetCount: number; submittedCount: number; reviewedCount: number; visibility?: string};
/** Derive a teacher's event feed from assignment summaries. Deterministic ids let a consumer de-duplicate across polls. */
export function deriveEvents(assignments: AssignmentSummary[], since: string | null, now: string, soonHours = 48): BerryDerivedEvent[] {
  const events: BerryDerivedEvent[] = [], nowMs = Date.parse(now), sinceMs = since ? Date.parse(since) : Number.NEGATIVE_INFINITY;
  for (const task of assignments) {
    if (task.visibility === 'hidden') continue;
    const base = {source: 'derived' as const, classId: task.classId, assignmentId: task.id, title: task.title};
    events.push({id: `created:${task.id}`, type: 'assignment.created', at: task.createdAt, ...base, data: {targetCount: task.targetCount, dueAt: task.dueAt}});
    if (task.dueAt) {
      const dueMs = Date.parse(task.dueAt), soonAt = new Date(Math.max(dueMs - soonHours * 3_600_000, Date.parse(task.createdAt))).toISOString();
      const missing = Math.max(task.targetCount - task.submittedCount, 0);
      if (Date.parse(soonAt) <= nowMs && dueMs > nowMs) events.push({id: `soon:${task.id}`, type: 'deadline.soon', at: soonAt, ...base, data: {dueAt: task.dueAt, missing}});
      if (dueMs <= nowMs) events.push({id: `passed:${task.id}`, type: 'deadline.passed', at: task.dueAt, ...base, data: {dueAt: task.dueAt, missing}});
    }
    const pending = task.submittedCount - task.reviewedCount;
    if (pending > 0) events.push({id: `review:${task.id}:${task.submittedCount}`, type: 'review.pending', at: now, ...base, data: {pending}});
  }
  return events.filter(event => Date.parse(event.at) > sinceMs && Date.parse(event.at) <= nowMs).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
/** One feed from the write-side log and the derived assignment facts, ordered by time; ids never collide (log ids start with "log:"). */
export const mergeEvents = (log: BerryEvent[], derived: BerryEvent[]) => [...log, ...derived].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

/** RFC 8414 / RFC 9728 discovery documents. The issuer is the site origin; the resource is the MCP endpoint. */
export function authorizationServerMetadata(issuer: string) {
  return {
    issuer, authorization_endpoint: `${issuer}/oauth/authorize`, token_endpoint: `${issuer}/api/oauth/token`, registration_endpoint: `${issuer}/api/oauth/register`, revocation_endpoint: `${issuer}/api/oauth/revoke`,
    scopes_supported: [...BERRY_SCOPES], response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'], revocation_endpoint_auth_methods_supported: ['none'],
    service_documentation: `${issuer}/teacher/me/connections`,
  };
}
export function protectedResourceMetadata(issuer: string) {
  return {resource: `${issuer}/api/mcp`, authorization_servers: [issuer], scopes_supported: [...BERRY_SCOPES], bearer_methods_supported: ['header'], resource_name: '모두의 교실 · 베리 연결'};
}
export const resourceMetadataChallenge = (issuer: string, error?: string) => `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource"${error ? `, error="${error}"` : ''}`;

// ---- Two-step writes: preview returns a confirm token; confirm_write saves exactly the previewed payload ----
export const CONFIRM_SECONDS = 600;
export const WRITE_TOOL_SCOPES: Record<string, BerryScope> = {add_calendar_event: 'calendar:write', add_lesson_log: 'workspace:write', add_work_item: 'workspace:write', add_notebook_entry: 'notebook:write', create_assignment: 'classroom:write', create_exhibition: 'classroom:write', create_board: 'classroom:write', approve_artworks: 'classroom:write', approve_posts: 'classroom:write', publish_review: 'classroom:write', manage_homework: 'classroom:write', manage_exhibition: 'classroom:write', manage_board: 'classroom:write', manage_quiz: 'classroom:write', manage_review: 'classroom:write', manage_playground: 'classroom:write', manage_points: 'classroom:write', manage_cards: 'classroom:write', manage_class_tools: 'classroom:write', manage_class: 'classroom:write', manage_workspace: 'workspace:write'};
/** JSON with sorted keys, so the same content always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(key => (value as Record<string, unknown>)[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}
export const payloadHash = (tool: string, payload: unknown) => sha256(`${tool}\0${canonicalJson(payload)}`).toString('hex');
export type ConfirmationRecord = {uid: string; grantId: string; clientId: string; tool: string; payloadHash: string; expiresAtMs: number; usedAt: string | null};
/**
 * Null when the token may be spent now; otherwise the reason it is refused. A token belongs to one teacher, one
 * connection and one exact payload, lives ten minutes and works once.
 */
export function confirmationProblem(record: ConfirmationRecord | null, ctx: {uid: string; grantId: string; clientId: string; scopes: readonly BerryScope[]}, nowMs: number, openedHash: string | null, presentedHash?: unknown): string | null {
  if (!record) return '확인 토큰을 찾을 수 없어요. 미리보기부터 다시 해 주세요.';
  if (record.uid !== ctx.uid || record.grantId !== ctx.grantId || record.clientId !== ctx.clientId) return '이 연결에서 만든 미리보기가 아니에요.';
  if (record.usedAt) return '이미 저장에 쓴 확인 토큰이에요.';
  if (record.expiresAtMs <= nowMs) return '확인 시간이 지났어요. 미리보기부터 다시 해 주세요.';
  const scope = WRITE_TOOL_SCOPES[record.tool];
  if (!scope || !ctx.scopes.includes(scope)) return '이 저장에 필요한 쓰기 권한이 없어요.';
  if (!openedHash || openedHash !== record.payloadHash) return '미리보기 내용이 바뀌었어요. 다시 미리보기 해 주세요.';
  if (presentedHash !== undefined && presentedHash !== record.payloadHash) return '미리보기한 내용과 달라요.';
  return null;
}

/** Real names typed into free text (titles, notes, bodies) are swapped for aliases before they leave, longest name first. */
export function maskNames(text: string, students: readonly {name: string; number: number}[]): string {
  const byName = new Map<string, Set<number>>();
  for (const student of students) {const name = student.name.trim(); if (name.length >= 2) byName.set(name, (byName.get(name) ?? new Set()).add(student.number));}
  let result = text;
  for (const name of [...byName.keys()].sort((a, b) => b.length - a.length)) {
    const numbers = [...byName.get(name)!];
    result = result.split(name).join(numbers.length === 1 ? alias(numbers[0]) : '학생');
  }
  return result;
}
