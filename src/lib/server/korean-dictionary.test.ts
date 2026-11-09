import assert from 'node:assert/strict';
import test from 'node:test';
import {ApiError} from './policy';
import {createDictionaryHandler, parseDictionaryQuery, parseDictionarySearchResponse} from './korean-dictionary';

const fixtureKey = '0'.repeat(32);
const request = (query = '나무', extra = '') => new Request(`https://classroom.test/api/tools/dictionary?q=${encodeURIComponent(query)}${extra}`);
const input = {query: '나무', start: 1, match: 'exact' as const};
const fixture = () => ({channel: {total: 1, start: 1, num: 20, item: [{target_code: 404765, word: '나무', pos: '명사', sense: {definition: '줄기나 가지가 목질로 된 여러해살이 식물.', link: 'https://untrusted.test/?key=secret'}}]}});

function harness() {
  const state = {authCalls: 0, fetchCalls: 0, now: 1_000, uid: 'teacher-a', key: fixtureKey, disabled: '', response: () => Response.json(fixture())};
  const handler = createDictionaryHandler({
    configuration: () => ({key: state.key, disabled: state.disabled}),
    now: () => state.now,
    authenticate: async () => {state.authCalls++; return {uid: state.uid};},
    fetch: async () => {state.fetchCalls++; return state.response();},
  });
  return {state, handler};
}

test('search validation bounds user input and rejects ambiguous paging/matching', () => {
  assert.deepEqual(parseDictionaryQuery(new URL(request('  나무  ', '&start=21&match=include').url)), {query: '나무', start: 21, match: 'include'});
  for (const url of [request(''), request('가'.repeat(81)), request('나\n무'), request('나무', '&start=0'), request('나무', '&start=1001'), request('나무', '&start=1e2'), request('나무', '&match=wildcard'), request('나무', '&q=다른말'), request('나무', '&start=1&start=2')]) {
    assert.throws(() => parseDictionaryQuery(new URL(url.url)), {code: 'DICTIONARY_INPUT'});
  }
});

test('response normalizes numeric/string IDs and official links, preserving source text', () => {
  const result = parseDictionarySearchResponse(fixture(), input);
  assert.deepEqual(result, {query: '나무', total: 1, start: 1, num: 20, entries: [{id: '404765', word: '나무', originalWord: '', partOfSpeech: '명사', definition: '줄기나 가지가 목질로 된 여러해살이 식물.', link: 'https://stdict.korean.go.kr/search/searchView.do?word_no=404765&searchKeywordTo=3'}]});
  const other = {channel: {total: '1', item: {target_code: '123', word: '학교^생-활', sense: [{definition: '<b>원문</b>'}, {definition: '둘째 뜻.'}]}}};
  const entry = parseDictionarySearchResponse(other, input).entries[0];
  assert.equal(entry.word, '학교 생활');
  assert.equal(entry.originalWord, '');
  assert.equal(entry.definition, '<b>원문</b>\n둘째 뜻.');
  assert.equal(entry.partOfSpeech, '');
});

test('empty result channels are valid while missing and malformed result payloads fail', () => {
  assert.deepEqual(parseDictionarySearchResponse({channel: {total: 0}}, input).entries, []);
  assert.deepEqual(parseDictionarySearchResponse({channel: {total: 0, item: []}}, input).entries, []);
  assert.deepEqual(parseDictionarySearchResponse({channel: {total: 1}}, {...input, start: 21}).entries, []);
  for (const raw of [null, {}, {channel: {}}, {channel: {total: -1}}, {channel: {total: 1}}, {channel: {total: 1, item: [null]}}, {channel: {total: 1, item: [{target_code: '../secret', word: '나무', sense: {definition: '뜻'}}]}}]) {
    assert.throws(() => parseDictionarySearchResponse(raw, input), {code: 'DICTIONARY_INVALID_RESPONSE'});
  }
});

