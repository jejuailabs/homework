import {normalizeWhitekneePose, whitekneeBodyState, type WhitekneePose, type WhitekneeBody, type WhitekneeAccessoryId} from './whiteknee';

export type WhitekneeAnchors = {x: number; crownY: number; eyeY: number; eyeSpan: number; chestY: number; rotation: number};
// Percent coordinates in each square sprite; eyeSpan scales the accessory art.
// Each pose/outfit is measured separately so fitting stays isolated per sprite.
export const whitekneeAnchors: Record<WhitekneePose, Record<WhitekneeBody, WhitekneeAnchors>> = {
  rest: {
    bare: {x: 48.3, crownY: 37, eyeY: 47, eyeSpan: 20.4, chestY: 58.3, rotation: 10},
    explorer: {x: 50.6, crownY: 37, eyeY: 47, eyeSpan: 20.4, chestY: 58.3, rotation: 9.5},
    hero: {x: 48.3, crownY: 37, eyeY: 47, eyeSpan: 20.4, chestY: 58, rotation: 10},
    pajamas: {x: 48.6, crownY: 35.5, eyeY: 45.4, eyeSpan: 20.4, chestY: 57.4, rotation: 9.5},
    chef: {x: 48.6, crownY: 35.5, eyeY: 45, eyeSpan: 20.4, chestY: 57, rotation: 8.5},
  },
  raised: {
    bare: {x: 48.3, crownY: 33.3, eyeY: 43.6, eyeSpan: 21.2, chestY: 55.8, rotation: 7},
    explorer: {x: 50.3, crownY: 36.5, eyeY: 45.4, eyeSpan: 20, chestY: 57.7, rotation: 6.5},
    hero: {x: 48.2, crownY: 34, eyeY: 43.5, eyeSpan: 20, chestY: 55.6, rotation: 7},
    pajamas: {x: 48.5, crownY: 32, eyeY: 42.5, eyeSpan: 21.8, chestY: 55.1, rotation: 5.5},
    chef: {x: 48.3, crownY: 32, eyeY: 42.4, eyeSpan: 22.2, chestY: 54.7, rotation: 5.5},
  },
};

export type WhitekneeAccessoryLayout = {x: number; y: number; width: number; anchor: 'top' | 'center' | 'bottom'; z: number; rotation?: number; pivotX?: number; pivotY?: number};

export function whitekneeAccessoryLayout(itemId: string, pose?: WhitekneePose, body?: string): WhitekneeAccessoryLayout | null {
  const anchors = whitekneeAnchors[normalizeWhitekneePose(pose)][whitekneeBodyState(body)];
  const {x, crownY, eyeY, eyeSpan, chestY} = anchors;
  const layouts: Record<WhitekneeAccessoryId, WhitekneeAccessoryLayout> = {
    'whiteknee-head-explorer': {x, y: crownY + 4, width: eyeSpan * 1.9, anchor: 'bottom', pivotY: 86, z: 4},
    'whiteknee-head-sprout': {x: x + eyeSpan * .48, y: crownY + 5, width: eyeSpan * .65, anchor: 'bottom', pivotX: 61, pivotY: 81, z: 4},
    'whiteknee-head-chef': {x, y: crownY + 4, width: eyeSpan * 1.4, anchor: 'bottom', pivotY: 89, z: 4},
    'whiteknee-head-sleep': {x, y: crownY + 5, width: eyeSpan * 1.8, anchor: 'bottom', pivotX: 42, pivotY: 93, z: 4},
    'whiteknee-head-bow': {x: x + eyeSpan * .47, y: crownY + 5, width: eyeSpan * .95, anchor: 'bottom', pivotY: 89, z: 4},
    'whiteknee-face-glasses': {x, y: eyeY, width: eyeSpan * 1.65, anchor: 'center', z: 5},
    // Lens midpoint is (262.5, 190) in the 512 x 327 image; the snorkel is off-center.
    'whiteknee-face-goggles': {x, y: eyeY, width: eyeSpan * 2.55, anchor: 'center', pivotX: 51.27, pivotY: 58.1, z: 5},
    'whiteknee-neck-scarf': {x, y: chestY, width: eyeSpan * 1.5, anchor: 'center', pivotY: 50, z: 3},
  };
  return Object.hasOwn(layouts, itemId) ? {...layouts[itemId as WhitekneeAccessoryId], rotation: anchors.rotation} : null;
}
