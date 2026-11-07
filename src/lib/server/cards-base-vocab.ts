import 'server-only';
import { NextResponse } from 'next/server';
import vocab from '@/data/cards-base-vocab.json';
import type { Context } from './auth';
import { ApiError } from './policy';
import { baseVocabLabel, baseVocabScope, filterBaseVocab, type BaseVocabData } from '../cards-base-vocab';

/**
 * 기본 어휘 (CARDS_SPEC §37). The static list is loaded only by this module, which cards.ts and Berry import on demand,
 * so the 3,000 words never join the client bundle or the other card routes. Sets made from it are ordinary owned sets
 * created through POST /api/cards/sets; nothing here writes.
 */
export const baseVocab = vocab as BaseVocabData;

/** GET /api/cards/base-vocab: the whole list for the teacher screen to filter locally (about 260KB, compressed in transit). */
export function baseVocabRoute(ctx: Context) {
  if (ctx.role === 'student') throw new ApiError(403, '선생님만 사용할 수 있어요.', 'FORBIDDEN');
  return NextResponse.json(baseVocab, { headers: { 'Cache-Control': 'private, max-age=3600' } });
}

/** Berry find_base_vocab: the same filter as the screen, at most 60 words, plus how many matched. Holds no classroom data. */
export function findBaseVocab(args: Record<string, unknown>) {
  const level = baseVocabScope(args.level ?? 'all'), limit = Math.min(60, Math.max(1, Number.isInteger(args.limit) ? Number(args.limit) : 30));
  const matched = filterBaseVocab(baseVocab.words, { scope: level, from: args.from as string | undefined, to: args.to as string | undefined, query: args.query as string | undefined });
  return {
    source: `${baseVocab.source.title} (${baseVocab.source.notice})`,
    meaning_note: baseVocab.meaningNote,
    level, total: matched.length,
    words: matched.slice(0, limit).map(entry => ({ word: baseVocabLabel(entry), meaning: entry.meaning, level: entry.level, elementary_800: entry.tier === 1, pos: entry.pos })),
    truncated: matched.length > limit,
    make_sets: '세트는 선생님이 카드놀이 > [기본 어휘]에서 범위·알파벳·세트당 단어 수를 골라 만듭니다.',
  };
}
