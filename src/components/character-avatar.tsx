'use client';
import type {CSSProperties} from 'react';
import {characterFiles, type Character} from '@/lib/characters';
import {wardrobeCatalog, type WardrobeItem, type WardrobeOutfit} from '@/lib/points-types';
import '@/styles/points.css';
import {Clothes} from '@/modules/my-space/clothes';

function Accessory({item}: {item: WardrobeItem}) {
  return <svg viewBox="0 0 100 80" fill="none" aria-hidden="true" className={`wardrobe-accessory-art motif-${item.motif}`} stroke="#695549" strokeWidth="3" strokeLinejoin="round">
    {item.motif === 'sprout' && <><path d="M51 69V35" stroke="#779e65" strokeWidth="6"/><path d="M50 43C19 47 16 17 18 16C40 15 51 23 50 43ZM51 40C81 43 87 15 85 13C64 12 51 20 51 40Z" fill={item.color}/></>}
    {item.motif === 'crown' && <><path d="M15 24L32 42L49 13L67 42L86 24L76 66H23Z" fill={item.color}/><path d="M27 58H73" stroke="#fff0b8" strokeWidth="5"/><circle cx="50" cy="43" r="6" fill="#e8a0a5"/></>}
    {item.motif === 'beret' && <><path d="M16 48C9 20 51 7 77 26C102 44 80 59 22 58Z" fill={item.color}/><path d="M21 58L77 58L73 66H25Z" fill="#855c83"/><path d="M55 20L58 10" strokeWidth="6"/></>}
    {item.motif === 'party' && <><path d="M18 66L50 8L84 66Z" fill={item.color}/><path d="M30 44L72 47M39 28L60 30" stroke="#fff1c5" strokeWidth="7"/><circle cx="50" cy="10" r="7" fill="#f0d57e"/><path d="M17 66Q51 75 84 66" stroke="#f0d57e" strokeWidth="9"/></>}
    {item.motif === 'flower' && <><path d="M51 56Q65 58 69 73" stroke="#82a477" strokeWidth="5"/>{[0,60,120,180,240,300].map(n => <ellipse key={n} cx="50" cy="24" rx="13" ry="17" fill={item.color} transform={`rotate(${n} 50 41)`}/>)}<circle cx="50" cy="41" r="13" fill="#f5d176"/></>}
    {item.motif === 'bow' && <><path d="M45 34L15 17V66L45 49M55 34L85 17V66L55 49" fill={item.color}/><circle cx="50" cy="41" r="13" fill="#f0b6b4"/></>}
    {item.motif === 'scarf' && <><path d="M16 21Q50 32 83 21L84 42Q53 53 16 42Z" fill={item.color}/><path d="M53 44L73 45L70 76L51 71Z" fill={item.color}/><path d="M56 65L70 67" stroke="#e6efe3" strokeWidth="5"/></>}
    {item.motif === 'medal' && <><path d="M23 13L49 53L78 13" stroke="#a3b5d8" strokeWidth="14"/><circle cx="50" cy="56" r="21" fill={item.color}/><path d="M50 43L54 51L63 53L56 60L57 69L50 64L42 69L44 60L37 53L46 51Z" fill="#fff0b1" strokeWidth="1"/></>}
    {item.motif === 'bandana' && <><path d="M15 21L86 21L50 69Z" fill={item.color}/><path d="M29 31L50 52L72 31" stroke="#e7eef6" strokeWidth="4"/></>}
  </svg>;
}
export function WardrobeItemArt({item}: {item: WardrobeItem}) {
  return <span className={`wardrobe-item-art wardrobe-art-${item.slot} wardrobe-motif-${item.motif}`} style={{'--item-color': item.color} as CSSProperties} aria-hidden="true">{['head', 'neck'].includes(item.slot) ? <Accessory item={item}/> : item.slot === 'background' ? <><i/><i/><i/></> : <span>✦</span>}</span>;
}
export default function CharacterAvatar({character = 'cat', outfit = {}, className = '', alt = '', imageSrc, spaceOutfit={}}: {character?: string; outfit?: WardrobeOutfit; className?: string; alt?: string; imageSrc?:string; spaceOutfit?:Partial<Record<'body'|'bag',string>>}) {
  const file = characterFiles[character as Character] || characterFiles.cat;
  const items = Object.values(outfit).map(id => wardrobeCatalog.find(item => item.id === id)).filter((item): item is WardrobeItem => !!item);
  const background = items.find(item => item.slot === 'background'), frame = items.find(item => item.slot === 'frame');
  return <span role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true} className={`character-avatar character-${character} ${className} ${background ? `avatar-background-${background.motif}` : ''} ${frame ? `avatar-frame-${frame.motif}` : ''}`} style={{'--avatar-background': background?.color || 'transparent', '--avatar-frame': frame?.color || 'transparent'} as CSSProperties}>
    <span className="character-avatar-scene"/>
    <img className="character-avatar-base" src={imageSrc||`/characters/${file}.webp`} alt="" draggable={false}/>
    {items.filter(item => item.slot === 'head' || item.slot === 'neck').map(item => <span key={item.id} className={`character-avatar-accessory avatar-${item.slot} avatar-motif-${item.motif}`}><Accessory item={item}/></span>)}
    <span className="character-avatar-border"/>
    {Object.values(spaceOutfit).map(key=>key&&<span key={key} className={`ms-worn ms-worn-${key.startsWith('bag-')?'bag':'body'}`}><Clothes id={key}/></span>)}
  </span>;
}
