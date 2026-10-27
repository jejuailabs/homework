'use client';
import {useState} from 'react';
import CharacterAvatar from '@/components/character-avatar';
import type {WardrobeOutfit} from '@/lib/points-types';
import {spaceItem, type Room} from './catalog';
import {accessoryCatalog} from './shop-catalog';
import {supportsSharedWearables} from './new-pets';

export type Decorate = (slot: 'head' | 'neck', itemId: string | null) => Promise<void>;
export default function AccessoryPicker({room, outfit, owned, disabled, onChange}: {room: Room; outfit?: WardrobeOutfit; owned: string[]; disabled: boolean; onChange: Decorate}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const friend = spaceItem(room.pet);
  const canDress = supportsSharedWearables(room.pet);
  async function change(slot: 'head' | 'neck', itemId: string | null) {
    if (busy || disabled) return;
    setBusy(true); setError('');
    try {await onChange(slot, itemId);} catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  if (!canDress) return null;
  return <section className="ms-accessory-picker" aria-label="내 친구 액세서리"><h2>머리와 목 꾸미기</h2><p className="ms-hint">보유한 장식을 바로 골라요. 착용 중인 장식을 다시 누르면 벗어요.</p>
    {error && <p role="alert" className="ms-error">{error}</p>}
    <div className="ms-tiles">{accessoryCatalog.filter(item => canDress && owned.includes(item.id)).map(item => {
      const slot = item.slot as 'head' | 'neck', wearing = outfit?.[slot] === item.id;
      return <button type="button" key={item.id} disabled={busy || disabled} aria-pressed={wearing} aria-label={`${item.ko} ${wearing ? '벗기' : '착용하기'}`} onClick={() => void change(slot, wearing ? null : item.id)}>
        <span className="ms-clothes-preview"><CharacterAvatar character={friend?.base} imageSrc={friend?.art} outfit={{...outfit, [slot]: item.id}} spaceOutfit={room.outfit}/></span><span>{item.ko}</span>{wearing && <small>착용 중</small>}
      </button>;
    })}</div><p className="ms-hint">더 많은 모자·목 장식은 작은 상점의 액세서리에서 만나요.</p>
  </section>;
}