test('provider errors are mapped without echoing response messages', () => {
  for (const code of ['020', 20, '021', 21]) assert.throws(() => parseDictionarySearchResponse({error: {error_code: code, message: fixtureKey}}, input), {code: 'DICTIONARY_NOT_CONFIGURED'});
  assert.throws(() => parseDictionarySearchResponse({error: {error_code: '010', message: fixtureKey}}, input), {code: 'DICTIONARY_UNAVAILABLE'});
  assert.throws(() => parseDictionarySearchResponse({error: {error_code: '000', message: fixtureKey}}, input), {code: 'DICTIONARY_UNAVAILABLE'});
});

test('parser rejects duplicate identity and malformed multi-sense entries without trusting provider URLs', () => {
  const valid = fixture().channel.item[0];
  for (const items of [
    [valid, {...valid}],
    [{...valid, target_code: Number.MAX_SAFE_INTEGER + 1}],
    [{...valid, sense: [{definition: '첫째 뜻'}, {definition: null}]}],
    [{...valid, sense: {definition: '가'.repeat(12_001)}}],
    Array.from({length: 21}, (_, index) => ({...valid, target_code: index + 1})),
  ]) assert.throws(() => parseDictionarySearchResponse({channel: {total: items.length, item: items}}, input), {code: 'DICTIONARY_INVALID_RESPONSE'});
  const entry = parseDictionarySearchResponse({channel: {total: 1, item: [{...valid, sense: {definition: '뜻', link: `https://stdict.korean.go.kr/search/searchView.do?key=${fixtureKey}`}}]}}, input).entries[0];
  assert.equal(entry.link.includes(fixtureKey), false);
  assert.equal(entry.originalWord, '');
});

test('missing/malformed configuration and disabled tool avoid auth and external calls', async () => {
  const {state, handler} = harness();
  for (const key of ['', 'not-a-valid-key']) {
    state.key = key;
    const result = await handler(request());
    assert.equal(result.status, 503);
    assert.equal((await result.json()).code, 'DICTIONARY_NOT_CONFIGURED');
  }
  state.key = fixtureKey;
  state.disabled = 'timer, dictionary, draw';
  assert.equal((await handler(request())).status, 403);
  assert.equal(state.authCalls, 0);
  assert.equal(state.fetchCalls, 0);
});

test('cross-site and sibling-origin GET requests are rejected before credentials are used', async () => {
  const {state, handler} = harness();
  for (const headers of [{'sec-fetch-site': 'cross-site'}, {'sec-fetch-site': 'same-site'}, {origin: 'https://other.test'}, {origin: 'null'}] as HeadersInit[]) {
    assert.equal((await handler(new Request(request(), {headers}))).status, 403);
  }
  assert.equal(state.fetchCalls, 0);
  assert.equal(state.authCalls, 0);
  assert.equal((await handler(new Request(request(), {headers: {'sec-fetch-site': 'same-origin', origin: 'https://classroom.test'}}))).status, 200);
});

test('teacher authentication applies on every configured request including cache hits', async () => {
  const {state, handler} = harness();
  await handler(request());
  await handler(request());
  assert.equal(state.fetchCalls, 1);
  assert.equal(state.authCalls, 2);
  for (const status of [401, 403]) {
    let called = false;
    const deny = createDictionaryHandler({configuration: () => ({key: fixtureKey}), now: Date.now, authenticate: async () => {throw new ApiError(status, '접근할 수 없어요.', 'FORBIDDEN');}, fetch: async () => {called = true; return Response.json(fixture());}});
    assert.equal((await deny(request())).status, status);
    assert.equal(called, false);
  }
});

