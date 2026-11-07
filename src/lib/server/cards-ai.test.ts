import assert from 'node:assert/strict';
import test from 'node:test';
import {cardsAiDraft} from './cards-ai';
import type {Context} from './auth';

const scope = globalThis as unknown as {__cardsAiMeter: {calls: {uid: string; tool: string; classId?: string}[]}; fetch: (url: string, init: RequestInit) => Promise<Response>};
const teacher: Context = {uid: 'teacher-1', email: null, displayName: null, role: 'teacher'};
const post = (body: unknown) => new Request('http://local.test/api/cards/ai-draft', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
const completed = (cards: unknown) => new Response(JSON.stringify({status: 'completed', usage: {input_tokens: 1, output_tokens: 1}, output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify(cards)}]}]}));
const provider = (reply: () => Response | Promise<Response>) => {const sent: RequestInit[] = []; scope.fetch = async (_url, init) => {sent.push(init); return reply();}; return sent;};
const words = {mode: 'words', level: 'elementary', words: ['apple', 'kiwi']};

test('a teacher gets a validated draft through the metered path', async () => {
  scope.__cardsAiMeter.calls.length = 0;
  const sent = provider(() => completed({cards: [{front: 'Apple', back: '사과', example: 'I like apples.'}, {front: 'extra', back: 'x', example: ''}]}));
  assert.deepEqual(await cardsAiDraft(teacher, post(words)), {cards: [{front: 'apple', back: '사과', example: 'I like apples.'}, {front: 'kiwi', back: '', example: ''}]});
  assert.deepEqual(scope.__cardsAiMeter.calls, [{uid: 'teacher-1', tool: 'cards-ai-draft', classId: undefined}]);
  assert.deepEqual(JSON.parse(JSON.parse(String(sent[0].body)).input[0].content[0].text), {words: ['apple', 'kiwi']});
});
test('students and malformed input never reach the provider', async () => {
  const sent = provider(() => completed({cards: []}));
  await assert.rejects(cardsAiDraft({...teacher, role: 'student'}, post(words)), {status: 403, code: 'FORBIDDEN'});
  await assert.rejects(cardsAiDraft(teacher, post({mode: 'words', level: 'elementary', words: Array(61).fill('a')})), {status: 400, code: 'INPUT_INVALID'});
  await assert.rejects(cardsAiDraft(teacher, post({mode: 'text', level: 'elementary', text: 'a', classId: 'c'})), {status: 400});
  await assert.rejects(cardsAiDraft(teacher, post({mode: 'text', level: 'elementary', text: '가'.repeat(30000)})), {status: 413, code: 'BODY_TOO_LARGE'});
  assert.equal(sent.length, 0);
});
test('a text draft may be empty, but a broken reply is refused', async () => {
  provider(() => completed({cards: []}));
  assert.deepEqual(await cardsAiDraft(teacher, post({mode: 'text', level: 'middle', text: 'page 12'})), {cards: []});
  provider(() => completed({cards: [{front: 'a'}]}));
  await assert.rejects(cardsAiDraft(teacher, post(words)), {status: 502, code: 'AI_INVALID_RESPONSE'});
  provider(() => new Response(JSON.stringify({status: 'incomplete', output: []})));
  await assert.rejects(cardsAiDraft(teacher, post(words)), {status: 502, code: 'AI_INCOMPLETE'});
});
test('provider failures and timeouts become friendly errors', async () => {
  provider(() => new Response('', {status: 429}));
  await assert.rejects(cardsAiDraft(teacher, post(words)), {status: 503, code: 'AI_UNAVAILABLE'});
  provider(() => new Response('', {status: 401}));
  await assert.rejects(cardsAiDraft(teacher, post(words)), {status: 503, code: 'AI_NOT_CONFIGURED'});
  provider(() => Promise.reject(new TypeError('network')));
  await assert.rejects(cardsAiDraft(teacher, post(words)), {status: 503, code: 'AI_UNAVAILABLE'});
  const original = AbortSignal.timeout;
  AbortSignal.timeout = () => AbortSignal.abort();
  try {
    provider(() => Promise.reject(new DOMException('late', 'TimeoutError')));
    await assert.rejects(cardsAiDraft(teacher, post(words)), {status: 504, code: 'AI_TIMEOUT'});
  } finally {AbortSignal.timeout = original;}
});
