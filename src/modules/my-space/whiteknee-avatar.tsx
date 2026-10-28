import type {WardrobeOutfit} from '@/lib/points-types';
import {WHITEKNEE_ROOT, type WhitekneePose} from './whiteknee';
import {whitekneeAccessoryLayout} from './whiteknee-layout';
import './whiteknee.css';

export default function WhitekneeAccessories({outfit, pose, body}: {outfit: WardrobeOutfit; pose?: WhitekneePose; body?: string}) {
  return <span className="whiteknee-accessories" aria-hidden="true">
    {(['neck', 'head', 'face'] as const).map(slot => {
      const id = outfit[slot];
      const fit = id && whitekneeAccessoryLayout(id, pose, body);
      if (!id || !fit) return null;
      const pivotX = fit.pivotX ?? 50, pivotY = fit.pivotY ?? (fit.anchor === 'bottom' ? 100 : fit.anchor === 'center' ? 50 : 0);
      return <img key={slot} className={`whiteknee-accessory whiteknee-accessory-${slot}`} src={`${WHITEKNEE_ROOT}/accessories/${id.slice('whiteknee-'.length)}.webp`} alt="" draggable={false} style={{left: `${fit.x}%`, top: `${fit.y}%`, width: `${fit.width}%`, height: 'auto', zIndex: fit.z, transform: `translate(-${pivotX}%, -${pivotY}%) rotate(${fit.rotation || 0}deg)`, transformOrigin: `${pivotX}% ${pivotY}%`}}/>;
    })}
  </span>;
}
