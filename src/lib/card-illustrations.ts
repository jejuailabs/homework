import data from '../data/card-illustrations.json';
import storageRelease from '../data/card-illustration-storage.json';
import type {CardEntry, CardSetType} from './cards-types';

export type CardIllustrationEntry = {
  file: string;
  sense: string;
  review: 'ready' | 'abstract' | 'polysemy' | 'grammar' | 'metaphor';
  meaning?: string;
};
export type IllustratedCard = Pick<CardEntry, 'front' | 'back'> & Partial<Pick<CardEntry, 'drill'>>;
export const CARD_ILLUSTRATIONS: Readonly<Record<string, CardIllustrationEntry>> = data as Record<string, CardIllustrationEntry>;
export type CardIllustrationStorageConfig = {ready: boolean; bucket: string; prefix: string; downloadToken: string};
const registeredFiles = new Set(Object.values(CARD_ILLUSTRATIONS).map(entry => entry.file));
const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validBucket(bucket: string) {
  return bucket.length >= 3 && bucket.length <= 222 && !/^\d+\.\d+\.\d+\.\d+$/.test(bucket)
    && bucket.split('.').every(label => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}

/**
 * This curated image pack is intentionally public. The shared download token is
 * a public asset URL token, never an admin credential. Resolve URLs locally:
 * no Storage SDK, metadata request, Next image proxy, or deployed SVG copy.
 * A release becomes ready only after its entire pack has been uploaded.
 */
export function cardIllustrationStorageUrl(file: string, config: CardIllustrationStorageConfig = storageRelease): string | null {
  if (config.ready !== true || typeof config.bucket !== 'string' || !validBucket(config.bucket)
    || typeof config.prefix !== 'string' || !/^cards\/vocabulary\/v[1-9]\d*$/.test(config.prefix)
    || typeof config.downloadToken !== 'string' || !tokenPattern.test(config.downloadToken)
    || !/^[A-Za-z]+(?:-[A-Za-z]+)*\.svg$/.test(file) || !registeredFiles.has(file)) return null;
  const objectPath = encodeURIComponent(`${config.prefix}/${file}`);
  return `https://firebasestorage.googleapis.com/v0/b/${config.bucket}/o/${objectPath}?alt=media&token=${config.downloadToken}`;
}

/** False while the pack is hidden (ready: false): every picture and the picture toggle stay out of the UI. */
export const CARD_ILLUSTRATIONS_LIVE = cardIllustrationStorageUrl('apple.svg') !== null;

/** Whole headwords only: sentences, paths, and partial matches must stay text. */
export function illustrationHeadword(front: string): string | null {
  const word = front.normalize('NFKC').trim().toLowerCase();
  return /^[a-z]+(?:-[a-z]+)*$/.test(word) ? word : null;
}

const normalizedMeaning = (value: string) => value.normalize('NFKC').replace(/[~～∼]/g, '').replace(/\s+/g, '').trim();
const meaningParts = (value: string) => value.split(/[,;\/|\n]/).map(normalizedMeaning).filter(Boolean);

/**
 * The artwork depicts one selected meaning, not every meaning of its headword.
 * A conservative match keeps custom subject terms and different senses intact.
 * No substring/synonym guessing: e.g. run=운영하다 or bank=강둑 gets no picture.
 */
export function cardIllustration(card: IllustratedCard, type: CardSetType = 'word'): (CardIllustrationEntry & {src: string | null; word: string}) | null {
  if (type !== 'word' || card.drill) return null;
  const word = illustrationHeadword(card.front);
  if (!word || !Object.hasOwn(CARD_ILLUSTRATIONS, word)) return null;
  const entry = CARD_ILLUSTRATIONS[word];
  const back = normalizedMeaning(card.back);
  if (!back) return null;
  const sourceMatch = back === normalizedMeaning(entry.meaning ?? entry.sense);
  const senses = meaningParts(entry.sense), answers = meaningParts(card.back);
  if (!sourceMatch && !answers.some(answer => senses.includes(answer))) return null;
  return {...entry, word, src: cardIllustrationStorageUrl(entry.file)};
}
