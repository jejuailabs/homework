import {spaceCatalog, type SpaceItem} from './catalog';
import {compatibleWearable, newPet} from './new-pets';
import {isWhiteknee, WHITEKNEE_ID} from './whiteknee';

export type WardrobeGroupId = 'classic' | 'fluffy' | 'whiteknee';
export const wardrobeGroups = [
  {id: 'classic', name: '모찌·두부와 친구들', examples: ['friend-cat', 'friend-dog', 'cat-british']},
  {id: 'fluffy', name: '뽀송·식빵과 친구들', examples: ['dog-bichon', 'dog-corgi', 'fantasy-cloud-dragon']},
  {id: 'whiteknee', name: '화이트니 전용', examples: [WHITEKNEE_ID]},
] as const;
export const petWardrobeGroup = (pet: string): WardrobeGroupId => isWhiteknee(pet) ? 'whiteknee' : newPet(pet) ? 'fluffy' : 'classic';
export const groupFriends = (group: WardrobeGroupId) => spaceCatalog.filter(item => item.kind === 'pet' && petWardrobeGroup(item.id) === group);
export const friendName = (pet: SpaceItem) => pet.buddyName || pet.name;
export function previewFriend(group: WardrobeGroupId, current: string, owned: string[], requested?: string) {
  const friends = groupFriends(group);
  return friends.find(pet => pet.id === requested) || friends.find(pet => pet.id === current) || friends.find(pet => owned.includes(pet.id)) || friends[0];
}
export function itemFriends(item: {id: string; kind: string; slot?: string}) {
  return item.kind === 'clothes' || item.kind === 'accessory' ? spaceCatalog.filter(pet => pet.kind === 'pet' && compatibleWearable(pet.id, item)) : [];
}
