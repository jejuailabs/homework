// 복습 게임 규칙. 화면과 서버가 같은 함수로 판을 만들고 점수를 계산해서, 서버는 학생이 보낸 숫자가 가능한 범위인지만 본다.
// 게임 점수는 학습량·정답률·테스트와 따로 기록한다(CARDS_SPEC §1). 숙련도에도 넣지 않는다.
import {normalizeCardAnswer, shuffleWith} from './cards-logic';
import type {CardEntry, CardSetType} from './cards-types';

export const CARD_GAMES = ['pair', 'rain', 'puzzle'] as const;
export type CardGame = typeof CARD_GAMES[number];
export const isCardGame = (value: unknown): value is CardGame => CARD_GAMES.includes(value as CardGame);
/** Pairs is a race against the clock; the other two count points. */
export const lowerIsBetter = (game: CardGame) => game === 'pair';
export const GAME_MAX_MS = 20 * 60_000;
export const GAME_RANK_LIMIT = 10;
export const GAME_RATE = {windowMs: 60_000, max: 6};
type Random = (max: number) => number;
const filled = (value: string) => normalizeCardAnswer(value).length > 0;
const int = (value: unknown, min: number, max: number) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

// 짝 맞추기: 단어 타일과 뜻 타일을 짝지어 모두 지우는 시간. 틀리면 시간이 조금 더해질 뿐 점수를 깎지 않는다.
export const PAIR_MAX = 6, PAIR_MIN = 3, PAIR_PENALTY_MS = 2000, PAIR_MIN_MS = 500;
export type PairTile = {key: string; cardId: string; side: 'front' | 'back'; text: string};
/** Cards that can be told apart on a tile: no repeated word, no repeated meaning, and the two sides differ. */
export function pairEligible(cards: CardEntry[]) {
  const fronts = new Set<string>(), backs = new Set<string>();
  return cards.filter(card => {
    const front = normalizeCardAnswer(card.front), back = normalizeCardAnswer(card.back);
    if (!front || !back || front === back || fronts.has(front) || backs.has(back) || fronts.has(back) || backs.has(front)) return false;
    fronts.add(front); backs.add(back); return true;
  });
}
export const pairCount = (cards: CardEntry[]) => Math.min(PAIR_MAX, pairEligible(cards).length);
export function buildPairTiles(cards: CardEntry[], random: Random): PairTile[] | null {
  const chosen = shuffleWith(pairEligible(cards), random).slice(0, PAIR_MAX);
  if (chosen.length < PAIR_MIN) return null;
  return shuffleWith(chosen.flatMap(card => [{key: `${card.id}:f`, cardId: card.id, side: 'front' as const, text: card.front}, {key: `${card.id}:b`, cardId: card.id, side: 'back' as const, text: card.back}]), random);
}
export const isPair = (a: PairTile, b: PairTile) => a.cardId === b.cardId && a.side !== b.side;
export const pairTime = (elapsedMs: number, mistakes: number) => elapsedMs + mistakes * PAIR_PENALTY_MS;

