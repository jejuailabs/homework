import {characterFiles} from '@/lib/characters';
import {newPet, newPetFromArt, type NewPetId} from './new-pets';
import {attachmentAssets} from './attachment-assets';
import {attachmentLayout, type AttachmentId} from './attachment-rig';

export const wearablePets = ['friend-cat', 'friend-dog', 'friend-hamster', 'friend-alpaca', 'friend-rabbit', 'friend-otter', 'cat-american', 'cat-british', 'cat-siamese', 'cat-persian', 'cat-ragdoll', 'cat-maine'] as const;
export type WearablePet = typeof wearablePets[number];
export type AvatarPet = WearablePet | NewPetId;
export const isWearablePet = (pet: AvatarPet): pet is WearablePet => wearablePets.includes(pet as WearablePet);
export const wearStates = ['bare', 'knit', 'sailor', 'apron', 'raincoat', 'hoodie', 'overalls', 'dino', 'pajamas', 'bare-bag', 'knit-bag', 'sailor-bag', 'apron-bag', 'raincoat-bag', 'hoodie-bag', 'overalls-bag', 'dino-bag', 'pajamas-bag'] as const;
export type WearState = typeof wearStates[number];
export type SpaceOutfit = Partial<Record<'body' | 'bag', string>>;
const root = '/my-space/v2/wardrobe';
const accessories = ['head-sprout', 'head-crown', 'head-beret', 'head-party', 'head-flower', 'neck-bow', 'neck-scarf', 'neck-medal', 'neck-bandana'];

export function avatarPet(character = 'cat', imageSrc?: string): AvatarPet {
  const added = newPetFromArt(imageSrc) || newPet(character);
  if (added) return added.id;
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
export function wornSprite(pet: AvatarPet, outfit: SpaceOutfit = {}) {return newPet(pet)?.art || `${root}/${pet}/${wearState(outfit)}.webp`;}
export function accessoryArt(itemId: string, pet: AvatarPet = 'friend-cat') {return accessories.includes(itemId) ? attachmentAssets[pet+'/'+itemId]?.src : undefined;}
export function accessoryFit(pet: WearablePet, itemId: string, body = 'bare') {
  const {left,top,width,height,rotate}=attachmentLayout(pet,itemId as AttachmentId,body);
  return {left,top,width,height,rotate};
}
