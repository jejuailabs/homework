'use client';
import {useEffect, useRef, useState} from 'react';
import {Check, Shell, X} from 'lucide-react';
import CharacterAvatar from '@/components/character-avatar';
import type {WardrobeOutfit} from '@/lib/points-types';
import {spaceItem, type Room} from './catalog';
import {shopCategories, shopCatalog, wearableItem, type ShopKind, type ShopItem} from './shop-catalog';
import {ItemArt} from './scene';
import {spaceRequest} from './client';
import {compatibleWearable, newPet} from './new-pets';

type Look = {pet: string; outfit: Room['outfit']; wardrobe?: WardrobeOutfit};
function Preview({item, pet, outfit, wardrobe}: Look & {item: ShopItem}) {
  if (!wearableItem(item)) return <ItemArt id={item.id}/>;
  const friend = spaceItem(pet);
  return <CharacterAvatar character={friend?.base || 'cat'} imageSrc={friend?.art} outfit={item.kind === 'accessory' ? {...wardrobe, [item.slot]: item.id} : wardrobe} spaceOutfit={item.kind === 'clothes' ? {...outfit, [item.slot!]: item.id} : outfit} alt={`${friend?.buddyName || friend?.name || '내 친구'}의 ${item.name} 착용 모습`}/>;
}
function Confirmation({item, balance, owned, onClose, onBuy, onWear, busy, enabled, ...look}: Look & {
  item: ShopItem; balance: number; owned: boolean; onClose: () => void; onBuy: () => void; onWear: () => void; busy: boolean; enabled: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {ref.current?.showModal();}, []);
  return <dialog className="ms-confirm" ref={ref} onCancel={e => {e.preventDefault(); if (!busy) onClose();}} aria-label={wearableItem(item) ? '내 친구에게 미리 입혀 보기' : '보말로 구매하기'}>
    <button className="ms-close" disabled={busy} onClick={onClose} aria-label="구매 창 닫기"><X size={18}/></button>
    <div className="ms-confirm-art"><Preview item={item} {...look}/></div><h2>{item.name}</h2>
    {wearableItem(item) && <p className="ms-preview-caption">내 친구에게 미리 입혀 본 모습이에요. 선택하기 전에는 저장되지 않아요.</p>}
    {owned ? <p>이미 내 보관함에 있어요. 다시 보말을 쓰지 않고 입을 수 있어요.</p> : <><p><Shell size={17}/>{item.price} 보말로 {item.kind === 'pet' ? '새 친구를 맞이할까요?' : '내 보관함에 담을까요?'}</p><p>{balance >= item.price ? `구매 후 ${balance - item.price} 보말이 남아요.` : `${item.price - balance} 보말을 더 모으면 구매할 수 있어요.`}</p><small>{item.kind === 'pet' ? '내 친구에서 함께할 친구를 골라요.' : '구매한 아이템은 착용 가능한 친구에게 계속 사용할 수 있어요.'}</small></>}
    <div className="ms-actions"><button disabled={busy} onClick={onClose}>다음에</button>{owned ? <button className="ms-primary" disabled={busy || !enabled} onClick={onWear}>이 모습으로 입기</button> : <button className="ms-primary" disabled={busy || !enabled || balance < item.price} onClick={onBuy}>{busy ? '친구가 담는 중…' : wearableItem(item) ? '보말로 구매하고 입기' : '보말로 구매하기'}</button>}</div>
  </dialog>;
}
export default function SpaceShop({owned, wardrobeOwned, balance, enabled, onBought, onWear, inventory = false, ...look}: Look & {
  owned: string[]; wardrobeOwned: string[]; balance: number; enabled: boolean; onBought: () => Promise<void>; onWear: (itemId: string) => Promise<void> | void; inventory?: boolean;
}) {
  const [kind, setKind] = useState<ShopKind>('pet'), [preview, setPreview] = useState<ShopItem | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const receipt = useRef({item: '', request: ''});
  const owns = (item: ShopItem) => (item.kind === 'accessory' ? wardrobeOwned : owned).includes(item.id);
  const isJunior = !!newPet(look.pet);
  const items = shopCatalog.filter(i => i.kind === kind && (!wearableItem(i) || compatibleWearable(look.pet, i)) && (!inventory || owns(i)));
  async function wear(item: ShopItem) {
    if (busy || !enabled) return;
    setBusy(true); setError('');
    try {await onWear(item.id); setPreview(null);} catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  async function buy() {
    if (!preview || busy) return;
    const item = preview;
    setBusy(true); setError('');
    if (receipt.current.item !== item.id) receipt.current = {item: item.id, request: crypto.randomUUID()};
    try {
      if (item.kind === 'accessory') {
        const response = await fetch('/api/points/purchase', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({itemId: item.id, requestId: receipt.current.request})});
        const result = await response.json(); if (!response.ok) throw new Error(result.error || '잠시 후 다시 시도해 주세요.');
      } else await spaceRequest('/purchase', 'POST', {itemId: item.id, requestId: receipt.current.request});
      await onBought();
      receipt.current = {item: '', request: ''}; setPreview(null);
      if (wearableItem(item)) await onWear(item.id);
      else setNotice(item.kind === 'pet' ? '새 친구가 우리 집에 왔어요! 내 친구에서 만나 봐요.' : '보관함에 담았어요! 마음껏 꾸며 봐요.');
    } catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  return <section className="ms-shop"><div className="ms-section-intro"><h2>{inventory ? '차곡차곡 내 보관함' : '모아의 작은 상점'}</h2><p>{inventory ? '내가 모은 취향을 꺼내 봐요. 옷은 여기에서 바로 입을 수 있어요.' : '내 친구에게 미리 입혀 보고 골라 봐요. 모든 구매는 보말로만 가능해요.'}</p></div>
    <div className="ms-categories" role="tablist" aria-label="상점 종류">{shopCategories.map(([id, name]) => <button key={id} type="button" role="tab" aria-selected={kind === id} onClick={() => setKind(id)}>{name}</button>)}</div>
    {isJunior && <p className="ms-hint">보송 옷과 장식은 새 친구 10종이 함께 써요. 한 번 구매하면 다른 보송 친구에게도 입힐 수 있어요.</p>}{notice && <p className="ms-notice" role="status">{notice}</p>}{error && <p className="ms-error" role="alert">{error}</p>}
    <div className="ms-product-grid">{items.map(i => {
      const has = owns(i), clothes = wearableItem(i);
      return <article key={i.id} className={'ms-product kind-' + i.kind} data-item-id={i.id}>
        {clothes ? <button type="button" className="ms-product-art ms-try-on" aria-label={`${i.name} 미리 입어 보기`} onClick={() => setPreview(i)}><Preview item={i} {...look}/><span>미리 입어 보기</span></button> : <div className="ms-product-art"><ItemArt id={i.id}/></div>}
        <h3>{i.name}</h3><p>{has ? <><Check size={14}/>내 보관함에 있어요</> : <><Shell size={14}/>{i.price} 보말</>}</p>
        <button type="button" disabled={busy || (has && !clothes) || !enabled || (!has && balance < i.price)} onClick={() => has && clothes ? void wear(i) : setPreview(i)}>{has ? clothes ? '입기' : '함께하는 중' : balance < i.price ? '조금 더 모아요' : i.kind === 'pet' ? '친구 맞이하기' : '내 보관함에 담기'}</button>
      </article>;
    })}</div>
    {!items.length && <p className="ms-empty">{inventory ? '보유한 아이템이 아직 없어요. 작은 상점에서 이 친구에게 맞는 옷과 장식을 만나 봐요.' : '여기는 아직 비어 있어요. 상점에서 마음에 드는 조각을 만나 봐요.'}</p>}
    {preview && <Confirmation item={preview} balance={balance} owned={owns(preview)} busy={busy} enabled={enabled} {...look} onClose={() => setPreview(null)} onBuy={() => void buy()} onWear={() => void wear(preview)}/>}
  </section>;
}