// 단어 비: 떨어지는 카드의 답을 입력한다. 맞힌 수가 늘면 조금씩 빨라지고, 바닥에 닿으면 목숨이 준다.
export const RAIN_LIVES = 3, RAIN_LANES = 3, RAIN_MAX_DROPS = 4, RAIN_LEVEL_EVERY = 5, RAIN_MAX_LEVEL = 8, RAIN_MIN_INTERVAL = 1400, RAIN_MAX_WORDS = 500, RAIN_MIN_MS = 600;
export const rainLevel = (correct: number) => Math.min(RAIN_MAX_LEVEL, 1 + Math.floor(correct / RAIN_LEVEL_EVERY));
export const rainFallMs = (level: number) => Math.max(4400, 10_000 - (level - 1) * 800);
export const rainSpawnMs = (level: number) => Math.max(RAIN_MIN_INTERVAL, 3000 - (level - 1) * 220);
/** Each word is worth ten times the level it was caught at, so the score follows from the count alone. */
export function rainScore(correct: number) {
  let total = 0;
  for (let index = 0; index < correct; index++) total += 10 * rainLevel(index);
  return total;
}
export type RainDrop = {id: number; cardId: string; lane: number; born: number; life: number};
export type RainState = {time: number; nextSpawn: number; serial: number; correct: number; missed: number; lives: number; drops: RainDrop[]; deck: string[]; missedCards: string[]; over: boolean};
export const rainPlayable = (cards: CardEntry[]) => cards.filter(card => filled(card.front) && filled(card.back));
export const newRain = (cardIds: string[], random: Random): RainState => ({time: 0, nextSpawn: 0, serial: 0, correct: 0, missed: 0, lives: RAIN_LIVES, drops: [], deck: shuffleWith(cardIds, random), missedCards: [], over: false});
/** Moves the game on by `dt` milliseconds of play: spent words cost a life, new ones fall into a free lane. */
export function rainStep(state: RainState, dt: number, allIds: string[], random: Random): RainState {
  if (state.over) return state;
  const time = state.time + Math.max(0, dt), expired = state.drops.filter(drop => time - drop.born >= drop.life);
  let {nextSpawn, serial, deck} = state, drops = state.drops.filter(drop => time - drop.born < drop.life);
  const lives = Math.max(0, state.lives - expired.length), missed = state.missed + expired.length;
  const over = lives === 0;
  while (!over && time >= nextSpawn) {
    const level = rainLevel(state.correct), showing = new Set(drops.map(drop => drop.cardId));
    if (drops.length >= RAIN_MAX_DROPS) {nextSpawn = time + 300; break;}
    if (!deck.length) deck = shuffleWith(allIds, random);
    const index = deck.findIndex(cardId => !showing.has(cardId));
    if (index < 0) {nextSpawn = time + 300; break;}
    // Lanes still holding a young drop are skipped so two cards never sit on top of each other.
    const busy = new Set(drops.filter(drop => time - drop.born < drop.life * .4).map(drop => drop.lane)), free = Array.from({length: RAIN_LANES}, (_, lane) => lane).filter(lane => !busy.has(lane));
    if (!free.length) {nextSpawn = time + 300; break;}
    drops = [...drops, {id: ++serial, cardId: deck[index], lane: free[random(free.length)], born: nextSpawn, life: rainFallMs(level)}];
    deck = deck.filter((_, position) => position !== index);
    nextSpawn += rainSpawnMs(level);
  }
  return {...state, time, nextSpawn, serial, deck, drops, lives, missed, missedCards: [...state.missedCards, ...expired.map(drop => drop.cardId)], over};
}
/** The lowest matching drop is caught. Returns null when nothing on screen takes this answer. */
export function rainCatch(state: RainState, matches: (cardId: string) => boolean): RainState | null {
  const hit = [...state.drops].sort((a, b) => a.born - b.born).find(drop => matches(drop.cardId));
  return hit && !state.over ? {...state, correct: state.correct + 1, drops: state.drops.filter(drop => drop.id !== hit.id)} : null;
}

// 문장 퍼즐: 섞인 조각을 순서대로 놓는다. 한 번에 맞히면 100점, 다시 확인할 때마다 20점씩 덜 받고 최소 20점이다.
export const PUZZLE_ROUND = 5, PUZZLE_MAX_CHUNKS = 6, PUZZLE_MIN_WORDS = 3, PUZZLE_MIN_MS = 1000, PUZZLE_MAX_TRIES = 20;
export type PuzzleItem = {cardId: string; chunks: string[]; hint: string};
/** Splits a sentence on spaces into at most `max` pieces of neighbouring words, sizes differing by one at most. */
export function sentenceChunks(sentence: string, max = PUZZLE_MAX_CHUNKS): string[] | null {
  const words = sentence.normalize('NFKC').trim().split(/\s+/u).filter(Boolean);
  if (words.length < PUZZLE_MIN_WORDS) return null;
  const count = Math.min(max, words.length), size = Math.floor(words.length / count), extra = words.length % count, chunks: string[] = [];
  for (let index = 0, from = 0; index < count; index++) {const to = from + size + (index < extra ? 1 : 0); chunks.push(words.slice(from, to).join(' ')); from = to;}
  return chunks;
}
/** Sentence sets arrange the front; word sets arrange the first line of an example. The same sentence is offered once. */
export function puzzleEligible(cards: CardEntry[], type: CardSetType): PuzzleItem[] {
  const seen = new Set<string>(), items: PuzzleItem[] = [];
  for (const card of cards) {
    const sentence = type === 'sentence' ? card.front : (card.example.split(/\r?\n/u).find(line => line.trim()) ?? ''), chunks = sentenceChunks(sentence), key = normalizeCardAnswer(sentence);
    if (!chunks || seen.has(key)) continue;
    seen.add(key); items.push({cardId: card.id, chunks, hint: type === 'sentence' ? card.back : `${card.front} · ${card.back}`});
  }
  return items;
}
export const puzzleCount = (cards: CardEntry[], type: CardSetType) => Math.min(PUZZLE_ROUND, puzzleEligible(cards, type).length);
export const buildPuzzles = (cards: CardEntry[], type: CardSetType, random: Random) => shuffleWith(puzzleEligible(cards, type), random).slice(0, PUZZLE_ROUND);
/** Chunk positions in a starting order that is not already solved, when the chunks allow it. */
export function puzzleStart(chunks: string[], random: Random) {
  const order = chunks.map((_, index) => index);
  for (let tries = 0; tries < 12; tries++) {const mixed = shuffleWith(order, random); if (!puzzleSolved(chunks, mixed)) return mixed;}
  return order;
}
/** Compares text, not positions, so two identical chunks may swap places. */
export const puzzleSolved = (chunks: string[], order: number[]) => order.length === chunks.length && normalizeCardAnswer(order.map(index => chunks[index]).join(' ')) === normalizeCardAnswer(chunks.join(' '));
/** How many chunks from the start are already in place, used to point at where the order goes wrong. */
export function puzzlePrefix(chunks: string[], order: number[]) {
  let count = 0;
  while (count < order.length && normalizeCardAnswer(chunks[order[count]] ?? '') === normalizeCardAnswer(chunks[count] ?? '')) count++;
  return count;
}
/** One entry per puzzle: wrong checks before solving, or -1 when it was skipped. */
export const puzzlePoints = (wrong: number) => wrong < 0 ? 0 : Math.max(20, 100 - wrong * 20);
export const puzzleScore = (results: number[]) => results.reduce((total, wrong) => total + puzzlePoints(wrong), 0);

