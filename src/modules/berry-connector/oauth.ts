import 'server-only';
import {NextResponse} from 'next/server';
import {Timestamp} from 'firebase-admin/firestore';
import {db} from '@/lib/server/admin';
import {assertOrigin, contextForUid, getContext, type Context} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {ACCESS_TOKEN_SECONDS, AUTH_CODE_SECONDS, BerryError, accessConfig, accessDays, authorizeRequest, clientRegistration, connectorAllowed, hashToken, parseScopes, randomToken, redirectWith, resourceMetadataChallenge, safeId, scopesWithin, verifyPkce} from './policy';
import {BERRY_SCOPE_LABELS, type AuthorizeRequest, type BearerContext, type BerryAccessConfig, type BerryGrant, type BerryScope} from './types';

type Input = Record<string, unknown>;
const now = () => new Date().toISOString();
const plus = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
const clients = () => db().collection('berryClients');
const codes = () => db().collection('berryAuthCodes');
const grants = () => db().collection('berryGrants');
const tokens = () => db().collection('berryTokens');
const accessRef = () => db().doc('featureAccess/berryConnector');
export const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => NextResponse.json(value, {status, headers: {'Cache-Control': 'no-store', Pragma: 'no-cache', ...headers}});
/** Registration, token and discovery endpoints are called by other servers and by browser-based MCP inspectors. */
export const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version', 'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id'};
export const disabled = () => process.env.BERRY_CONNECTOR_DISABLED === 'true';
/** Public origin used in discovery documents and redirect validation. Set BERRY_ISSUER in production. */
export function issuer(request: Request) {
  const configured = process.env.BERRY_ISSUER?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  const url = new URL(request.url), proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', ''), host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;
  return `${proto}://${host}`;
}

let cachedAccess: {at: number; value: BerryAccessConfig} | undefined;
export async function access(): Promise<BerryAccessConfig> {
  if (cachedAccess && Date.now() - cachedAccess.at < 60_000) return cachedAccess.value;
  const value = accessConfig((await accessRef().get()).data());
  cachedAccess = {at: Date.now(), value};
  return value;
}
export async function allowedTeacher(ctx: Context) {
  if (disabled() || !connectorAllowed(await access(), ctx.uid, ctx.role, process.env.BERRY_CONNECTOR_DISABLED, process.env.BERRY_CONNECTOR_MODE)) throw new BerryError('외부 연결을 아직 사용할 수 없어요.', 403, 'access_denied');
  return ctx;
}
async function input(request: Request): Promise<Input> {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 20_000) throw new BerryError('입력 내용이 너무 커요.');
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  try {const data = JSON.parse(raw); if (data && typeof data === 'object' && !Array.isArray(data)) return data;} catch {}
  throw new BerryError('입력 내용을 확인해 주세요.');
}
export function errorResponse(error: unknown, headers: Record<string, string> = {}) {
  if (error instanceof BerryError) return json({error: error.code, error_description: error.message}, error.status, headers);
  if (error instanceof ApiError) return json({error: error.code === 'UNAUTHENTICATED' ? 'login_required' : 'access_denied', error_description: error.message}, error.status, headers);
  console.error('Berry connector failed', (error as {code?: string}).code || 'INTERNAL');
  return json({error: 'server_error', error_description: '처리하지 못했어요. 잠시 후 다시 시도해 주세요.'}, 500, headers);
}

