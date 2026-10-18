import {characterFiles} from '@/lib/characters';
import {accessoryAspect} from './wearable-metrics';

export const wearablePets = ['friend-cat', 'friend-dog', 'friend-hamster', 'friend-alpaca', 'friend-rabbit', 'friend-otter', 'cat-american', 'cat-british', 'cat-siamese', 'cat-persian', 'cat-ragdoll', 'cat-maine'] as const;
export type WearablePet = typeof wearablePets[number];
export const wearStates = ['bare', 'knit', 'sailor', 'apron', 'raincoat', 'hoodie', 'overalls', 'dino', 'pajamas', 'bare-bag', 'knit-bag', 'sailor-bag', 'apron-bag', 'raincoat-bag', 'hoodie-bag', 'overalls-bag', 'dino-bag', 'pajamas-bag'] as const;
export type WearState = typeof wearStates[number];
export type SpaceOutfit = Partial<Record<'body' | 'bag', string>>;
const root = '/my-space/v2/wardrobe';
const accessories = ['head-sprout', 'head-crown', 'head-beret', 'head-party', 'head-flower', 'neck-bow', 'neck-scarf', 'neck-medal', 'neck-bandana'];

export function avatarPet(character = 'cat', imageSrc?: string): WearablePet {
  const breed = imageSrc?.match(/^\/my-space\/v1\/(cat-[a-z]+)\.webp$/)?.[1];
  if (breed && wearablePets.includes(breed as WearablePet)) return breed as WearablePet;
  const classic = Object.entries(characterFiles).find(([, file]) => imageSrc === `/characters/${file}.webp`)?.[0];
  return ('friend-' + (classic || (Object.hasOwn(characterFiles, character) ? character : 'cat'))) as WearablePet;
}
export function wearState(outfit: SpaceOutfit = {}): WearState {
  const requested = outfit.body?.startsWith('body-') ? outfit.body.slice(5) : undefined;
  const body = requested && ['knit', 'sailor', 'apron', 'raincoat', 'hoodie', 'overalls', 'dino', 'pajamas'].includes(requested) ? requested : 'bare';
  return (body + (outfit.bag === 'bag-leaf' ? '-bag' : '')) as WearState;
}
export function wornSprite(pet: WearablePet, outfit: SpaceOutfit = {}) {return `${root}/${pet}/${wearState(outfit)}.webp`;}
export function accessoryArt(itemId: string, pet: WearablePet = 'friend-cat') {return accessories.includes(itemId) ? `${root}/${pet.startsWith('cat-') ? 'fur' : 'soft'}/${itemId}.webp` : undefined;}

// Anchors are registered to the complete 512px character sprites, not the old
// species-independent icon rectangles. Tall ears and long fur have separate fits.
type Anchor = {x: number; head: number; neck: number; neckWidth: number; headWidth: number};
const anchors: Record<WearablePet, Anchor> = {
  'friend-cat': {x: 47, head: 25, neck: 57, neckWidth: 47, headWidth: 35},
  'friend-dog': {x: 48, head: 21, neck: 54, neckWidth: 49, headWidth: 36},
  'friend-hamster': {x: 48, head: 25, neck: 53, neckWidth: 47, headWidth: 34},
  'friend-alpaca': {x: 49, head: 28, neck: 60, neckWidth: 44, headWidth: 32},
  'friend-rabbit': {x: 47, head: 36, neck: 65, neckWidth: 43, headWidth: 31},
  'friend-otter': {x: 47, head: 25, neck: 53, neckWidth: 40, headWidth: 33},
  'cat-american': {x: 48, head: 23, neck: 54, neckWidth: 45, headWidth: 34},
  'cat-british': {x: 47, head: 23, neck: 56, neckWidth: 47, headWidth: 35},
  'cat-siamese': {x: 47, head: 25, neck: 55, neckWidth: 43, headWidth: 33},
  'cat-persian': {x: 46, head: 24, neck: 58, neckWidth: 46, headWidth: 33},
  'cat-ragdoll': {x: 47, head: 24, neck: 56, neckWidth: 46, headWidth: 34},
  'cat-maine': {x: 46, head: 27, neck: 58, neckWidth: 43, headWidth: 33},
};
export function accessoryFit(pet: WearablePet, itemId: string) {
  const a = anchors[pet];
  const ratio = accessoryAspect[`${pet.startsWith('cat-') ? 'fur' : 'soft'}/${itemId}`] || 1;
  if (itemId === 'head-flower') return {left: a.x + 18, top: a.head + 9, width: 19, rotate: 12};
  if (itemId.startsWith('head-')) {
    const requested = itemId === 'head-sprout' ? 21 : itemId === 'head-party' ? 24 : a.headWidth;
    const width = Math.min(requested, a.head * ratio / .9);
    return {left: a.x - width / 2, top: Math.max(0, a.head - width / ratio * .9), width, rotate: itemId === 'head-beret' ? -8 : -3};
  }
  const width = Math.min(a.neckWidth * (itemId === 'neck-bow' ? .73 : .84), (94 - a.neck + 6) * ratio);
  return {left: a.x - width / 2, top: a.neck - 6, width, rotate: 0};
}
export function neckFurClip(pet: WearablePet) {const a = anchors[pet]; return `ellipse(39% ${a.neck - 14}% at ${a.x}% 15%)`;}
