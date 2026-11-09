import 'server-only';
import type {DictionaryEntry, DictionarySearchResult} from '@/lib/korean-dictionary';
import {requireTeacher} from './auth';
import {ApiError} from './policy';

const ENDPOINT = 'https://stdict.korean.go.kr/api/search.do';
const PAGE_SIZE = 20;
const MAX_BODY_BYTES = 1_000_000;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_ENTRIES = 120;
const MAX_LIMIT_USERS = 1_000;
const MINUTE_REQUESTS = 30;

export type DictionaryQuery = {query: string; start: number; match: 'exact' | 'include'};
type DictionaryConfig = {key?: string; disabled?: string};
type DictionaryDependencies = {
  authenticate: (request: Request) => Promise<{uid: string}>;
  fetch: typeof fetch;
  now: () => number;
  configuration: () => DictionaryConfig;
};

const invalidResponse = () => new ApiError(502, '사전 검색 결과를 읽지 못했어요. 잠시 뒤 다시 검색해 주세요.', 'DICTIONARY_INVALID_RESPONSE');
const unavailable = () => new ApiError(503, '사전 서비스에 연결하지 못했어요. 잠시 뒤 다시 검색해 주세요.', 'DICTIONARY_UNAVAILABLE');
const notConfigured = () => new ApiError(503, '사전 연결을 준비하고 있어요. 관리자에게 알려 주세요.', 'DICTIONARY_NOT_CONFIGURED');
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];

export function parseDictionaryQuery(url: URL): DictionaryQuery {
  const params = url.searchParams;
  const query = (params.get('q') ?? '').trim();
  const startText = params.get('start') ?? '1';
  const match = params.get('match') ?? 'exact';
  if (!query || [...query].length > 80 || /[\u0000-\u001f\u007f]/u.test(query)
    || !/^\d{1,4}$/.test(startText) || Number(startText) < 1 || Number(startText) > 1_000
    || (match !== 'exact' && match !== 'include')
    || ['q', 'start', 'match'].some(name => params.getAll(name).length > 1)) {
    throw new ApiError(400, '검색어는 1~80자로 입력하고 검색 조건을 확인해 주세요.', 'DICTIONARY_INPUT');
  }
  return {query, start: Number(startText), match};
}

function plainText(value: unknown, maximum: number, optional = false): string {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw invalidResponse();
  // Definitions are rendered as text, never trusted HTML. Preserve source wording.
  return value.trim();
}

export function parseDictionarySearchResponse(value: unknown, input: DictionaryQuery): DictionarySearchResult {
  const root = object(value);
  if (!root) throw invalidResponse();
  if (Object.hasOwn(root, 'error')) {
    const code = String(object(root.error)?.error_code ?? '').padStart(3, '0');
    if (code === '020' || code === '021') throw notConfigured();
    // Only 020/021 have documented credential meanings in this provider's API.
    // Do not reuse another dictionary's quota error codes.
    throw unavailable();
  }
  const channel = object(root.channel);
  if (!channel) throw invalidResponse();
  const total = typeof channel.total === 'string' && /^\d+$/.test(channel.total) ? Number(channel.total) : channel.total;
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) throw invalidResponse();
  const items = list(channel.item);
  if (items.length > PAGE_SIZE || (total > 0 && input.start <= total && items.length === 0) || (total === 0 && items.length > 0)) throw invalidResponse();
  const entries: DictionaryEntry[] = items.map(raw => {
    const item = object(raw);
    if (!item) throw invalidResponse();
    const id = typeof item.target_code === 'number' && Number.isSafeInteger(item.target_code) ? String(item.target_code) : item.target_code;
    if (typeof id !== 'string' || !/^[1-9]\d{0,19}$/.test(id)) throw invalidResponse();
    const headword = plainText(item.word, 500);
    const senses = list(item.sense);
    if (!senses.length || senses.length > 50) throw invalidResponse();
    const definition = senses.map(sense => plainText(object(sense)?.definition, 12_000)).join('\n');
    if (definition.length > 30_000) throw invalidResponse();
    return {
      id,
      word: headword.replace(/-/g, '').replace(/\^/g, ' '),
      // This contract means etymological 원어, not the provider's raw headword.
      // Search responses do not reliably include it; never infer it from word.
      originalWord: '',
      partOfSpeech: plainText(item.pos ?? object(senses[0])?.pos, 100, true),
      definition,
      // Never relay provider URLs (which might contain credentials or an unsafe origin).
      link: `https://stdict.korean.go.kr/search/searchView.do?word_no=${id}&searchKeywordTo=3`,
    };
  });
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw invalidResponse();
  return {query: input.query, total, start: input.start, num: PAGE_SIZE, entries};
}

