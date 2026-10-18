'use client';
import {useEffect, useRef, useState} from 'react';
import {Check, Shell, X} from 'lucide-react';
import CharacterAvatar from '@/components/character-avatar';
import type {WardrobeOutfit} from '@/lib/points-types';
import {spaceCatalog, spaceItem, type Room, type SpaceKind, type SpaceItem} from './catalog';
import {ItemArt} from './scene';
import {spaceRequest} from './client';

const categories: [SpaceKind, string][] = [['pet', '동물 친구'], ['clothes', '옷과 가방'], ['furniture', '가구와 소품'], ['theme', '방 배경'], ['sticker', '다꾸 조각'], ['paper', '노트 배경']];
type Look = {pet: string; outfit: Room['outfit']; wardrobe?: WardrobeOutfit};
function Preview({item, pet, outfit, wardrobe}: Look & {item: SpaceItem}) {
  if (item.kind !== 'clothes') return <ItemArt id={item.id}/>;
  const friend = spaceItem(pet);
  return <CharacterAvatar character={friend?.base || 'cat'} imageSrc={friend?.art} outfit={wardrobe} spaceOutfit={{...outfit, [item.slot!]: item.id}} alt={`${friend?.buddyName || friend?.name || '내 친구'}의 ${item.name} 착용 모습`}/>;
}
function Confirmation({item, balance, owned, onClose, onBuy, onWear, busy, enabled, ...look}: Look & {
  item: SpaceItem; balance: number; owned: boolean; onClose: () => void; onBuy: () => void; onWear: () => void; busy: boolean; enabled: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {ref.current?.showModal();}, []);
  return <dialog className="ms-confirm" ref={ref} onCancel={e => {e.preventDefault(); if (!busy) onClose();}} aria-label={item.kind === 'clothes' ? '내 친구에게 미리 입혀 보기' : '보말로 구매하기'}>
    <button className="ms-close" disabled={busy} onClick={onClose} aria-label="구매 창 닫기"><X size={18}/></button>
    <div className="ms-confirm-art"><Preview item={item} {...look}/></div><h2>{item.name}</h2>
    {item.kind === 'clothes' && <p className="ms-preview-caption">내 친구에게 미리 입혀 본 모습이에요. 선택하기 전에는 저장되지 않아요.</p>}
    {owned ? <p>이미 내 보관함에 있어요. 다시 보말을 쓰지 않고 입을 수 있어요.</p> : <><p><Shell size={17}/>{item.price} 보말로 {item.kind === 'pet' ? '새 친구를 맞이할까요?' : '내 보관함에 담을까요?'}</p><p>{balance >= item.price ? `구매 후 ${balance - item.price} 보말이 남아요.` : `${item.price - balance} 보말을 더 모으면 구매할 수 있어요.`}</p><small>한 번 구매하면 모든 친구에게 반복해서 사용할 수 있어요.</small></>}
    <div className="ms-actions"><button disabled={busy} onClick={onClose}>다음에</button>{owned ? <button className="ms-primary" disabled={busy || !enabled} onClick={onWear}>이 모습으로 입기</button> : <button className="ms-primary" disabled={busy || !enabled || balance < item.price} onClick={onBuy}>{busy ? '친구가 담는 중…' : item.kind === 'clothes' ? '보말로 구매하고 입기' : '보말로 구매하기'}</button>}</div>
  </dialog>;
}
export default function SpaceShop({owned, balance, enabled, onBought, onWear, inventory = false, ...look}: Look & {
  owned: string[]; balance: number; enabled: boolean; onBought: () => Promise<void>; onWear: (itemId: string) => void; inventory?: boolean;
}) {
  const [kind, setKind] = useState<SpaceKind>('pet'), [preview, setPreview] = useState<SpaceItem | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const receipt = useRef({item: '', request: ''});
  const items = spaceCatalog.filter(i => i.kind === kind && (!inventory || owned.includes(i.id)));
  async function buy() {
    if (!preview || busy) return;
    const item = preview;
    setBusy(true); setError('');
    if (receipt.current.item !== item.id) receipt.current = {item: item.id, request: crypto.randomUUID()};
    try {
      await spaceRequest('/purchase', 'POST', {itemId: item.id, requestId: receipt.current.request});
      await onBought();
      receipt.current = {item: '', request: ''}; setPreview(null);
      if (item.kind === 'clothes') onWear(item.id);
      else setNotice(item.kind === 'pet' ? '새 친구가 우리 집에 왔어요! 내 친구에서 만나 봐요.' : '보관함에 담았어요! 마음껏 꾸며 봐요.');
    } catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  return <section className="ms-shop"><div className="ms-section-intro"><h2>{inventory ? '차곡차곡 내 보관함' : '모아의 작은 상점'}</h2><p>{inventory ? '내가 모은 취향을 꺼내 봐요. 옷은 여기에서 바로 입을 수 있어요.' : '내 친구에게 미리 입혀 보고 골라 봐요. 모든 구매는 보말로만 가능해요.'}</p></div>
    <div className="ms-categories" role="tablist" aria-label="상점 종류">{categories.map(([id, name]) => <button key={id} type="button" role="tab" aria-selected={kind === id} onClick={() => setKind(id)}>{name}</button>)}</div>
    {notice && <p className="ms-notice" role="status">{notice}</p>}{error && <p className="ms-error" role="alert">{error}</p>}
    <div className="ms-product-grid">{items.map(i => {
      const has = owned.includes(i.id), clothes = i.kind === 'clothes';
      return <article key={i.id} className={'ms-product kind-' + i.kind} data-item-id={i.id}>
        {clothes ? <button type="button" className="ms-product-art ms-try-on" aria-label={`${i.name} 미리 입어 보기`} onClick={() => setPreview(i)}><Preview item={i} {...look}/><span>미리 입어 보기</span></button> : <div className="ms-product-art"><ItemArt id={i.id}/></div>}
        <h3>{i.name}</h3><p>{has ? <><Check size={14}/>내 보관함에 있어요</> : <><Shell size={14}/>{i.price} 보말</>}</p>
        <button type="button" disabled={(has && !clothes) || !enabled || (!has && balance < i.price)} onClick={() => has && clothes ? onWear(i.id) : setPreview(i)}>{has ? clothes ? '입기' : '함께하는 중' : balance < i.price ? '조금 더 모아요' : i.kind === 'pet' ? '친구 맞이하기' : '내 보관함에 담기'}</button>
      </article>;
    })}</div>
    {!items.length && <p className="ms-empty">여기는 아직 비어 있어요. 상점에서 마음에 드는 조각을 만나 봐요.</p>}
    {preview && <Confirmation item={preview} balance={balance} owned={owned.includes(preview.id)} busy={busy} enabled={enabled} {...look} onClose={() => setPreview(null)} onBuy={() => void buy()} onWear={() => onWear(preview.id)}/>}
  </section>;
}
