'use client';
import type {CSSProperties} from 'react';
import {wardrobeCatalog, type WardrobeItem, type WardrobeOutfit} from '@/lib/points-types';
import '@/styles/points.css';
import {accessoryArt, avatarPet, wornSprite, wearState, isWearablePet} from '@/modules/my-space/appearance';
import '@/styles/character-wearables.css';
import {juniorWearState} from '@/modules/my-space/new-pets';
import JuniorAccessoryLayers from '@/modules/my-space/junior-accessory-layers';
import AccessoryLayers from '@/modules/my-space/accessory-layers';

export function WardrobeItemArt({item}: {item: WardrobeItem}) {
  return <span className={`wardrobe-item-art wardrobe-art-${item.slot} wardrobe-motif-${item.motif}`} style={{'--item-color': item.color} as CSSProperties} aria-hidden="true">{['head', 'neck'].includes(item.slot) ? <img className="wardrobe-accessory-art" src={accessoryArt(item.id)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}}/> : item.slot === 'background' ? <><i/><i/><i/></> : <span>✦</span>}</span>;
}
export default function CharacterAvatar({character = 'cat', outfit = {}, className = '', alt = '', imageSrc, spaceOutfit={}}: {character?: string; outfit?: WardrobeOutfit; className?: string; alt?: string; imageSrc?:string; spaceOutfit?:Partial<Record<'body'|'bag',string>>}) {
  const pet = avatarPet(character, imageSrc);
  const canDress = isWearablePet(pet);
  const items = Object.values(outfit).map(id => wardrobeCatalog.find(item => item.id === id)).filter((item): item is WardrobeItem => !!item);
  const background = items.find(item => item.slot === 'background'), frame = items.find(item => item.slot === 'frame');
  return <span role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true} data-pet={pet} data-wear-state={canDress ? wearState(spaceOutfit) : juniorWearState(spaceOutfit)} className={`character-avatar character-${character} avatar-fitted ${className} ${background ? `avatar-background-${background.motif}` : ''} ${frame ? `avatar-frame-${frame.motif}` : ''}`} style={{'--avatar-background': background?.color || 'transparent', '--avatar-frame': frame?.color || 'transparent'} as CSSProperties}>
    <span className="character-avatar-scene"/>
    <img className="character-avatar-base" src={wornSprite(pet, spaceOutfit)} alt="" draggable={false}/>
    {isWearablePet(pet) && <AccessoryLayers pet={pet} body={spaceOutfit} outfit={Object.fromEntries(items.map(item => [item.slot,item.id]))}/>}
    {!canDress && <JuniorAccessoryLayers pet={pet} sprite={wornSprite(pet, spaceOutfit)} body={spaceOutfit.body} outfit={outfit}/>}
    <span className="character-avatar-border"/>
  </span>;
}
