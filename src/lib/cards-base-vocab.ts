// 기본 어휘: the national English curriculum basic vocabulary (2022 개정 영어과 교육과정 [별표 3], 3,000 words, 800 marked for
// elementary school). The list lives in src/data/cards-base-vocab.json and reaches screens only through GET /api/cards/base-vocab,
// so it never sits in the client bundle. Korean meanings are an AI draft for teachers to check; the words and levels are official.
// Pure rules shared by the server, the screens and Berry.
export type BaseVocabLevel = '초등' | '중고';
/** tier 1 = *표 초등 권장 800, tier 2 = **표 중·고 공통과목 권장 1,200, tier 3 = 나머지 1,000. */
export type BaseVocabWord = {word: string; meaning: string; level: BaseVocabLevel; tier: 1 | 2 | 3; pos?: string; variants?: string[]};
export type BaseVocabSource = {title: string; notice: string; version: string; retrievedFrom: string; url: string; counts: {total: number; elementary: number; secondaryCommon: number; other: number}; tiers: Record<string, string>};
export type BaseVocabData = {source: BaseVocabSource; meaningNote: string; words: BaseVocabWord[]};
export type BaseVocabScope = 'elementary' | 'secondary' | 'all';
export type BaseVocabFilter = {scope: BaseVocabScope; from?: string; to?: string; query?: string};

export const BASE_VOCAB_SCOPES: BaseVocabScope[] = ['elementary', 'secondary', 'all'];
export const BASE_VOCAB_CHUNKS = [20, 30, 50] as const;
/** One press makes at most this many sets: 초등 800 in sets of 20 fits; a wider range asks the teacher to narrow it. */
export const BASE_VOCAB_SET_MAX = 40;
export const BASE_VOCAB_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
export const BASE_VOCAB_QUERY_LENGTH = 40;

const letter = (value: unknown, fallback: string) => typeof value === 'string' && /^[a-z]$/i.test(value) ? value.toLowerCase() : fallback;
export const baseVocabScope = (value: unknown): BaseVocabScope => BASE_VOCAB_SCOPES.includes(value as BaseVocabScope) ? value as BaseVocabScope : 'elementary';

/** Words in the official (alphabetical) order that match the range, the letters (inclusive, swapped if reversed) and the search. */
export function filterBaseVocab(words: BaseVocabWord[], filter: BaseVocabFilter): BaseVocabWord[] {
  let from = letter(filter.from, 'a'), to = letter(filter.to, 'z');
  if (from > to) [from, to] = [to, from];
  const query = typeof filter.query === 'string' ? filter.query.trim().toLowerCase().slice(0, BASE_VOCAB_QUERY_LENGTH) : '';
  return words.filter(entry => {
    if (filter.scope === 'elementary' ? entry.tier !== 1 : filter.scope === 'secondary' ? entry.level !== '중고' : false) return false;
    const first = entry.word[0]?.toLowerCase() ?? '';
    if (first < from || first > to) return false;
    if (!query) return true;
    return [entry.word, ...(entry.variants ?? [])].some(form => form.toLowerCase().includes(query)) || entry.meaning.includes(query);
  });
}
/** Splits into sets of `size` words; a short last set keeps what is left. */
export function chunkBaseVocab<T>(words: T[], size: number): T[][] {
  const step = BASE_VOCAB_CHUNKS.includes(size as typeof BASE_VOCAB_CHUNKS[number]) ? size : BASE_VOCAB_CHUNKS[0];
  const chunks: T[][] = [];
  for (let index = 0; index < words.length; index += step) chunks.push(words.slice(index, index + step));
  return chunks;
}
/** "기본 어휘 초등 03 · bake–bird": numbered within this run, padded so the library sorts them in order. */
export function baseVocabSetTitle(prefix: string, index: number, total: number, chunk: BaseVocabWord[]) {
  const number = String(index + 1).padStart(Math.max(2, String(total).length), '0');
  return `${prefix} ${number} · ${chunk[0]?.word ?? ''}–${chunk.at(-1)?.word ?? ''}`.slice(0, 120);
}
/** Plain word cards: front the word, back the meaning. Spelling variants are not alternatives (those are other answers for the back). */
export const baseVocabCards = (chunk: BaseVocabWord[]) => chunk.map(entry => ({front: entry.word, back: entry.meaning, example: '', alternatives: [] as string[]}));
/** A short line for Berry and lists. */
export const baseVocabLabel = (entry: BaseVocabWord) => `${entry.word}${entry.variants?.length ? ` / ${entry.variants.join(' / ')}` : ''}`;