// 서버 판정. 화면이 보낸 값에서 점수를 다시 계산하고, 그 판이 실제로 가능한 범위인지 본다.
export type GameRecord = {score: number; timeMs: number};
export type GameCheck = {ok: true; record: GameRecord} | {ok: false; reason: string};
export function checkGameResult(game: CardGame, input: Record<string, unknown>, cards: CardEntry[], type: CardSetType): GameCheck {
  const elapsed = input.elapsedMs, fail = (reason: string): GameCheck => ({ok: false, reason});
  if (!int(elapsed, 0, GAME_MAX_MS)) return fail('elapsed');
  const ms = elapsed as number;
  if (game === 'pair') {
    const pairs = pairCount(cards);
    if (pairs < PAIR_MIN) return fail('cards');
    if (input.pairs !== pairs) return fail('pairs');
    if (!int(input.mistakes, 0, pairs * 30)) return fail('mistakes');
    if (ms < pairs * PAIR_MIN_MS) return fail('too-fast');
    return {ok: true, record: {score: pairTime(ms, input.mistakes as number), timeMs: ms}};
  }
  if (game === 'rain') {
    if (!rainPlayable(cards).length) return fail('cards');
    if (!int(input.correct, 0, RAIN_MAX_WORDS) || !int(input.missed, 0, RAIN_LIVES)) return fail('counts');
    const correct = input.correct as number, missed = input.missed as number;
    if (correct * RAIN_MIN_MS > ms || correct + missed > 1 + Math.floor(ms / RAIN_MIN_INTERVAL) + RAIN_MAX_DROPS) return fail('too-fast');
    return {ok: true, record: {score: rainScore(correct), timeMs: ms}};
  }
  const count = puzzleCount(cards, type), results = input.results;
  if (!count) return fail('cards');
  if (!Array.isArray(results) || results.length !== count || !results.every(value => int(value, -1, PUZZLE_MAX_TRIES))) return fail('results');
  if (ms < results.filter(value => value >= 0).length * PUZZLE_MIN_MS) return fail('too-fast');
  return {ok: true, record: {score: puzzleScore(results), timeMs: ms}};
}
/** True when `next` beats `best`. Point games break ties on the faster time. */
export function betterRecord(game: CardGame, next: GameRecord, best: GameRecord | null | undefined) {
  if (!best) return true;
  if (lowerIsBetter(game)) return next.score < best.score;
  return next.score > best.score || next.score === best.score && next.timeMs < best.timeMs;
}
export type GameRankRow = {id: string; name: string; score: number; timeMs: number; rank: number};
/** Same record, same rank, like the playground rankings. Ties are listed in ID order so the list never jumps around. */
export function rankGameRows(game: CardGame, rows: Omit<GameRankRow, 'rank'>[]): GameRankRow[] {
  const order = (a: GameRecord, b: GameRecord) => lowerIsBetter(game) ? a.score - b.score : b.score - a.score || a.timeMs - b.timeMs;
  const sorted = [...rows].sort((a, b) => order(a, b) || a.id.localeCompare(b.id)), ranked: GameRankRow[] = [];
  sorted.forEach((row, index) => {const before = ranked[index - 1]; ranked.push({...row, rank: before && order(before, row) === 0 ? before.rank : index + 1});});
  return ranked;
}
/** Records dropped from the rate window once they are older than it. */
export const recentPlays = (stamps: unknown, time: number) => (Array.isArray(stamps) ? stamps : []).filter((stamp): stamp is number => typeof stamp === 'number' && time - stamp < GAME_RATE.windowMs && stamp <= time);
export function formatGameTime(ms: number) {
  const tenths = Math.max(0, Math.round(ms / 100)), minutes = Math.floor(tenths / 600), seconds = (tenths % 600) / 10;
  return minutes ? `${minutes}:${seconds.toFixed(1).padStart(4, '0')}` : seconds.toFixed(1);
}
