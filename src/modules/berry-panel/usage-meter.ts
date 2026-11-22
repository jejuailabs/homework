/**
 * Watches a Berry answer stream (server-sent events) as it passes through to the teacher, without changing a byte.
 * Only the brain's closing `done` event is read: tool-call count and, once the brain sends it, token usage.
 * Message text is never kept.
 */
export type BerryTurnResult = {ok: boolean; model: string; providerUsage: unknown; toolCalls: number};
export const BERRY_DEFAULT_MODEL = 'gpt-6-luna';

const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** The brain's `done` payload → the shape aiProviderUsage reads (OpenAI Responses `usage` + `service_tier`). */
export function berryDoneUsage(data: unknown): Omit<BerryTurnResult, 'ok'> {
  const done = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const usage = done.usage && typeof done.usage === 'object' ? done.usage as Record<string, unknown> : null;
  const model = typeof usage?.model === 'string' && usage.model ? usage.model.slice(0, 60) : BERRY_DEFAULT_MODEL;
  const input = count(usage?.input_tokens), output = count(usage?.output_tokens), cached = count(usage?.cached_input_tokens);
  const providerUsage = usage && input !== null && output !== null
    ? {usage: {input_tokens: input, output_tokens: output, ...(cached !== null ? {input_tokens_details: {cached_tokens: cached}} : {})}, ...(typeof usage.service_tier === 'string' ? {service_tier: usage.service_tier} : {})}
    : {};
  return {model, providerUsage, toolCalls: count(done.tool_calls) ?? 0};
}

export function meterBerryStream(body: ReadableStream<Uint8Array>, onEnd: (result: BerryTurnResult) => void): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let buffer = '', done: Omit<BerryTurnResult, 'ok'> | null = null, failed = false, reported = false;
  const report = (finished: boolean) => {
    if (reported) return;
    reported = true;
    try {onEnd({ok: finished && !!done && !failed, ...(done ?? {model: BERRY_DEFAULT_MODEL, providerUsage: {}, toolCalls: 0})});} catch {}
  };
  const read = (block: string) => {
    let event = 'message', data = '';
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (event === 'error') failed = true;
    if (event === 'done') {try {done = berryDoneUsage(JSON.parse(data || '{}'));} catch {done = berryDoneUsage({});}}
  };
  const scan = (final: boolean) => {
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = final ? '' : blocks.pop() ?? '';
    for (const block of blocks) if (block.trim()) read(block);
    // Only the small closing events matter; a runaway block is dropped rather than held in memory.
    if (buffer.length > 64_000) buffer = '';
  };
  // A pull stream (not a TransformStream) so a teacher closing the panel mid-answer reaches `cancel` on every runtime.
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const {done: end, value} = await reader.read();
        if (end) {buffer += decoder.decode(); scan(true); report(true); controller.close(); return;}
        controller.enqueue(value);
        buffer += decoder.decode(value, {stream: true});
        scan(false);
      } catch (error) {report(false); controller.error(error);}
    },
    async cancel(reason) {report(false); await reader.cancel(reason).catch(() => {});},
  });
}