test('fixed provider request uses JSON, exact/include allowlist, 20 results and abort/redirect protections', async () => {
  const handler = createDictionaryHandler({configuration: () => ({key: fixtureKey}), now: Date.now, authenticate: async () => ({uid: 'teacher'}), fetch: async (url, options) => {
    assert.ok(url instanceof URL);
    assert.equal(url.origin + url.pathname, 'https://stdict.korean.go.kr/api/search.do');
    assert.equal(url.searchParams.get('key'), fixtureKey);
    assert.equal(url.searchParams.get('num'), '20');
    assert.equal(url.searchParams.get('q'), '나무');
    assert.equal(url.searchParams.get('req_type'), 'json');
    assert.equal(url.searchParams.get('advanced'), 'y');
    assert.equal(url.searchParams.get('target'), '1');
    assert.equal(url.searchParams.get('method'), 'include');
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.cache, 'no-store');
    assert.ok(options?.signal instanceof AbortSignal);
    return Response.json(fixture());
  }});
  const response = await handler(request('나무', '&match=include'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal((await response.text()).includes(fixtureKey), false);
});

test('timeout configuration is 8 seconds and aborted fetch never leaks credential URLs', async t => {
  let timeout: number | undefined;
  t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {timeout = milliseconds; return AbortSignal.abort();});
  const handler = createDictionaryHandler({configuration: () => ({key: fixtureKey}), now: Date.now, authenticate: async () => ({uid: 'teacher'}), fetch: async (url, options) => {assert.equal(options?.signal?.aborted, true); throw Error(String(url));}});
  const response = await handler(request());
  assert.equal(timeout, 8_000);
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.equal(body.includes(fixtureKey), false);
  assert.equal(body.includes('stdict.korean.go.kr/api'), false);
});

test('malformed, empty, oversized and HTTP error responses are bounded and safely mapped', async () => {
  for (const [makeResponse, status] of [
    [() => new Response(''), 502],
    [() => new Response('<html>gateway failure</html>'), 502],
    [() => new Response(fixtureKey, {status: 500}), 503],
    [() => new Response(fixtureKey, {status: 403}), 503],
    [() => new Response(fixtureKey, {status: 429}), 429],
    [() => new Response('{}', {headers: {'content-length': '1000001'}}), 502],
    [() => new Response('x'.repeat(1_000_001)), 502],
  ] as const) {
    const {state, handler} = harness();
    state.response = makeResponse;
    const response = await handler(request());
    assert.equal(response.status, status);
    assert.equal((await response.text()).includes(fixtureKey), false);
  }
});

test('cache expires, partitions query/match/page and clears when credential changes', async () => {
  const {state, handler} = harness();
  await handler(request());
  await handler(request());
  assert.equal(state.fetchCalls, 1);
  await handler(request('사랑'));
  await handler(request('나무', '&match=include'));
  await handler(request('나무', '&start=21'));
  assert.equal(state.fetchCalls, 4);
  state.now += 5 * 60_000;
  await handler(request());
  assert.equal(state.fetchCalls, 5);
  state.key = '1'.repeat(32);
  await handler(request());
  assert.equal(state.fetchCalls, 6);
});

test('failed requests are never cached and rate limits are isolated by teacher', async () => {
  const {state, handler} = harness();
  state.response = () => new Response('bad data');
  await handler(request());
  await handler(request());
  assert.equal(state.fetchCalls, 2);
  state.response = () => Response.json(fixture());
  for (let index = 0; index < 28; index++) assert.equal((await handler(request())).status, 200);
  const limited = await handler(request());
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  state.uid = 'teacher-b';
  assert.equal((await handler(request())).status, 200);
  state.uid = 'teacher-a';
  state.now += 60_000;
  assert.equal((await handler(request())).status, 200);
});

test('cache capacity is bounded without using a database', async () => {
  const {state, handler} = harness();
  for (let index = 0; index < 121; index++) {state.uid = `teacher-${index}`; assert.equal((await handler(request(`말${index}`))).status, 200);}
  assert.equal(state.fetchCalls, 121);
  state.uid = 'returning-teacher';
  await handler(request('말0'));
  assert.equal(state.fetchCalls, 122);
  await handler(request('말120'));
  assert.equal(state.fetchCalls, 122);
});
