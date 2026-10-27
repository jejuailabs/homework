
import {juniorAttachmentAssets, juniorPoses} from './junior-assets';
import {juniorWearState, type JuniorAttachmentId} from './new-pets';

export function juniorLayout(pet: string, itemId: string, body?: string) {
  const asset = juniorAttachmentAssets[pet + '/' + itemId];
  if (!asset) return null;
  const state = juniorWearState({body});
  const pose = juniorPoses[pet + '/' + state];
  if (!pose) return null;
  const {x, eyeY, eyeSpan} = pose;
  const head = itemId.startsWith('junior-head-');
  const flower = itemId === 'junior-head-flower', beanie = itemId === 'junior-head-beanie', beret = itemId === 'junior-head-beret';
  const neck = eyeY + eyeSpan * .66;
  const availableHeight = itemId === 'junior-neck-bow' ? 97 - neck : (98 - neck) / .85;
  const width = Math.min(head ? flower ? 43 : (eyeY - 8) * asset.ratio : Math.max(12, availableHeight * asset.ratio), head ? 43 : 46, eyeSpan * (flower ? .72 : beanie ? 1.65 : beret ? 1.5 : head ? 1.05 : itemId === 'junior-neck-bow' ? 1.0 : 1.6));
  const height = width / asset.ratio;
  const seat = eyeY - eyeSpan * (beanie ? .48 : beret ? .75 : 1.05);
  const left = flower ? x + eyeSpan * .66 : x - width / 2;
  const top = head ? flower ? eyeY - eyeSpan * .92 : Math.max(1, Math.min(eyeY - 7 - height, seat - height * .83)) : itemId === 'junior-neck-bow' ? neck + 1 : neck - height * .15;
  return {asset, left, top, width, height, neck, x, eyeSpan, id: itemId as JuniorAttachmentId};
}

