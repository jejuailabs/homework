import assert from 'node:assert/strict';
import test from 'node:test';
import {berryDoneUsage, meterBerryStream, type BerryTurnResult} from './usage-meter';

const encode = (text: string) => new TextEncoder().encode(text);
async function run(chunks: string[]) {
  let result: BerryTurnResult | null = null;
  const source = new ReadableStream<Uint8Array>({start(controller) {for (const chunk of chunks) controller.enqueue(encode(chunk)); controller.close();}});
  const out = await new Response(meterBerryStream(source, value => {result = value;})).text();
  return {out, result: result as BerryTurnResult | null};
}

test('Berry stream passes through unchanged and reads only the closing done counts', async () => {
  const chunks = ['event: conversation\ndata: {"conversation_id":"x"}\n\nevent: message\ndata: {"text":"PRIVATE ANSWER"}\n\nevent: do', 'ne\ndata: {"tool_calls":3,"approvals":[],"usage":{"input_tokens":1200,"cached_input_tokens":200,"output_tokens":90,"service_tier":"default","model":"gpt-6-luna"}}\n\n'];
  const {out, result} = await run(chunks);
  assert.equal(out, chunks.join(''));
  assert.equal(result?.ok, true); assert.equal(result?.toolCalls, 3); assert.equal(result?.model, 'gpt-6-luna');
  assert.deepEqual(result?.providerUsage, {usage: {input_tokens: 1200, output_tokens: 90, input_tokens_details: {cached_tokens: 200}}, service_tier: 'default'});
  assert(!JSON.stringify(result).includes('PRIVATE'));
});
test('an older brain without usage still records the turn, with tokens unknown', async () => {
  const {result} = await run(['event: done\ndata: {"tool_calls":1,"approvals":[]}\n\n']);
  assert.equal(result?.ok, true); assert.deepEqual(result?.providerUsage, {}); assert.equal(result?.toolCalls, 1);
});
test('an error event or a stream without done is a failed turn', async () => {
  assert.equal((await run(['event: error\ndata: {"message":"x"}\n\n'])).result?.ok, false);
  assert.equal((await run(['event: message\ndata: {"text":"x"}\n\n'])).result?.ok, false);
});
test('bad usage numbers are dropped, not trusted', () => {
  assert.deepEqual(berryDoneUsage({usage: {input_tokens: -5, output_tokens: 3}}).providerUsage, {});
  assert.equal(berryDoneUsage(null).toolCalls, 0);
});
