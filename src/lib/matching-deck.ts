/** Balanced projective-plane decks. Keep the math independent from artwork and AI. */
export const MATCHING_COUNTS = [3, 4, 5, 6, 8] as const;
export type MatchingCount = typeof MATCHING_COUNTS[number];
export type MatchingShape = 'circle' | 'hexagon' | 'square';
export type MatchingSettings = {
  version: 1; title: string; pack: string; symbolsPerCard: MatchingCount;
  shape: MatchingShape; seed: string; printCount: number; labels: boolean; artwork?: string[];
};
export type MatchingAssetSource = {
  kind: 'bundled' | 'teacher-upload' | 'generated'; sourceUrl: string;
  license: string; attribution: string; version: string;
  generation?: {provider: string; jobId: string; ownerId: string; paymentId: string; amount: number; currency: string};
};
/** Server-side extension contract: no provider or billing action is enabled by this tool. */
export type MatchingImageGenerationProvider = {
  quote(input: {ownerId: string; prompt: string; count: number}): Promise<{quoteId: string; amount: number; currency: string; expiresAt: string}>;
  start(input: {ownerId: string; quoteId: string; paymentId: string; idempotencyKey: string}): Promise<{jobId: string}>;
  status(input: {ownerId: string; jobId: string}): Promise<{state: 'queued' | 'running' | 'review' | 'failed'; assetIds: string[]; refundable: boolean}>;
};
export const matchingDeckSize = (count: MatchingCount) => count * count - count + 1;

function fieldAdd(a: number, b: number, order: number) {
  return order === 4 ? a ^ b : (a + b) % order;
}
function fieldMultiply(a: number, b: number, order: number) {
  if (order !== 4) return (a * b) % order;
  // GF(4) = GF(2)[x] / (x² + x + 1), not integers modulo 4.
  let product = 0;
  while (b) {
    if (b & 1) product ^= a;
    b >>= 1; a <<= 1;
    if (a & 4) a ^= 7;
  }
  return product;
}
export function matchingRandom(seed: string) {
  let state = 2166136261;
  for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state += 0x6D2B79F5;
    let n = Math.imul(state ^ state >>> 15, 1 | state);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
export function matchingShuffle<T>(input: readonly T[], random: () => number): T[] {
  const output = [...input];
  for (let i = output.length - 1; i > 0; i--) {
    const other = Math.floor(random() * (i + 1));
    [output[i], output[other]] = [output[other], output[i]];
  }
  return output;
}
export function createMatchingDeck(count: MatchingCount, seed = 'moa'): number[][] {
  if (!(MATCHING_COUNTS as readonly number[]).includes(count)) throw new Error('Unsupported symbol count');
  const q = count - 1;
  const infinity = q * q;
  const cards: number[][] = [];
  // Affine points (x,y), one infinity point for every slope and for vertical lines.
  for (let slope = 0; slope < q; slope++) {
    for (let intercept = 0; intercept < q; intercept++) {
      const line = Array.from({length: q}, (_, x) => x * q + fieldAdd(fieldMultiply(slope, x, q), intercept, q));
      cards.push([...line, infinity + slope]);
    }
  }
  for (let x = 0; x < q; x++) cards.push([...Array.from({length: q}, (_, y) => x * q + y), infinity + q]);
  cards.push(Array.from({length: q + 1}, (_, n) => infinity + n));
  const random = matchingRandom(seed);
  const symbols = matchingShuffle(Array.from({length: matchingDeckSize(count)}, (_, n) => n), random);
  return matchingShuffle(cards.map(card => matchingShuffle(card.map(id => symbols[id]), random)), random);
}
export function verifyMatchingDeck(cards: readonly (readonly number[])[], count: MatchingCount, full = true) {
  const total = matchingDeckSize(count);
  if (!cards.length || cards.length > total || (full && cards.length !== total)) return false;
  const appearances = new Array(total).fill(0) as number[];
  for (const card of cards) {
    if (card.length !== count || new Set(card).size !== count) return false;
    for (const id of card) {
      if (!Number.isInteger(id) || id < 0 || id >= total) return false;
      appearances[id]++;
    }
  }
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (cards[i].filter(id => cards[j].includes(id)).length !== 1) return false;
    }
  }
  return !full || appearances.every(appearance => appearance === count);
}
export function parseMatchingSettings(value: unknown, availablePacks: readonly string[]): MatchingSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid deck file');
  const input = value as Record<string, unknown>;
  if (input.version !== 1 || typeof input.title !== 'string' || input.title.length > 80 ||
    typeof input.pack !== 'string' || !availablePacks.includes(input.pack) ||
    typeof input.symbolsPerCard !== 'number' || !(MATCHING_COUNTS as readonly number[]).includes(input.symbolsPerCard) ||
    !['circle', 'hexagon', 'square'].includes(String(input.shape)) ||
    typeof input.seed !== 'string' || !input.seed.trim() || input.seed.length > 80 ||
    typeof input.printCount !== 'number' || !Number.isInteger(input.printCount) || input.printCount < 2 ||
    input.printCount > matchingDeckSize(input.symbolsPerCard as MatchingCount) || typeof input.labels !== 'boolean') {
    throw new Error('Invalid deck settings');
  }
  if (input.artwork !== undefined && (!Array.isArray(input.artwork) || input.artwork.length !== matchingDeckSize(input.symbolsPerCard as MatchingCount) ||
    input.artwork.some(id => typeof id !== 'string' || !/^(noto-[a-f0-9]+|flag-[a-z]{2})$/.test(id)) ||
    new Set(input.artwork).size !== input.artwork.length)) throw new Error('Invalid artwork');
  return {version: 1, title: input.title, pack: input.pack, symbolsPerCard: input.symbolsPerCard as MatchingCount,
    shape: input.shape as MatchingShape, seed: input.seed, printCount: input.printCount, labels: input.labels,
    ...(input.artwork ? {artwork: input.artwork as string[]} : {})};
}
/** Safe circular arrangement also fits the inscribed circle of a regular hexagon. */
export function matchingPositions(count: number) {
  if (count < 3 || count > 8) throw new Error('Unsupported layout');
  return Array.from({length: count}, (_, index) => {
    if (!index) return {x: 50, y: 50, size: 25};
    const angle = (index - 1) * 2 * Math.PI / (count - 1) - Math.PI / 2;
    return {x: 50 + 29 * Math.cos(angle), y: 50 + 29 * Math.sin(angle), size: count > 6 ? 19 : 23};
  });
}
