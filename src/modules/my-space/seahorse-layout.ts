import {isSeahorse, normalizeSeahorsePose, seahorseAccessoryArt, seahorseBodyState} from './seahorse';
import {seahorseAnchors, seahorseAccessoryMetrics} from './seahorse-assets';

export function seahorseAccessoryLayout(pet: string, id: string, pose?: unknown, body?: string) {
  if (!isSeahorse(pet)) return null;
  const src = seahorseAccessoryArt(id, pet), metric = seahorseAccessoryMetrics[pet + '/' + id];
  const a = seahorseAnchors[pet + '/' + normalizeSeahorsePose(pose) + '/' + seahorseBodyState(body)];
  if (!src || !a || !metric) return null;
  const layouts: Record<string, {x: number; y: number; width: number; pivotX: number; pivotY: number; z: number}> = {
    'seahorse-head-beanie': {x: a.headX, y: a.crownY + 13, width: a.eyeSpan * 2.3, pivotX: 50, pivotY: 90, z: 4},
    'seahorse-head-sleep': {x: a.headX, y: a.crownY + 12, width: a.eyeSpan * 2.4, pivotX: 48, pivotY: 86, z: 4},
    'seahorse-head-bow': {x: a.headX - 13, y: a.crownY + 9, width: a.eyeSpan * 1.1, pivotX: 50, pivotY: 65, z: 4},
    'seahorse-head-sailor': {x: a.headX, y: a.crownY + 10, width: a.eyeSpan * 2.15, pivotX: 50, pivotY: 88, z: 4},
    'seahorse-face-glasses': {x: a.eyeX, y: a.eyeY, width: a.eyeSpan * 1.65, pivotX: 56, pivotY: 52, z: 5},
    'seahorse-face-goggles': {x: a.eyeX, y: a.eyeY, width: a.eyeSpan * 1.85, pivotX: 60, pivotY: 55, z: 5},
    'seahorse-neck-scarf': {x: a.neckX - 1, y: a.neckY - 3.5, width: a.eyeSpan * 1.45, pivotX: 48, pivotY: 18, z: 3},
    'seahorse-neck-shell': {x: a.neckX - 1, y: a.neckY - 3, width: a.eyeSpan * 1.15, pivotX: 50, pivotY: 12, z: 3},
  };
  const fit = layouts[id];
  if (!fit) return null;
  // Preserve the hat's seat on the crown and shrink tall pompoms into the canvas.
  const height = fit.width / metric.ratio;
  const scale = id.startsWith('seahorse-head-') ? Math.min(1, (fit.y - 1) / (height * fit.pivotY / 100)) : 1;
  return {...fit, width: fit.width * scale, src, height: height * scale};
}
