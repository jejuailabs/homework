import 'server-only';
import type {DictionaryEntry, DictionaryExplanation, DictionaryGrade, DictionaryLevel, DictionarySearchResult, DictionarySense, DictionarySimplifyInput, DictionarySource} from '@/lib/korean-dictionary';
import {ApiError} from './policy';

const ENDPOINT = 'https://stdict.korean.go.kr/api/search.do';
const STANDARD_VIEW = 'https://stdict.korean.go.kr/api/view.do';
const OPEN_SEARCH = 'https://opendict.korean.go.kr/api/search';
const OPEN_VIEW = 'https://opendict.korean.go.kr/api/view';
const OPEN_ENTRIES = 8;
// 우리말샘 also lists films, songs and paintings under ordinary words; those are not what a class is looking up.
const OPEN_WORK = /감독의|감독이 만든|작사|작곡의|앨범에|화가 .*그린 그림/;
const OPEN_WORD = /^[가-힣0-9 ]{1,40}$/;
const BASIC_SEARCH = 'https://krdict.korean.go.kr/api/search';
const BASIC_VIEW = 'https://krdict.korean.go.kr/api/view';
const GRADE_LEVEL: Record<DictionaryGrade, string> = {초급: 'level1', 중급: 'level2', 고급: 'level3'};
const LEVELS: readonly DictionaryLevel[] = ['easy', 'normal', 'deep'];
const KEY_PATTERN = /^[a-f\d]{32}$/i;
const CODE_PATTERN = /^[1-9]\d{0,19}$/;
const SENSE_LIMIT = 12, DEEP_ENTRIES = 4, IDIOM_LIMIT = 8;
/** Regional, archaic and North Korean senses are left out of a children's explanation. */
const HIDDEN_SENSE_TYPES = new Set(['방언', '옛말', '북한어']);
const PAGE_SIZE = 20;
const MAX_BODY_BYTES = 1_000_000;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_ENTRIES = 120;
const MAX_LIMIT_USERS = 1_000;
const MINUTE_REQUESTS = 30;

/** both: the exact word first, then words containing it. The other two go straight to a provider. */
export type DictionaryQuery = {query: string; start: number; match: 'exact' | 'include' | 'both'; grade?: DictionaryGrade};
type DictionaryConfig = {key?: string; basicKey?: string; disabled?: string};
export type DictionaryCallRecord = {uid: string; tool: 'dictionary-search' | 'dictionary-explain'; model: string; cached: boolean; ok: boolean; durationMs: number};
type DictionaryDependencies = {
  authenticate: (request: Request) => Promise<{uid: string}>;
  fetch: typeof fetch;
  now: () => number;
  configuration: () => DictionaryConfig;
  /** One note per provider call or cache reuse, for the admin cost report. */
  record?: (event: DictionaryCallRecord) => void;
  /** Rewrites the dictionary's text for children. Null keeps the dictionary's own wording. */
  simplify?: (uid: string, input: DictionarySimplifyInput) => Promise<DictionarySense[] | null>;
};
type WordDetail = {word: string; partOfSpeech: string; pronunciation: string; origin: string; idioms: string[]; senses: DictionarySense[]};

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
  const grade = params.get('grade') ?? '';
  if (!query || [...query].length > 80 || /[\u0000-\u001f\u007f]/u.test(query)
    || !/^\d{1,4}$/.test(startText) || Number(startText) < 1 || Number(startText) > 1_000
    || (match !== 'exact' && match !== 'include' && match !== 'both')
    || (grade !== '' && !Object.hasOwn(GRADE_LEVEL, grade))
    || ['q', 'start', 'match', 'grade'].some(name => params.getAll(name).length > 1)) {
    throw new ApiError(400, '검색어는 1~80자로 입력하고 검색 조건을 확인해 주세요.', 'DICTIONARY_INPUT');
  }
  return {query, start: Number(startText), match, ...(grade ? {grade: grade as DictionaryGrade} : {})};
}

