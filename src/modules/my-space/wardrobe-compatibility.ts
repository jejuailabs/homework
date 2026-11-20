import {marineFamily, marineItemFamily} from './marine';
import {isBerry, isBerryItem} from './berry';
import {isSeahorse, isRetiredSeahorseItem} from './seahorse';

/** Exclusive families are checked on the server as well as in previews. */
export function exclusiveItemCompatible(pet: string, item: string | {id: string; slot?: string}) {
  const id = typeof item === 'string' ? item : item.id;
  if (isRetiredSeahorseItem(id)) return false;
  const slot = typeof item === 'string' ? undefined : item.slot;
  if (slot === 'background' || slot === 'frame' || /^(background|frame)-/.test(id)) return true;
  const family = pet === 'animal-whiteknee' ? 'whiteknee' : isSeahorse(pet) ? 'seahorse' : isBerry(pet) ? 'berry' : marineFamily(pet)?.id;
  const itemFamily = id.startsWith('whiteknee-') ? 'whiteknee' : id.startsWith('seahorse-') ? 'seahorse' : isBerryItem(id) ? 'berry' : marineItemFamily(id);
  return family === itemFamily;
}
