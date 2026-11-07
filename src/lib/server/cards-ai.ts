import 'server-only';
import {createHash} from 'node:crypto';
import {alignWordCards, buildCardAiRequest, parseCardAiOutput, parseCardAiRequest, type CardAiDraft} from '../cards-ai-draft';
import {runMeteredAi} from './ai';
import {AiError, completedAiText, providerFailure, readBoundedJson} from './ai-policy';
import type {Context} from './auth';
import {ApiError} from './policy';

const BODY_BYTES_MAX = 64 * 1024, REPLY_BYTES_MAX = 256 * 1024, PROVIDER_TIMEOUT_MS = 45_000;
const AI_MODEL = () => process.env.OPENAI_MODEL?.trim() || 'gpt-6-luna';

/** Draft only: nothing is stored, and no class or student data goes to the provider. The route's maxDuration must exceed the timeout. */
export async function cardsAiDraft(ctx: Context, request: Request): Promise<{cards: CardAiDraft[]}> {
  if (ctx.role === 'student') throw new ApiError(403, '선생님만 사용할 수 있어요.', 'FORBIDDEN');
  const input = parseCardAiRequest(await readBoundedJson(request, BODY_BYTES_MAX));
  if ('error' in input) throw new AiError(400, input.error, 'INPUT_INVALID');
  const model = AI_MODEL(), fingerprint = createHash('sha256').update(JSON.stringify(['cards-ai-draft-v1', input])).digest('hex');
  const cards = await runMeteredAi(ctx.uid, 'cards-ai-draft', model, fingerprint, async observe => {
    const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {method: 'POST', headers: {Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json'}, body: JSON.stringify(buildCardAiRequest(input, model)), signal, cache: 'no-store'});
      if (!response.ok) {await response.body?.cancel(); throw providerFailure(response.status);}
      const payload = await readBoundedJson(response, REPLY_BYTES_MAX); observe(payload);
      const parsed = parseCardAiOutput(completedAiText(payload));
      if (!parsed) throw new AiError(502, 'AI 초안을 확인할 수 없어요. 다시 시도해 주세요.', 'AI_INVALID_RESPONSE');
      return parsed;
    } catch (error) {
      if (signal.aborted) throw new AiError(504, 'AI 응답이 늦어지고 있어요. 다시 시도해 주세요.', 'AI_TIMEOUT');
      if (error instanceof ApiError) throw error;
      throw new AiError(503, 'AI 서비스에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'AI_UNAVAILABLE');
    }
  });
  return {cards: input.mode === 'words' ? alignWordCards(input.words, cards) : cards};
}
