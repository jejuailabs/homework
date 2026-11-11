import Mockup from './mockups';
import type {Visual} from './types';

export default function VisualBlock({visual, priority}: {visual: Visual; priority?: boolean}) {
  return (
    <figure className="ps-figure">
      {'mock' in visual
        ? <><Mockup id={visual.mock}/><span className="ps-sr">{visual.alt}</span></>
        : <img className="ps-photo" src={visual.src} alt={visual.alt} loading={priority ? 'eager' : 'lazy'} decoding="async"/>}
      {visual.caption && <figcaption>{visual.caption}</figcaption>}
    </figure>
  );
}