// ---- RFC 7591 dynamic client registration (public clients only) ----
async function register(request: Request) {
  const value = clientRegistration(await input(request));
  const ref = clients().doc(), at = now();
  await ref.create({name: value.name, redirectUris: value.redirectUris, createdAt: at});
  return json({client_id: ref.id, client_name: value.name, redirect_uris: value.redirectUris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], client_id_issued_at: Math.floor(Date.parse(at) / 1000)}, 201, cors);
}
async function client(clientId: string) {
  if (!/^[A-Za-z0-9]{1,40}$/.test(clientId)) return null;
  const doc = await clients().doc(clientId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {id: doc.id, name: String(data.name ?? ''), redirectUris: (data.redirectUris ?? []) as string[]};
}

// ---- Consent: the /oauth/authorize page asks the server to validate the request, then to approve or deny it ----
async function consentInfo(request: Request, ctx: Context) {
  const params = new URL(request.url).searchParams;
  const app = await client(params.get('client_id') ?? '');
  const value = authorizeRequest(params, app);
  const scopes = value.scopes.map(scope => ({scope, ...BERRY_SCOPE_LABELS[scope]}));
  return json({client: {id: app!.id, name: app!.name, redirectHost: new URL(value.redirectUri).host}, scopes, teacher: {email: ctx.email, displayName: ctx.displayName}});
}
async function approve(request: Request, ctx: Context) {
  const body = await input(request), params = new URLSearchParams();
  for (const key of ['response_type', 'client_id', 'redirect_uri', 'scope', 'state', 'code_challenge', 'code_challenge_method', 'resource']) if (typeof body[key] === 'string') params.set(key, body[key] as string);
  const app = await client(params.get('client_id') ?? '');
  const value = authorizeRequest(params, app);
  if (body.decision !== 'approve') return json({redirect: redirectWith(value.redirectUri, {error: 'access_denied', error_description: 'The teacher declined.', state: value.state})});
  // The teacher may narrow the requested scopes but never widen them.
  const chosen = Array.isArray(body.scopes) ? parseScopes((body.scopes as unknown[]).filter((s): s is string => typeof s === 'string').join(' ')) : value.scopes;
  if (!scopesWithin(value.scopes, chosen)) throw new BerryError('요청한 범위 안에서만 고를 수 있어요.', 400, 'invalid_scope');
  const days = accessDays(body.accessDays), code = randomToken(32);
  await codes().doc(hashToken(code)).create({clientId: value.clientId, uid: ctx.uid, redirectUri: value.redirectUri, codeChallenge: value.codeChallenge, scopes: chosen, accessDays: days, resource: value.resource, createdAt: now(), expiresAt: Timestamp.fromMillis(Date.now() + AUTH_CODE_SECONDS * 1000), usedAt: null});
  return json({redirect: redirectWith(value.redirectUri, {code, state: value.state, iss: issuer(request)})});
}

// ---- Token endpoint: authorization_code (PKCE) and rotating refresh tokens ----
async function issueTokens(grantId: string, uid: string, scopes: BerryScope[], grantExpiresAt: string) {
  const accessToken = randomToken(32), refreshToken = randomToken(32), accessExpires = plus(ACCESS_TOKEN_SECONDS);
  const batch = db().batch();
  batch.create(tokens().doc(hashToken(accessToken)), {kind: 'access', grantId, uid, scopes, expiresAt: Timestamp.fromDate(new Date(accessExpires)), createdAt: now()});
  batch.create(tokens().doc(hashToken(refreshToken)), {kind: 'refresh', grantId, uid, scopes, expiresAt: Timestamp.fromDate(new Date(grantExpiresAt)), createdAt: now(), revokedAt: null});
  await batch.commit();
  return {access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TOKEN_SECONDS, refresh_token: refreshToken, scope: scopes.join(' ')};
}
async function token(request: Request) {
  const body = await input(request), grantType = body.grant_type;
  if (grantType === 'authorization_code') {
    if (typeof body.code !== 'string' || body.code.length > 200) throw new BerryError('code를 확인해 주세요.', 400, 'invalid_grant');
    const ref = codes().doc(hashToken(body.code));
    const record = await db().runTransaction(async tx => {
      const doc = await tx.get(ref), data = doc.data();
      if (!data || data.usedAt || (data.expiresAt as Timestamp).toMillis() < Date.now()) throw new BerryError('코드가 만료됐거나 이미 사용됐어요.', 400, 'invalid_grant');
      if (data.clientId !== body.client_id || data.redirectUri !== body.redirect_uri) throw new BerryError('client_id 또는 redirect_uri가 달라요.', 400, 'invalid_grant');
      if (!verifyPkce(body.code_verifier, data.codeChallenge)) throw new BerryError('code_verifier를 확인해 주세요.', 400, 'invalid_grant');
      tx.update(ref, {usedAt: now()});
      return data;
    });
    const app = await client(record.clientId), grantRef = grants().doc(), grantExpiresAt = plus(record.accessDays * 86_400);
    await grantRef.create({uid: record.uid, clientId: record.clientId, clientName: app?.name ?? '', scopes: record.scopes, resource: record.resource ?? null, createdAt: now(), expiresAt: grantExpiresAt, lastUsedAt: null, revokedAt: null});
    return json(await issueTokens(grantRef.id, record.uid, record.scopes, grantExpiresAt), 200, cors);
  }
  if (grantType === 'refresh_token') {
    if (typeof body.refresh_token !== 'string' || body.refresh_token.length > 200) throw new BerryError('refresh_token을 확인해 주세요.', 400, 'invalid_grant');
    const ref = tokens().doc(hashToken(body.refresh_token));
    const {grantId, uid, scopes, grantExpiresAt} = await db().runTransaction(async tx => {
      const doc = await tx.get(ref), data = doc.data();
      if (!data || data.kind !== 'refresh') throw new BerryError('refresh_token을 확인해 주세요.', 400, 'invalid_grant');
      const grant = (await tx.get(grants().doc(data.grantId))).data();
      if (!grant || grant.revokedAt || Date.parse(grant.expiresAt) < Date.now()) throw new BerryError('연결이 만료됐거나 해제됐어요. 다시 연결해 주세요.', 400, 'invalid_grant');
      if (body.client_id !== undefined && body.client_id !== grant.clientId) throw new BerryError('client_id가 달라요.', 400, 'invalid_grant');
      // A replayed refresh token means it leaked somewhere: end the whole grant.
      if (data.revokedAt) {tx.update(grants().doc(data.grantId), {revokedAt: now(), revokedReason: 'refresh_reuse'}); throw new BerryError('이미 사용한 refresh_token이에요. 안전을 위해 연결을 해제했어요.', 400, 'invalid_grant');}
      if ((data.expiresAt as Timestamp).toMillis() < Date.now()) throw new BerryError('refresh_token이 만료됐어요.', 400, 'invalid_grant');
      const requested = body.scope === undefined ? data.scopes as BerryScope[] : parseScopes(body.scope);
      if (!scopesWithin(data.scopes as BerryScope[], requested)) throw new BerryError('권한을 넓힐 수 없어요.', 400, 'invalid_scope');
      tx.update(ref, {revokedAt: now()});
      return {grantId: data.grantId as string, uid: data.uid as string, scopes: requested, grantExpiresAt: grant.expiresAt as string};
    });
    return json(await issueTokens(grantId, uid, scopes, grantExpiresAt), 200, cors);
  }
  throw new BerryError('authorization_code·refresh_token만 지원해요.', 400, 'unsupported_grant_type');
}
/** RFC 7009: revoking either token ends the whole grant. Unknown tokens still answer 200. */
async function revoke(request: Request) {
  const body = await input(request);
  if (typeof body.token === 'string' && body.token.length <= 200) {
    const doc = await tokens().doc(hashToken(body.token)).get();
    if (doc.exists) await grants().doc(doc.data()!.grantId).set({revokedAt: now(), revokedReason: 'client'}, {merge: true});
  }
  return json({ok: true}, 200, cors);
}

// ---- Bearer authentication for MCP and the event feed ----
export async function bearer(request: Request, needed?: BerryScope): Promise<BearerContext> {
  const header = request.headers.get('authorization') ?? '', match = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/i.exec(header);
  const challenge = (error?: string) => ({'WWW-Authenticate': resourceMetadataChallenge(issuer(request), error)});
  if (!match) throw Object.assign(new BerryError('로그인 토큰이 필요해요.', 401, 'invalid_token'), {headers: challenge()});
  const doc = await tokens().doc(hashToken(match[1])).get(), data = doc.data();
  if (!data || data.kind !== 'access' || (data.expiresAt as Timestamp).toMillis() < Date.now()) throw Object.assign(new BerryError('토큰이 만료됐어요. 다시 발급받아 주세요.', 401, 'invalid_token'), {headers: challenge('invalid_token')});
  const grant = (await grants().doc(data.grantId).get()).data();
  if (!grant || grant.revokedAt || Date.parse(grant.expiresAt) < Date.now()) throw Object.assign(new BerryError('연결이 해제됐어요.', 401, 'invalid_token'), {headers: challenge('invalid_token')});
  const scopes = (data.scopes ?? []) as BerryScope[];
  if (needed && !scopes.includes(needed)) throw Object.assign(new BerryError(`이 작업에는 ${BERRY_SCOPE_LABELS[needed].title} 권한이 필요해요.`, 403, 'insufficient_scope'), {headers: challenge('insufficient_scope')});
  const ctx = await contextForUid(data.uid as string);
  if (disabled() || !connectorAllowed(await access(), ctx.uid, ctx.role, process.env.BERRY_CONNECTOR_DISABLED, process.env.BERRY_CONNECTOR_MODE)) throw Object.assign(new BerryError('외부 연결을 아직 사용할 수 없어요.', 403, 'access_denied'), {headers: challenge()});
  return {uid: ctx.uid, grantId: data.grantId as string, clientId: grant.clientId as string, scopes};
}

// ---- Teacher-facing grant management (session cookie) ----
function publicGrant(doc: FirebaseFirestore.DocumentSnapshot): BerryGrant {
  const data = doc.data()!;
  return {id: doc.id, clientId: data.clientId, clientName: data.clientName ?? '', scopes: data.scopes ?? [], createdAt: data.createdAt, expiresAt: data.expiresAt, lastUsedAt: data.lastUsedAt ?? null, revokedAt: data.revokedAt ?? null};
}
async function listGrants(ctx: Context) {
  const snap = await grants().where('uid', '==', ctx.uid).limit(100).get();
  return json({grants: snap.docs.map(publicGrant).sort((a, b) => b.createdAt.localeCompare(a.createdAt))});
}
async function revokeGrant(ctx: Context, grantId: string) {
  const ref = grants().doc(safeId(grantId)), doc = await ref.get();
  if (!doc.exists || doc.data()!.uid !== ctx.uid) throw new BerryError('연결을 찾을 수 없어요.', 404, 'not_found');
  await ref.set({revokedAt: now(), revokedReason: 'teacher'}, {merge: true});
  return json({ok: true});
}

export async function handleOAuth(request: Request, segments: string[]) {
  const path = segments.join('/'), method = request.method;
  try {
    if (method === 'OPTIONS') return new NextResponse(null, {status: 204, headers: cors});
    if (disabled()) throw new BerryError('외부 연결을 아직 사용할 수 없어요.', 404, 'not_found');
    if (path === 'register' && method === 'POST') return await register(request);
    if (path === 'token' && method === 'POST') return await token(request);
    if (path === 'revoke' && method === 'POST') return await revoke(request);
    // Everything below belongs to the signed-in teacher.
    if (method !== 'GET') assertOrigin(request);
    const ctx = await getContext(request);
    if (path === 'status' && method === 'GET') return json({available: connectorAllowed(await access(), ctx.uid, ctx.role, process.env.BERRY_CONNECTOR_DISABLED, process.env.BERRY_CONNECTOR_MODE), issuer: issuer(request)});
    await allowedTeacher(ctx);
    if (path === 'consent' && method === 'GET') return await consentInfo(request, ctx);
    if (path === 'consent' && method === 'POST') return await approve(request, ctx);
    if (path === 'grants' && method === 'GET') return await listGrants(ctx);
    if (segments[0] === 'grants' && segments.length === 2 && method === 'DELETE') return await revokeGrant(ctx, segments[1]);
    throw new BerryError('찾을 수 없어요.', 404, 'not_found');
  } catch (error) {
    return errorResponse(error, path === 'register' || path === 'token' || path === 'revoke' ? cors : {});
  }
}
