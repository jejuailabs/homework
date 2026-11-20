import {completeSet} from './complete-outfits';
import {berrySet, isBerry} from './berry';
import './seahorse-sets.css';

/** Contents describe the complete look shown in the thumbnail. */
export default function CompleteSetDetails({id, pet}: {id: string; pet?: string}) {
  // A berry set lists what the chosen berry wears; without one it lists both.
  const set = (pet && isBerry(pet) && berrySet(id)?.looks[pet]) || completeSet(id);
  if (!set) return null;
  return <dl className="ms-set-details"><div><dt>옷</dt><dd>{set.clothes}</dd></div><div><dt>액세서리</dt><dd>{set.accessories}</dd></div></dl>;
}
