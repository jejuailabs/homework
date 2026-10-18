import { spaceItem } from './catalog';
import { ownedItems } from './policy';
export function companionProfile(student: Record<string, any>, room: Record<string, any> | undefined) { const pet = room && ownedItems(student.spaceOwned).includes(room.pet) ? spaceItem(room.pet) : null; return pet && pet.kind === 'pet' ? { pet: pet.id, art: pet.art, name: room?.nicknames?.[pet.id] || pet.buddyName || pet.name, outfit: room?.outfit || {} } : null; }
