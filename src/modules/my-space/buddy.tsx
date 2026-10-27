'use client';
import { useState, type CSSProperties } from 'react';
import { Heart, Sparkles } from 'lucide-react';
import CharacterAvatar from '@/components/character-avatar';
import { spaceItem, type Room } from './catalog';
import { growth } from './policy';
import { petPersonality, friendBase } from './personality';
import type { WardrobeOutfit } from '@/lib/points-types';
export { Clothes } from './clothes';
export default function Buddy({ pet = 'friend-cat', name, earned = 0, adopted = 0, outfit = {}, wardrobe = {}, en = false, small = false, presentation = 'portrait' }: {
    pet?: string;
    name?: string;
    earned?: number;
    adopted?: number;
    outfit?: Room['outfit'];
    wardrobe?: WardrobeOutfit;
    en?: boolean;
    small?: boolean;
    presentation?: 'portrait' | 'scene';
}) { const [tap, setTap] = useState(0), item = spaceItem(pet) || spaceItem('friend-cat')!, base = friendBase(item.id), person = petPersonality(item.id), g = growth(earned, adopted); return <div className={`ms-buddy ${small ? 'is-small' : ''} stage-${g.stage}`} style={{ '--buddy-scale': [.78, .9, 1][g.stage] } as CSSProperties}><button type="button" className={'ms-buddy-touch ' + (tap ? 'is-happy' : '')} onClick={() => setTap(t => t + 1)} aria-label={en ? 'Say hello to your friend' : `${name || person.name}에게 인사하기`}><span className="ms-buddy-portrait" key={tap}><CharacterAvatar character={base} imageSrc={item.art} outfit={wardrobe} spaceOutfit={outfit} presentation={presentation}/>{tap > 0 && <span className="ms-buddy-hearts" aria-hidden="true">♡ ✦ ♡</span>}</span></button>{!small && <><div className="ms-buddy-label"><Heart size={13}/>{name || (en ? item.en : item.buddyName || person.name)} <small>{en ? ['Baby', 'Little friend', 'Growing friend'][g.stage] : ['아기 친구', '꼬마 친구', '든든한 친구'][g.stage]}</small></div><p className="ms-buddy-speech" aria-live="polite">{en ? (tap ? 'You make my day brighter!' : 'Let’s make something wonderful today!') : person.hello[tap % person.hello.length]}</p><progress className="ms-growth-meter" max={g.next || 200} value={Math.min(g.total, g.next || 200)} aria-label="친구 성장"/>{g.next === null && <small className="ms-growth-hint">함께 자란 기억은 계속 쌓여요 🌿</small>}{g.next !== null && <small className="ms-growth-hint"><Sparkles size={12}/>{en ? `${g.next - g.total} more earned Bomal to grow` : `앞으로 ${g.next - g.total}보말을 더 모으면 한 뼘 자라요`}</small>}</>}</div>; }
