import 'server-only';
import {NextResponse} from 'next/server';
import {assertOrigin, getContext} from '@/lib/server/auth';
import {ApiError} from '@/lib/server/policy';
import {access} from '@/modules/berry-connector/oauth';
import {connectorAllowed} from '@/modules/berry-connector/policy';

/**
 * Same-origin proxy from the teacher's browser to the Berry brain. The session cookie stays on ourclass; the brain sees
 * only the service token and the teacher's uid (BERRY_IMPLEMENTATION_HANDOFF.md §3.5). The brain URL and token are server env.
 */
const json = (value: unknown, status = 200) => NextResponse.json(value, {status, headers: {'Cache-Control': 'private, no-store'}});
const ID = /^[0-9a-f-]{36}$/;
const brain = () => ({url: process.env.BERRY_BRAIN_URL?.trim().replace(/\/+$/, '') ?? '', token: process.env.BERRY_SERVICE_TOKEN?.trim() ?? ''});

async function teacher(request: Request) {
  const ctx = await getContext(request);
  const {url, token} = brain();
  const available = ctx.role !== 'student' && !!url && !!token && connectorAllowed(await access(), ctx.uid, ctx.role, process.env.BERRY_CONNECTOR_DISABLED, process.env.BERRY_CONNECTOR_MODE);
  return {ctx, available};
}
function call(uid: string, path: string, init: {method?: string; body?: unknown; timeout?: number} = {}) {
  const {url, token} = brain();
  return fetch(`${url}${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'), cache: 'no-store', signal: AbortSignal.timeout(init.timeout ?? 20_000),
    headers: {'X-Berry-Service-Token': token, 'X-Berry-Uid': uid, ...(init.body === undefined ? {} : {'Content-Type': 'application/json'})},
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}
/** Brain answers pass through with their status; network failures become a plain 502. */
async function relay(response: Promise<Response>) {
  try {
    const res = await response, data = await res.json().catch(() => ({}));
    return json(res.ok ? data : {error: (data as {message?: string}).message ?? '베리가 답하지 못했어요.', code: (data as {error?: string}).error ?? 'BERRY_ERROR'}, res.ok ? 200 : res.status);
  } catch {return json({error: '베리에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.', code: 'BERRY_UNREACHABLE'}, 502);}
}
async function input(request: Request) {
  const raw = await request.text();
  if (raw.length > 20_000) throw new ApiError(413, '입력이 너무 커요.');
  try {const data = JSON.parse(raw || '{}'); if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;} catch {}
  throw new ApiError(400, '입력 내용을 확인해 주세요.');
}

export async function handleBerry(request: Request, segments: string[]) {
  try {
    const method = request.method, [head, id, action] = segments;
    if (method !== 'GET') assertOrigin(request);
    const {ctx, available} = await teacher(request);
    if (head === 'status' && method === 'GET') {
      if (!available) return json({available: false, connected: false});
      try {
        const res = await call(ctx.uid, '/connections/ourclass');
        return json({available: true, connected: res.ok ? !!(await res.json()).connected : false});
      } catch {return json({available: true, connected: false, unreachable: true});}
    }
    if (!available) return json({error: '베리를 아직 사용할 수 없어요.', code: 'BERRY_UNAVAILABLE'}, 403);
    if (head === 'connect' && method === 'POST') return relay(call(ctx.uid, '/connections/ourclass/start', {body: {}}));
    if (head === 'chat' && method === 'POST') {
      const data = await input(request), text = typeof data.text === 'string' ? data.text.trim() : '';
      if (!text || text.length > 4000) throw new ApiError(400, '메시지를 확인해 주세요.');
      const route = typeof (data.context as {route?: unknown} | undefined)?.route === 'string' ? String((data.context as {route: string}).route).slice(0, 200) : undefined;
      const res = await call(ctx.uid, '/chat', {body: {text, surface: 'web', conversation_id: typeof data.conversation_id === 'string' && ID.test(data.conversation_id) ? data.conversation_id : undefined, context: route ? {route} : undefined}, timeout: 58_000})
        .catch(() => null);
      if (!res) return json({error: '베리에 연결하지 못했어요.', code: 'BERRY_UNREACHABLE'}, 502);
      if (!res.ok || !res.body) return relay(Promise.resolve(res));
      // Server-sent events stream straight through; nothing is buffered or stored here.
      return new Response(res.body, {headers: {'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'}});
    }
    if (head === 'inbox' && method === 'GET' && !id) {
      const status = new URL(request.url).searchParams.get('status') ?? 'open';
      if (!['open', 'approved', 'rejected', 'done'].includes(status)) throw new ApiError(400, '상태를 확인해 주세요.');
      return relay(call(ctx.uid, `/inbox?status=${status}`));
    }
    if (head === 'inbox' && method === 'POST' && id && ID.test(id) && ['approve', 'reject', 'done'].includes(action ?? '')) return relay(call(ctx.uid, `/inbox/${id}/${action}`, {body: {}, timeout: 30_000}));
    if (head === 'conversations' && method === 'GET') return relay(call(ctx.uid, '/conversations'));
    return json({error: '찾을 수 없어요.', code: 'NOT_FOUND'}, 404);
  } catch (error) {
    if (error instanceof ApiError) return json({error: error.message, code: error.code}, error.status);
    console.error('Berry proxy failed', (error as {code?: string}).code || 'INTERNAL');
    return json({error: '처리하지 못했어요.', code: 'INTERNAL_ERROR'}, 500);
  }
}
