'use client';
import type {CSSProperties} from 'react';
import {wardrobeCatalog, type WardrobeItem, type WardrobeOutfit} from '@/lib/points-types';
import '@/styles/points.css';
import {accessoryArt, avatarPet, wornSprite, wearState, type WearablePet} from '@/modules/my-space/appearance';
import '@/styles/character-wearables.css';
import AccessoryLayers from '@/modules/my-space/accessory-layers';
import WhitekneeAccessories from '@/modules/my-space/whiteknee-avatar';
import {isWhiteknee, normalizeWhitekneePose, whitekneeBodyState, whitekneeItemCompatible, type WhitekneePose} from '@/modules/my-space/whiteknee';

export function WardrobeItemArt({item}: {item: WardrobeItem}) {
  return <span className={`wardrobe-item-art wardrobe-art-${item.slot} wardrobe-motif-${item.motif}`} style={{'--item-color': item.color} as CSSProperties} aria-hidden="true">{['head', 'neck', 'face'].includes(item.slot) ? <img className="wardrobe-accessory-art" src={accessoryArt(item.id)} alt="" style={{width:"100%",height:"100%",objectFit:"contain"}}/> : item.slot === 'background' ? <><i/><i/><i/></> : <span>✦</span>}</span>;
}
export default function CharacterAvatar({character = 'cat', outfit = {}, className = '', alt = '', imageSrc, spaceOutfit={}, pose, presentation = 'portrait'}: {character?: string; outfit?: WardrobeOutfit; className?: string; alt?: string; imageSrc?:string; spaceOutfit?:Partial<Record<'body'|'bag',string>>; pose?: WhitekneePose; presentation?: 'portrait' | 'scene'}) {
  const pet = avatarPet(character, imageSrc);
  const items = Object.values(outfit).map(id => wardrobeCatalog.find(item => item.id === id)).filter((item): item is WardrobeItem => !!item && whitekneeItemCompatible(pet, item));
  const background = presentation === 'portrait' ? items.find(item => item.slot === 'background') : undefined, frame = presentation === 'portrait' ? items.find(item => item.slot === 'frame') : undefined;
  const safeOutfit = Object.fromEntries(items.map(item => [item.slot, item.id]));
  return <span role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true} data-pet={pet} data-pose={isWhiteknee(pet) ? normalizeWhitekneePose(pose) : undefined} data-wear-state={isWhiteknee(pet) ? whitekneeBodyState(spaceOutfit.body) : wearState(spaceOutfit)} className={`character-avatar character-${character} avatar-fitted ${className} ${background ? `avatar-background-${background.motif}` : ''} ${frame ? `avatar-frame-${frame.motif}` : ''}`} style={{'--avatar-background': background?.color || 'transparent', '--avatar-frame': frame?.color || 'transparent'} as CSSProperties}>
    <span className="character-avatar-scene"/>
    <img className="character-avatar-base" src={wornSprite(pet, spaceOutfit, pose)} alt="" draggable={false}/>
    {isWhiteknee(pet) ? <WhitekneeAccessories outfit={safeOutfit} pose={pose} body={spaceOutfit.body}/> : <AccessoryLayers pet={pet as WearablePet} body={spaceOutfit} outfit={safeOutfit}/>}
    <span className="character-avatar-border"/>
  </span>;
}
