import {seahorseSet} from './seahorse';
import './seahorse-sets.css';

/** Contents describe the complete look shown in the thumbnail. */
export default function SeahorseSetDetails({id}: {id: string}) {
  const set = seahorseSet(id);
  if (!set) return null;
  return <dl className="ms-set-details"><div><dt>옷</dt><dd>{set.clothes}</dd></div><div><dt>액세서리</dt><dd>{set.accessories}</dd></div></dl>;
}