export function parseDictionaryExplainQuery(url: URL): {id: string; level: DictionaryLevel; word?: string} {
  const id = url.searchParams.get('id') ?? '', level = url.searchParams.get('level') ?? 'normal', open = id.startsWith('o');
  // 우리말샘's detail response has no headword, so the word comes with the request and is held to plain Korean.
  const word = url.searchParams.get('word') ?? '';
  if (!CODE_PATTERN.test(id.replace(/^[ko]/, '')) || !LEVELS.includes(level as DictionaryLevel) || (open && !OPEN_WORD.test(word))) throw new ApiError(400, '낱말을 다시 골라 주세요.', 'DICTIONARY_INPUT');
  return {id, level: level as DictionaryLevel, ...(open ? {word} : {})};
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
  // The provider answers a word it does not have with an empty object.
  if (!Object.keys(root).length) return {query: input.query, total: 0, start: input.start, num: PAGE_SIZE, entries: [], source: 'standard'};
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
      source: 'standard' as const,
      grade: '' as const,
    };
  });
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw invalidResponse();
  return {query: input.query, total, start: input.start, num: PAGE_SIZE, entries, source: 'standard'};
}

// The Basic Dictionary answers in a small, flat XML. Entities beyond the standard five are never expanded.
const decodeXml = (value: string) => value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(?:#(\d{1,7})|#x([\da-f]{1,6})|(amp|lt|gt|quot|apos));/gi, (whole, decimal, hex, name) => {
  if (name) return ({amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"} as Record<string, string>)[name.toLowerCase()];
  const point = decimal ? Number(decimal) : parseInt(hex, 16);
  return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
});
const xmlBlocks = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map(match => match[1]);
const xmlText = (xml: string, tag: string) => decodeXml(xmlBlocks(xml, tag)[0] ?? '').trim();
const cleanText = (value: string) => value.replace(/<\/?[a-z][^>]*>/gi, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
const gradeOf = (value: string): DictionaryGrade | '' => Object.hasOwn(GRADE_LEVEL, value) ? value as DictionaryGrade : '';

function assertBasicResponse(xml: string) {
  const failure = xmlBlocks(xml, 'error')[0];
  if (failure !== undefined) {
    const code = xmlText(failure, 'error_code').padStart(3, '0');
    throw code === '020' || code === '021' ? notConfigured() : unavailable();
  }
  if (!xml.includes('<channel')) throw invalidResponse();
}

export function parseBasicSearchResponse(xml: string, input: DictionaryQuery): DictionarySearchResult {
  assertBasicResponse(xml);
  const total = Number(xmlText(xml, 'total')), items = xmlBlocks(xml, 'item');
  if (!xmlText(xml, 'total') || !Number.isSafeInteger(total) || total < 0 || items.length > PAGE_SIZE) throw invalidResponse();
  const entries: DictionaryEntry[] = items.map(item => {
    const code = xmlText(item, 'target_code');
    if (!CODE_PATTERN.test(code)) throw invalidResponse();
    const senses = xmlBlocks(item, 'sense').map(sense => plainText(cleanText(xmlText(sense, 'definition')), 12_000));
    if (!senses.length || senses.length > 50) throw invalidResponse();
    return {
      id: 'k' + code, word: plainText(xmlText(item, 'word'), 500), originalWord: plainText(xmlText(item, 'origin'), 100, true),
      partOfSpeech: plainText(xmlText(item, 'pos'), 100, true), definition: senses.join('\n'),
      link: `https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=${code}`, source: 'basic', grade: gradeOf(xmlText(item, 'word_grade')),
    };
  });
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw invalidResponse();
  return {query: input.query, total, start: input.start, num: PAGE_SIZE, entries, source: 'basic'};
}

export function parseBasicView(xml: string): WordDetail {
  assertBasicResponse(xml);
  const info = xmlBlocks(xml, 'word_info')[0];
  if (info === undefined) throw invalidResponse();
  const senses = xmlBlocks(info, 'sense_info').slice(0, SENSE_LIMIT).map(block => {
    const examples = xmlBlocks(block, 'example_info'), sentence = examples.find(example => xmlText(example, 'type') === '문장') ?? examples[0];
    return {definition: plainText(cleanText(xmlText(block, 'definition')), 12_000), example: sentence ? cleanText(xmlText(sentence, 'example')) : ''};
  });
  if (!senses.length) throw invalidResponse();
  return {word: plainText(xmlText(info, 'word'), 500), partOfSpeech: xmlText(info, 'pos'), pronunciation: xmlText(xmlBlocks(info, 'pronunciation_info')[0] ?? '', 'pronunciation'), origin: xmlText(xmlBlocks(info, 'original_language_info')[0] ?? '', 'original_language'), idioms: [], senses};
}

export function parseStandardView(value: unknown): WordDetail {
  const root = object(value);
  if (!root) throw invalidResponse();
  if (Object.hasOwn(root, 'error')) throw unavailable();
  const info = object(object(list(object(root.channel)?.item)[0])?.word_info);
  if (!info) throw invalidResponse();
  const senses: DictionarySense[] = [];
  let partOfSpeech = '';
  for (const posRaw of list(info.pos_info)) {
    const pos = object(posRaw);
    partOfSpeech ||= typeof pos?.pos === 'string' ? pos.pos : '';
    for (const pattern of list(pos?.comm_pattern_info)) for (const senseRaw of list(object(pattern)?.sense_info)) {
      const sense = object(senseRaw);
      if (!sense || HIDDEN_SENSE_TYPES.has(String(sense.type)) || senses.length >= SENSE_LIMIT) continue;
      const example = object(list(sense.example_info)[0])?.example;
      senses.push({definition: cleanText(plainText(sense.definition, 12_000)), example: typeof example === 'string' ? cleanText(example) : ''});
    }
  }
  if (!senses.length) throw invalidResponse();
  const idioms = [...new Set(list(info.relation_info).flatMap(raw => {const row = object(raw); return row && ['관용구', '속담'].includes(String(row.type)) && typeof row.word === 'string' ? [row.word.replace(/\^/g, ' ')] : [];}))].slice(0, IDIOM_LIMIT);
  const pronunciation = object(list(info.pronunciation_info)[0])?.pronunciation;
  const origin = list(info.original_language_info).map(raw => object(raw)?.original_language).filter((part): part is string => typeof part === 'string').join('');
  return {word: plainText(info.word, 500).replace(/-/g, '').replace(/\^/g, ' '), partOfSpeech, pronunciation: typeof pronunciation === 'string' ? pronunciation : '', origin, idioms, senses};
}

async function boundedText(response: Response): Promise<string> {
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
  try {return new TextDecoder('utf-8', {fatal: true}).decode(bytes);}
  catch {throw invalidResponse();}
}

const openHidden = (type: unknown, categories: unknown[], definition: string) => HIDDEN_SENSE_TYPES.has(String(type)) || categories.includes('영상') || OPEN_WORK.test(definition);

export function parseOpenSearchResponse(value: unknown, query: string): DictionaryEntry[] {
  const root = object(value);
  if (!root) throw invalidResponse();
  if (!Object.keys(root).length) return [];
  if (Object.hasOwn(root, 'error')) throw unavailable();
  const channel = object(root.channel);
  if (!channel) throw invalidResponse();
  const entries: DictionaryEntry[] = [];
  for (const raw of list(channel.item)) {
    const item = object(raw), word = typeof item?.word === 'string' ? item.word.replace(/[-^]/g, '') : '';
    if (word !== query) continue;
    for (const senseRaw of list(item?.sense)) {
      const sense = object(senseRaw), code = String(sense?.target_code ?? ''), definition = cleanText(plainText(sense?.definition, 12_000));
      if (!CODE_PATTERN.test(code)) throw invalidResponse();
      if (entries.length >= OPEN_ENTRIES || openHidden(sense?.type, list(sense?.cat), definition)) continue;
      entries.push({id: 'o' + code, word, originalWord: '', partOfSpeech: typeof sense?.pos === 'string' ? sense.pos : '', definition, link: `https://opendict.korean.go.kr/dictionary/view?sense_no=${code}`, source: 'open', grade: ''});
    }
  }
  return entries;
}

/** Example sentences here are quoted from news articles, so only the meaning is carried over for children. */
export function parseOpenView(value: unknown, word: string): WordDetail {
  const root = object(value);
  if (!root) throw invalidResponse();
  if (Object.hasOwn(root, 'error')) throw unavailable();
  const sense = object(object(list(object(root.channel)?.item)[0])?.senseInfo);
  if (!sense) throw invalidResponse();
  return {word, partOfSpeech: typeof sense.pos === 'string' ? sense.pos : '', pronunciation: '', origin: '', idioms: [], senses: [{definition: cleanText(plainText(sense.definition, 12_000)), example: ''}]};
}

function parseJson(text: string): unknown {
  try {return JSON.parse(text);} catch {throw invalidResponse();}
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

/**
 * Providers sort alphabetically, so a word can sit pages away from where it is wanted. The exact word always
 * leads page one; every containing page leaves it out so it never appears twice. `extra` counts exact entries
 * from another dictionary, which the containing total does not include.
 */
export function combineDictionaryResults(query: string, exact: DictionaryEntry[], containing: DictionarySearchResult, extra = 0): DictionarySearchResult {
  const seen = new Set(exact.map(entry => entry.id));
  // Affixes such as -배 also match exactly; the plain word goes ahead of them.
  const leading = [...exact].sort((a, b) => Number(b.word === query) - Number(a.word === query));
  return {...containing, total: containing.total + extra, entries: [...leading, ...containing.entries.filter(entry => entry.word !== query && !seen.has(entry.id))]};
}

/** Both providers count `start` in pages, while this API counts entries. */
const providerPage = (start: number) => String(Math.floor((start - 1) / PAGE_SIZE) + 1);

const failure = (error: unknown) => json({error: error instanceof ApiError ? error.message : '사전 검색을 완료하지 못했어요. 다시 시도해 주세요.', code: error instanceof ApiError ? error.code : 'DICTIONARY_ERROR'}, error instanceof ApiError ? error.status : 500);

export function createDictionaryHandlers(dependencies: DictionaryDependencies) {
  const cache = new Map<string, {expiresAt: number; result: unknown}>();
  const users = new Map<string, {expiresAt: number; count: number}>();
  let configuredKey = '';
  const record = (event: Omit<DictionaryCallRecord, 'durationMs'> & {durationMs?: number}) => {try {dependencies.record?.({durationMs: 0, ...event});} catch {}};

  function settings() {
    const configuration = dependencies.configuration();
    if ((configuration.disabled ?? '').split(',').map(id => id.trim()).includes('dictionary')) {
      throw new ApiError(403, '현재 국어사전 도구를 사용할 수 없어요.', 'DICTIONARY_DISABLED');
    }
    const key = configuration.key?.trim(), basic = configuration.basicKey?.trim();
    // Unconfigured local previews fail before Firebase authentication reads.
    if (!key || !KEY_PATTERN.test(key)) throw notConfigured();
    return {key, basicKey: basic && KEY_PATTERN.test(basic) ? basic : ''};
  }

  // These per-process bounds reduce repeated requests; they are not a distributed
  // quota or a guarantee about hosting/Auth costs.
  async function admit(request: Request, keys: {key: string; basicKey: string}) {
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
    const fingerprint = keys.key + ':' + keys.basicKey;
    if (configuredKey !== fingerprint) {cache.clear(); configuredKey = fingerprint;}
    for (const [id, cached] of cache) if (cached.expiresAt <= now) cache.delete(id);
    return context.uid;
  }

  function remember(key: string, result: unknown) {
    if (cache.size >= CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(key, {result, expiresAt: dependencies.now() + CACHE_TTL_MS});
  }

  async function call(uid: string, tool: DictionaryCallRecord['tool'], model: string, endpoint: string, search: Record<string, string>, accept: string) {
    const url = new URL(endpoint), started = Date.now();
    url.search = new URLSearchParams(search).toString();
    try {
      const response = await dependencies.fetch(url, {headers: {Accept: accept}, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8_000)});
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 429) throw new ApiError(429, '사전 서비스가 잠시 바빠요. 나중에 다시 검색해 주세요.', 'DICTIONARY_RATE_LIMIT');
        if (response.status === 401 || response.status === 403) throw notConfigured();
        throw unavailable();
      }
      const text = await boundedText(response);
      record({uid, tool, model, cached: false, ok: true, durationMs: Date.now() - started});
      return text;
    } catch (error) {
      record({uid, tool, model, cached: false, ok: false, durationMs: Date.now() - started});
      if (error instanceof ApiError) throw error;
      // Fetch failures can contain the full URL, including the secret key.
      throw unavailable();
    }
  }

  async function standardSearch(uid: string, tool: DictionaryCallRecord['tool'], key: string, input: DictionaryQuery) {
    const text = await call(uid, tool, 'stdict-search', ENDPOINT, {key, q: input.query, req_type: 'json', start: providerPage(input.start), num: String(PAGE_SIZE), advanced: 'y', target: '1', method: input.match}, 'application/json');
    return parseDictionarySearchResponse(parseJson(text), input);
  }
  const standardView = async (uid: string, key: string, code: string) => parseStandardView(parseJson(await call(uid, 'dictionary-explain', 'stdict-view', STANDARD_VIEW, {key, type_search: 'view', method: 'TARGET_CODE', q: code, req_type: 'json'}, 'application/json')));

  async function search(request: Request): Promise<Response> {
    try {
      if (request.method !== 'GET') throw new ApiError(405, '검색 요청을 확인해 주세요.', 'METHOD_NOT_ALLOWED');
      assertSameOrigin(request);
      const input = parseDictionaryQuery(new URL(request.url));
      const keys = settings();
      if (input.grade && !keys.basicKey) throw notConfigured();
      const uid = await admit(request, keys);
      const cacheKey = JSON.stringify(['search', input.query, input.start, input.match, input.grade ?? '']);
      const cached = cache.get(cacheKey);
      if (cached) {
        record({uid, tool: 'dictionary-search', model: (cached.result as DictionarySearchResult).source === 'basic' ? 'krdict-search' : 'stdict-search', cached: true, ok: true});
        return json(cached.result);
      }
      const firstPage = input.start === 1;
      const basicSearch = async (match: 'exact' | 'include') => parseBasicSearchResponse(await call(uid, 'dictionary-search', 'krdict-search', BASIC_SEARCH, {key: keys.basicKey, q: input.query, part: 'word', start: providerPage(input.start), num: String(PAGE_SIZE), sort: 'dict', advanced: 'y', method: match, ...(input.grade ? {level: GRADE_LEVEL[input.grade]} : {})}, 'application/xml'), {...input, match});
      const standardExact = () => standardSearch(uid, 'dictionary-search', keys.key, {query: input.query, start: 1, match: 'exact'});
      let result: DictionarySearchResult | null = null;
      if (keys.basicKey) {
        try {
          if (input.match === 'both') {
            const [containing, exact] = await Promise.all([basicSearch('include'), firstPage ? basicSearch('exact') : null]);
            if (containing.total > 0 || exact?.entries.length || input.grade) {
              // A word only the Standard Dictionary has still belongs at the top, unless a level was asked for.
              const other = firstPage && !exact?.entries.length && !input.grade ? (await standardExact().catch(() => null))?.entries ?? [] : [];
              result = combineDictionaryResults(input.query, exact?.entries.length ? exact.entries : other, containing, other.length);
            }
          } else {
            const basic = await basicSearch(input.match);
            if (basic.total > 0 || input.grade) result = basic;
          }
        } catch (error) {
          // A level filter only exists in the Basic Dictionary; a plain search can still be answered.
          if (input.grade) throw error;
        }
      }
      if (!result && input.match === 'both') {
        const [containing, exact] = await Promise.all([standardSearch(uid, 'dictionary-search', keys.key, {...input, match: 'include'}), firstPage ? standardExact() : null]);
        result = combineDictionaryResults(input.query, exact?.entries ?? [], containing);
      }
      result ??= await standardSearch(uid, 'dictionary-search', keys.key, input);
      if (input.match === 'both' && firstPage && !input.grade && !result.entries.some(entry => entry.word === input.query)) {
        // Place names and new words: only when neither main dictionary has the word itself.
        const open = await call(uid, 'dictionary-search', 'opendict-search', OPEN_SEARCH, {key: keys.key, q: input.query, req_type: 'json', num: '10', advanced: 'y', method: 'exact'}, 'application/json').then(text => parseOpenSearchResponse(parseJson(text), input.query)).catch(() => []);
        if (open.length) result = combineDictionaryResults(input.query, open, result, open.length);
      }
      remember(cacheKey, result);
      return json(result);
    } catch (error) {return failure(error);}
  }

  async function deepDetail(uid: string, key: string, base: WordDetail): Promise<{detail: WordDetail; found: boolean}> {
    const found = await standardSearch(uid, 'dictionary-explain', key, {query: base.word, start: 1, match: 'exact'}).catch(() => null);
    const samePos = found?.entries.filter(entry => entry.partOfSpeech === base.partOfSpeech).slice(0, DEEP_ENTRIES) ?? [];
    if (!samePos.length) return {detail: base, found: false};
    const details = await Promise.all(samePos.map(entry => standardView(uid, key, entry.id)));
    const senses = details.flatMap((detail, index) => detail.senses.map((sense, order) => details.length > 1 && order === 0 ? {...sense, heading: `${detail.word} ${index + 1}`} : sense));
    return {detail: {...base, pronunciation: details[0].pronunciation || base.pronunciation, origin: details.length === 1 ? details[0].origin : base.origin, idioms: [...new Set(details.flatMap(detail => detail.idioms))].slice(0, IDIOM_LIMIT), senses: senses.slice(0, SENSE_LIMIT)}, found: true};
  }

  async function explain(request: Request): Promise<Response> {
    try {
      if (request.method !== 'GET') throw new ApiError(405, '요청을 확인해 주세요.', 'METHOD_NOT_ALLOWED');
      assertSameOrigin(request);
      const {id, level, word} = parseDictionaryExplainQuery(new URL(request.url));
      const keys = settings(), basic = id.startsWith('k'), open = id.startsWith('o'), code = id.replace(/^[ko]/, '');
      if (basic && !keys.basicKey) throw notConfigured();
      const uid = await admit(request, keys);
      const cacheKey = JSON.stringify(['explain', id, level, word ?? '']);
      const cached = cache.get(cacheKey);
      if (cached) {
        record({uid, tool: 'dictionary-explain', model: basic ? 'krdict-view' : open ? 'opendict-view' : 'stdict-view', cached: true, ok: true});
        return json(cached.result);
      }
      const detail = basic ? parseBasicView(await call(uid, 'dictionary-explain', 'krdict-view', BASIC_VIEW, {key: keys.basicKey, method: 'target_code', q: code}, 'application/xml')) : open ? parseOpenView(parseJson(await call(uid, 'dictionary-explain', 'opendict-view', OPEN_VIEW, {key: keys.key, method: 'target_code', q: code, req_type: 'json'}, 'application/json')), word ?? '') : await standardView(uid, keys.key, code);
      const own: DictionarySource = basic ? 'basic' : open ? 'open' : 'standard';
      let shown = detail, source: DictionaryExplanation['source'] = own, fallback = false;
      if (level === 'deep') {
        if (basic) {const deep = await deepDetail(uid, keys.key, detail); shown = deep.detail; source = deep.found ? 'standard' : 'basic';}
      } else if (level === 'easy' || !basic) {
        const senses = detail.senses.slice(0, 8);
        const simplified = await dependencies.simplify?.(uid, {level: level === 'easy' ? 'easy' : 'normal', word: detail.word, partOfSpeech: detail.partOfSpeech, senses}) ?? null;
        if (simplified) {shown = {...detail, senses: simplified}; source = 'ai';} else fallback = true;
      }
      const result: DictionaryExplanation = {id, level, source, fallback, word: shown.word, partOfSpeech: shown.partOfSpeech, pronunciation: shown.pronunciation, origin: shown.origin, idioms: shown.idioms, senses: shown.senses};
      if (!fallback) remember(cacheKey, result);
      return json(result);
    } catch (error) {return failure(error);}
  }

  return {search, explain};
}

export const createDictionaryHandler = (dependencies: DictionaryDependencies) => createDictionaryHandlers(dependencies).search;
