
'use client';
import {useId} from 'react';
import type {WardrobeOutfit} from '@/lib/points-types';
import {juniorLayout} from './junior-wardrobe';

export default function JuniorAccessoryLayers({pet, sprite, body, outfit}: {pet: string; sprite: string; body?: string; outfit: WardrobeOutfit}) {
  const uid = 'junior-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const head = outfit.head ? juniorLayout(pet, outfit.head, body) : null;
  const neck = outfit.neck ? juniorLayout(pet, outfit.neck, body) : null;
  if (!head && !neck) return null;
  const part = (fit: NonNullable<typeof head>) => <image data-attachment={fit.id} href={fit.asset.src} x={fit.left} y={fit.top} width={fit.width} height={fit.height} preserveAspectRatio="none"/>;
  return <svg className="avatar-attachments" data-fit-pet={pet} viewBox="0 0 100 100" aria-hidden="true">
    {neck && (neck.id === 'junior-neck-bow' ? part(neck) : <><defs><clipPath id={uid}><path d={`M0 0 H100 V${neck.neck - 5} H${neck.x + neck.eyeSpan * .86} Q${neck.x} ${neck.neck + 2.5} ${neck.x - neck.eyeSpan * .86} ${neck.neck - 5} H0Z`}/></clipPath></defs>{part(neck)}<image href={sprite} width="100" height="100" clipPath={`url(#${uid})`}/></>)}
    {head && part(head)}
  </svg>;
}