async function boundedJson(response: Response): Promise<unknown> {
  const declared = response.headers.get('content-length');
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    await response.body?.cancel();
    throw invalidResponse();
  }
  if (!response.body) throw invalidResponse();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw invalidResponse();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
  try {return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));}
  catch {throw invalidResponse();}
}

function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if ((site && !['same-origin', 'none'].includes(site)) || (origin !== null && origin !== new URL(request.url).origin)) {
    throw new ApiError(403, '이 화면에서 다시 검색해 주세요.', 'ORIGIN');
  }
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {status, headers: {'Cache-Control': 'private, no-store', ...(status === 429 ? {'Retry-After': '60'} : {})}});
}

export function createDictionaryHandler(dependencies: DictionaryDependencies) {
  const cache = new Map<string, {expiresAt: number; result: DictionarySearchResult}>();
  const users = new Map<string, {expiresAt: number; count: number}>();
  let configuredKey = '';
  // These per-process bounds reduce repeated requests; they are not a distributed
  // quota or a guarantee about hosting/Auth costs. No extra database is used.
  return async function dictionaryHandler(request: Request): Promise<Response> {
    try {
      if (request.method !== 'GET') throw new ApiError(405, '검색 요청을 확인해 주세요.', 'METHOD_NOT_ALLOWED');
      assertSameOrigin(request);
      const input = parseDictionaryQuery(new URL(request.url));
      const configuration = dependencies.configuration();
      if ((configuration.disabled ?? '').split(',').map(id => id.trim()).includes('dictionary')) {
        throw new ApiError(403, '현재 국어사전 도구를 사용할 수 없어요.', 'DICTIONARY_DISABLED');
      }
      const key = configuration.key?.trim();
      // Unconfigured local previews fail before Firebase authentication reads.
      if (!key || !/^[a-f\d]{32}$/i.test(key)) throw notConfigured();
      const context = await dependencies.authenticate(request);
      const now = dependencies.now();
      for (const [uid, limit] of users) if (limit.expiresAt <= now) users.delete(uid);
      let userLimit = users.get(context.uid);
      if (!userLimit) {
        if (users.size >= MAX_LIMIT_USERS) users.delete(users.keys().next().value!);
        userLimit = {expiresAt: now + 60_000, count: 0};
        users.set(context.uid, userLimit);
      }
      if (userLimit.count >= MINUTE_REQUESTS) throw new ApiError(429, '검색을 잠시 쉬었다가 다시 해 주세요.', 'DICTIONARY_RATE_LIMIT');
      userLimit.count++;
      if (configuredKey !== key) {cache.clear(); configuredKey = key;}
      for (const [id, cached] of cache) if (cached.expiresAt <= now) cache.delete(id);
      const cacheKey = JSON.stringify([input.query, input.start, input.match]);
      const cached = cache.get(cacheKey);
      if (cached) return json(cached.result);
      const url = new URL(ENDPOINT);
      url.search = new URLSearchParams({key, q: input.query, req_type: 'json', start: String(input.start), num: String(PAGE_SIZE), advanced: 'y', target: '1', method: input.match}).toString();
      let response: Response;
      let raw: unknown;
      try {
        response = await dependencies.fetch(url, {headers: {Accept: 'application/json'}, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8_000)});
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status === 429) throw new ApiError(429, '사전 서비스가 잠시 바빠요. 나중에 다시 검색해 주세요.', 'DICTIONARY_RATE_LIMIT');
          if (response.status === 401 || response.status === 403) throw notConfigured();
          throw unavailable();
        }
        raw = await boundedJson(response);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        // Fetch failures can contain the full URL, including the secret key.
        throw unavailable();
      }
      const result = parseDictionarySearchResponse(raw, input);
      if (cache.size >= CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, {result, expiresAt: dependencies.now() + CACHE_TTL_MS});
      return json(result);
    } catch (error) {
      return json({error: error instanceof ApiError ? error.message : '사전 검색을 완료하지 못했어요. 다시 시도해 주세요.', code: error instanceof ApiError ? error.code : 'DICTIONARY_ERROR'}, error instanceof ApiError ? error.status : 500);
    }
  };
}

export const dictionaryRoute = createDictionaryHandler({
  authenticate: requireTeacher,
  fetch: (...args) => fetch(...args),
  now: Date.now,
  configuration: () => ({key: process.env.STDICT_API_KEY, disabled: process.env.TOOLS_DISABLED}),
});
