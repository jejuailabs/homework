'use client';
import CharacterAvatar from '@/components/character-avatar';
import {spaceItem} from './catalog';

/** The shop/picker shows a worn garment instead of the former shirt icon. */
export function Clothes({id, pet = 'friend-cat'}: {id: string; pet?: string}) {
  const item = spaceItem(id), friend = spaceItem(pet);
  if (item?.kind !== 'clothes' || !item.slot) return null;
  return <span className="ms-clothes-preview"><CharacterAvatar character={friend?.base || 'cat'} imageSrc={friend?.art} spaceOutfit={{[item.slot]: id}}/></span>;
}
