import type {WardrobeOutfit} from '@/lib/points-types';
import {seahorseAccessoryLayout} from './seahorse-layout';
import './seahorse.css';

export default function SeahorseAccessories({pet, outfit, pose, body}: {pet: string; outfit: WardrobeOutfit; pose?: unknown; body?: string}) {
  return <span className="seahorse-accessories" aria-hidden="true">
    {(['neck', 'head', 'face'] as const).map(slot => {
      const id = outfit[slot], fit = id && seahorseAccessoryLayout(pet, id, pose, body);
      return fit ? <img key={slot} data-attachment={id} src={fit.src} alt="" draggable={false} style={{left: `${fit.x}%`, top: `${fit.y}%`, width: `${fit.width}%`, zIndex: fit.z, transform: `translate(-${fit.pivotX}%, -${fit.pivotY}%)`}}/> : null;
    })}
  </span>;
}
