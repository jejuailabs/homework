import assert from 'node:assert/strict';
import test from 'node:test';
import {ApiError} from './policy';
import {combineDictionaryResults, createDictionaryHandler, createDictionaryHandlers, parseBasicSearchResponse, parseBasicView, parseDictionaryExplainQuery, parseDictionaryQuery, parseDictionarySearchResponse, parseOpenSearchResponse, parseOpenView, parseStandardView, type DictionaryCallRecord} from './korean-dictionary';
import {dictionaryNarration, parseDictionaryAi} from '../korean-dictionary';

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
  assert.deepEqual(result, {query: '나무', total: 1, start: 1, num: 20, entries: [{id: '404765', word: '나무', originalWord: '', partOfSpeech: '명사', definition: '줄기나 가지가 목질로 된 여러해살이 식물.', link: 'https://stdict.korean.go.kr/search/searchView.do?word_no=404765&searchKeywordTo=3', source: 'standard', grade: ''}], source: 'standard'});
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
  assert.deepEqual(parseDictionarySearchResponse({}, input).entries, [], 'the provider sends {} for a word it does not have');
  for (const raw of [null, {channel: {}}, {channel: {total: -1}}, {channel: {total: 1}}, {channel: {total: 1, item: [null]}}, {channel: {total: 1, item: [{target_code: '../secret', word: '나무', sense: {definition: '뜻'}}]}}]) {
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

const basicSearch = (total = 1) => `<?xml version="1.0"?><channel><total>${total}</total><start>1</start><num>20</num>${total ? '<item><target_code>20911</target_code><word>마음</word><sup_no>0</sup_no><origin></origin><pronunciation>마음</pronunciation><word_grade>초급</word_grade><pos>명사</pos><link>https://untrusted.test/</link><sense><sense_order>1</sense_order><definition>기분이나 &lt;느낌&gt;.</definition></sense><sense><sense_order>2</sense_order><definition><![CDATA[좋아하는 마음.]]></definition></sense></item>' : ''}</channel>`;
const basicView = '<channel><total>1</total><item><target_code>20911</target_code><word_info><word>마음</word><pos>명사</pos><pronunciation_info><pronunciation>마음</pronunciation></pronunciation_info><word_grade>초급</word_grade><sense_info><definition>기분이나 느낌.</definition><example_info><type>구</type><example>마음이 좋다.</example></example_info><example_info><type>문장</type><example>오늘은 마음이 편해요. </example></example_info></sense_info></word_info></item></channel>';
const standardView = (type = '일반어') => ({channel: {total: 1, item: {target_code: '422607', word_info: {word: '마-음', pronunciation_info: [{pronunciation: '마음'}], relation_info: [{word: '마음^먹다', type: '관용구'}, {word: '가슴', type: '비슷한말'}], pos_info: [{pos: '명사', comm_pattern_info: [{sense_info: [{definition: '품성.', type: '일반어', example_info: [{example: '{마음}이 곱다.'}]}, {definition: '재갈의 방언', type}]}]}]}}}});
const basicRequest = (extra = '') => new Request('https://classroom.test/api/tools/dictionary?q=' + encodeURIComponent('마음') + extra);
const explainRequest = (id: string, level: string) => new Request(`https://classroom.test/api/tools/dictionary/explain?id=${id}&level=${level}`);
function basicHarness(over: {simplify?: () => Promise<{definition: string; example: string}[] | null>; route?: (url: URL) => Response} = {}) {
  const urls: URL[] = [], records: DictionaryCallRecord[] = [];
  const route = over.route ?? ((url: URL) => url.hostname.startsWith('krdict') ? new Response(url.pathname.endsWith('view') ? basicView : basicSearch()) : url.pathname.endsWith('view.do') ? Response.json(standardView('방언')) : Response.json({channel: {total: 2, item: [{target_code: 422607, word: '마음', pos: '명사', sense: {definition: '품성.'}}, {target_code: 9, word: '마음', pos: '동사', sense: {definition: '다른 품사.'}}]}}));
  const handlers = createDictionaryHandlers({configuration: () => ({key: fixtureKey, basicKey: '1'.repeat(32)}), now: Date.now, authenticate: async () => ({uid: 'teacher'}), fetch: async url => {urls.push(url as URL); return route(url as URL);}, record: event => records.push(event), simplify: over.simplify});
  return {...handlers, urls, records};
}

test('the Basic Dictionary is parsed with its learner level and never trusts provider links', () => {
  const result = parseBasicSearchResponse(basicSearch(), input);
  assert.equal(result.source, 'basic');
  assert.deepEqual(result.entries[0], {id: 'k20911', word: '마음', originalWord: '', partOfSpeech: '명사', definition: '기분이나 <느낌>.\n좋아하는 마음.', link: 'https://krdict.korean.go.kr/kor/dicSearch/SearchView?ParaWordNo=20911', source: 'basic', grade: '초급'});
  assert.throws(() => parseBasicSearchResponse('<html>blocked</html>', input), {code: 'DICTIONARY_INVALID_RESPONSE'});
  assert.throws(() => parseBasicSearchResponse('<error><error_code>020</error_code></error>', input), {code: 'DICTIONARY_NOT_CONFIGURED'});
  assert.equal(parseBasicSearchResponse(basicSearch().replace('초급', '없음'), input).entries[0].grade, '');
});

test('details prefer a full sentence example and drop regional senses', () => {
  assert.deepEqual(parseBasicView(basicView).senses, [{definition: '기분이나 느낌.', example: '오늘은 마음이 편해요.'}]);
  const standard = parseStandardView(standardView('방언'));
  assert.equal(standard.word, '마음');
  assert.deepEqual(standard.senses, [{definition: '품성.', example: '마음이 곱다.'}]);
  assert.deepEqual(standard.idioms, ['마음 먹다']);
  assert.equal(parseStandardView(standardView()).senses.length, 2);
});

test('search asks the Basic Dictionary first, filters by level, and falls back when a word is missing', async () => {
  const first = basicHarness();
  const body = await (await first.search(basicRequest('&match=include&grade=' + encodeURIComponent('초급')))).json();
  assert.equal(body.source, 'basic');
  assert.equal(first.urls[0].searchParams.get('level'), 'level1');
  assert.equal(first.urls[0].searchParams.get('method'), 'include');
  assert.equal(first.urls.length, 1);
  assert.deepEqual(first.records.map(row => [row.tool, row.model, row.cached, row.ok]), [['dictionary-search', 'krdict-search', false, true]]);
  await first.search(basicRequest('&match=include&grade=' + encodeURIComponent('초급')));
  assert.deepEqual(first.records[1].cached, true, 'a repeat is recorded as reuse');
  const missing = basicHarness({route: url => url.hostname.startsWith('krdict') ? new Response(basicSearch(0)) : Response.json(fixture())});
  assert.equal((await (await missing.search(basicRequest())).json()).source, 'standard');
  const broken = basicHarness({route: url => url.hostname.startsWith('krdict') ? new Response('blocked', {status: 400}) : Response.json(fixture())});
  assert.equal((await (await broken.search(basicRequest())).json()).source, 'standard', 'an outage still answers a plain search');
  assert.equal((await broken.search(basicRequest('&grade=' + encodeURIComponent('고급')))).status, 503, 'a level filter cannot fall back');
  assert.equal((await missing.search(basicRequest('&grade=wrong'))).status, 400);
});

test('explanations: normal is the Basic text, easy is AI with a safe fallback, deep is the same part of speech', async () => {
  const normal = await (await basicHarness().explain(explainRequest('k20911', 'normal'))).json();
  assert.deepEqual([normal.source, normal.fallback, normal.senses[0].definition], ['basic', false, '기분이나 느낌.']);
  const ai = await (await basicHarness({simplify: async () => [{definition: '쉬운 뜻', example: '쉬운 예문'}]}).explain(explainRequest('k20911', 'easy'))).json();
  assert.deepEqual([ai.source, ai.senses[0].definition], ['ai', '쉬운 뜻']);
  const down = await (await basicHarness({simplify: async () => null}).explain(explainRequest('k20911', 'easy'))).json();
  assert.deepEqual([down.source, down.fallback, down.senses[0].definition], ['basic', true, '기분이나 느낌.']);
  const deepRun = basicHarness();
  const deep = await (await deepRun.explain(explainRequest('k20911', 'deep'))).json();
  assert.deepEqual([deep.source, deep.senses[0].definition, deep.idioms[0]], ['standard', '품성.', '마음 먹다']);
  assert.equal(deepRun.urls.filter(url => url.pathname.endsWith('view.do')).length, 1, 'only the same part of speech is opened');
  assert.deepEqual(parseDictionaryExplainQuery(new URL('https://x.test/?id=422607&level=deep')), {id: '422607', level: 'deep'});
  for (const search of ['?id=../key&level=easy', '?id=k1&level=hard']) assert.throws(() => parseDictionaryExplainQuery(new URL('https://x.test/' + search)), {code: 'DICTIONARY_INPUT'});
});

test('narration keeps each piece under the audio limit and AI answers must be complete', () => {
  const senses = Array.from({length: 7}, (_, index) => ({definition: '뜻'.repeat(index === 0 ? 2000 : 3), example: index === 1 ? '예문.' : ''}));
  const pieces = dictionaryNarration({word: '마음', senses});
  assert.equal(pieces.length, 5);
  assert.ok(pieces.every(piece => piece.length <= 1000));
  assert.ok(pieces[0].startsWith('마음. 첫째 뜻.'));
  assert.ok(pieces[1].includes('예를 들면, 예문.'));
  assert.deepEqual(dictionaryNarration({word: '마음', senses: [{definition: '뜻.', example: ''}]}), ['마음. 뜻.']);
  assert.deepEqual(parseDictionaryAi('{"senses":[{"definition":" 뜻 ","example":"예"}]}', 1), [{definition: '뜻', example: '예'}]);
  for (const bad of ['not json', '{"senses":[]}', '{"senses":[{"definition":"","example":""}]}']) assert.equal(parseDictionaryAi(bad, 1), null);
});

test('the exact word leads page one even when the containing list would not reach it, and never repeats', async () => {
  const item = (code: number, word: string) => `<item><target_code>${code}</target_code><word>${word}</word><pos>명사</pos><word_grade>초급</word_grade><sense><definition>뜻.</definition></sense></item>`;
  const containing = `<channel><total>30</total>${item(1, '고등학교')}${item(2, '초등학교')}</channel>`, exact = `<channel><total>1</total>${item(9, '학교')}</channel>`;
  const run = basicHarness({route: url => new Response(url.searchParams.get('method') === 'exact' ? exact : containing)});
  const school = (start: number) => new Request('https://classroom.test/api/tools/dictionary?match=both&q=' + encodeURIComponent('학교') + '&start=' + start);
  const first = await (await run.search(school(1))).json();
  assert.deepEqual(first.entries.map((entry: {word: string}) => entry.word), ['학교', '고등학교', '초등학교']);
  assert.equal(first.total, 30);
  const before = run.urls.length;
  const next = await (await run.search(school(21))).json();
  assert.deepEqual(next.entries.map((entry: {word: string}) => entry.word), ['고등학교', '초등학교']);
  assert.equal(run.urls.length, before + 1, 'later pages do not ask for the exact word again');
  assert.equal(run.urls.at(-1)?.searchParams.get('start'), '2', 'providers count pages, not entries');
  const entry = (id: string, word: string) => ({id, word, originalWord: '', partOfSpeech: '', definition: '뜻', link: '', source: 'basic' as const, grade: '' as const});
  const merged = combineDictionaryResults('학교', [entry('k9', '학교')], {query: '학교', total: 2, start: 1, num: 20, source: 'basic', entries: [entry('k9', '학교'), entry('k1', '고등학교')]});
  assert.deepEqual(merged.entries.map(row => row.id), ['k9', 'k1']);
  const onlyStandard = basicHarness({route: url => url.hostname.startsWith('krdict') ? new Response(url.searchParams.get('method') === 'exact' ? '<channel><total>0</total></channel>' : containing) : Response.json({channel: {total: 1, item: [{target_code: 7, word: '학교', pos: '명사', sense: {definition: '표준 뜻.'}}]}})});
  const mixed = await (await onlyStandard.search(school(1))).json();
  assert.deepEqual([mixed.entries[0].word, mixed.entries[0].source, mixed.total], ['학교', 'standard', 31]);
});

const openSearch = {channel: {total: 2, item: [
  {word: '애월', sense: [{target_code: '1409789', pos: '명사', cat: '지명', type: '일반어', definition: '제주특별자치도 제주시에 있는 읍.'}]},
  {word: '애월', sense: {target_code: '1682808', pos: '명사', cat: '영상', type: '일반어', definition: '박철우 감독이 만든 영화.'}},
  {word: '애월', sense: {target_code: '77', pos: '명사', type: '방언', definition: '어느 말의 방언.'}},
  {word: '애월-읍', sense: {target_code: '88', pos: '명사', type: '일반어', definition: '다른 낱말.'}},
]}};
const openView = {channel: {total: '1', item: {target_code: 1409789, wordInfo: {}, senseInfo: {definition: '제주시에 있는 읍.', pos: '명사', type: '일반어', example_info: [{example: '뉴스 문장.'}]}}}};

test('Urimalsaem keeps real meanings of the exact word, not films or dialect', () => {
  assert.deepEqual(parseOpenSearchResponse(openSearch, '애월').map(entry => [entry.id, entry.source, entry.grade, entry.link]), [['o1409789', 'open', '', 'https://opendict.korean.go.kr/dictionary/view?sense_no=1409789']]);
  assert.deepEqual(parseOpenSearchResponse({channel: {total: 1, item: [{word: '제주-시', sense: {target_code: 5, pos: '명사', type: '일반어', definition: '시.'}}]}}, '제주시').map(entry => entry.word), ['제주시']);
  assert.deepEqual(parseOpenView(openView, '애월').senses, [{definition: '제주시에 있는 읍.', example: ''}]);
});

test('Urimalsaem is asked only when neither main dictionary has the word', async () => {
  const none = (url: URL) => url.hostname.startsWith('krdict') ? new Response('<channel><total>0</total></channel>') : url.hostname.startsWith('stdict') ? Response.json({channel: {total: 0}}) : url.pathname.endsWith('view') ? Response.json(openView) : Response.json(openSearch);
  const both = (word: string, extra = '') => new Request('https://classroom.test/api/tools/dictionary?match=both&q=' + encodeURIComponent(word) + extra);
  const run = basicHarness({route: none, simplify: async () => [{definition: '제주에 있는 마을이에요.', example: '애월에 놀러 갔어요.'}]});
  const found = await (await run.search(both('애월'))).json();
  assert.deepEqual([found.entries[0].id, found.total], ['o1409789', 1]);
  assert.ok(run.records.some(row => row.model === 'opendict-search'));
  const levelled = basicHarness({route: none});
  assert.deepEqual((await (await levelled.search(both('애월', '&grade=' + encodeURIComponent('초급')))).json()).entries, [], 'a level filter stays within the Basic Dictionary');
  assert.equal(levelled.urls.some(url => url.hostname.startsWith('opendict')), false);
  const has = basicHarness({route: url => new Response(url.searchParams.get('method') === 'exact' ? basicSearch() : basicSearch())});
  await has.search(both('마음'));
  assert.equal(has.urls.some(url => url.hostname.startsWith('opendict')), false);
  const easy = await (await run.explain(new Request('https://classroom.test/api/tools/dictionary/explain?id=o1409789&level=easy&word=' + encodeURIComponent('애월')))).json();
  assert.deepEqual([easy.source, easy.word, easy.senses[0].definition], ['ai', '애월', '제주에 있는 마을이에요.']);
  const deep = await (await run.explain(new Request('https://classroom.test/api/tools/dictionary/explain?id=o1409789&level=deep&word=' + encodeURIComponent('애월')))).json();
  assert.deepEqual([deep.source, deep.senses[0].example], ['open', '']);
  for (const search of ['?id=o1&level=easy', '?id=o1&level=easy&word=ignore%20rules']) assert.throws(() => parseDictionaryExplainQuery(new URL('https://x.test/' + search)), {code: 'DICTIONARY_INPUT'});
});
