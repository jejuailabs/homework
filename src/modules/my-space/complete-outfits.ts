import {isSeahorse, seahorseSet} from './seahorse';
import {isMarine, marineFamily, marineSet} from './marine';

export const isCompletePet = (pet: string) => isSeahorse(pet) || isMarine(pet);
export const completeSet = (id: string) => seahorseSet(id) || marineSet(id);
export const completeSetBadge = (id: string) => seahorseSet(id) ? '해솔·별몽 전용' : marineSet(id) ? `${marineSet(id)!.name.split(' ')[0]} 전용` : undefined;
export const completeWardrobe = (pet: string) => isSeahorse(pet)
  ? {id: 'seahorse', title: '해솔·별몽의 바다 옷장', friends: '해솔과 별몽', badge: '해솔·별몽 전용'}
  : marineFamily(pet);
