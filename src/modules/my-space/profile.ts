import { spaceItem } from './catalog';
import { ownedItems, roomCompanionAppearance } from './policy';

export function companionProfile(student: Record<string, any>, room: Record<string, any> | undefined) {
  const items = ownedItems(student.spaceOwned);
  const pet = room && items.includes(room.pet) ? spaceItem(room.pet) : null;
  if (!pet || pet.kind !== 'pet') return null;
  const appearance = roomCompanionAppearance(room, items, pet.id);
  return {
    pet: pet.id,
    art: pet.art,
    name: room?.nicknames?.[pet.id] || pet.buddyName || pet.name,
    pose: appearance.pose,
    outfit: appearance.outfit,
  };
}
