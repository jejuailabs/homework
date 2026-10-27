'use client';
import {useEffect, useRef, useState} from 'react';
import {Check, Shell, X} from 'lucide-react';
import CharacterAvatar from '@/components/character-avatar';
import type {WardrobeOutfit} from '@/lib/points-types';
import {spaceItem, type Room} from './catalog';
import {shopCategories, shopCatalog, wearableItem, type ShopKind, type ShopItem} from './shop-catalog';
import {ItemArt} from './scene';
import {spaceRequest} from './client';
import {compatibleWearable} from './new-pets';
import {wardrobeGroups, petWardrobeGroup, groupFriends, previewFriend, friendName, itemFriends, type WardrobeGroupId} from './wardrobe-groups';
import {WardrobeBrowser, CompatibilityBadge, CompatibleFriends} from './wardrobe-browser';

type Look = {pet: string; outfit: Room['outfit']; wardrobe?: WardrobeOutfit; petName?: string};
function Preview({item, pet, outfit, wardrobe, petName}: Look & {item: ShopItem}) {
  if (!wearableItem(item)) return <ItemArt id={item.id}/>;
  const friend = spaceItem(pet);
  return <CharacterAvatar character={friend?.base || 'cat'} imageSrc={friend?.art} outfit={item.kind === 'accessory' ? {...wardrobe, [item.slot]: item.id} : wardrobe} spaceOutfit={item.kind === 'clothes' ? {...outfit, [item.slot!]: item.id} : outfit} alt={`${petName || friend?.buddyName || friend?.name || '내 친구'}의 ${item.name} 착용 모습`}/>;
}
function Confirmation({item, balance, owned, ownedPets, currentPet, currentName, onClose, onBuy, onWear, onMeet, onChooseFriend, busy, enabled, ...look}: Look & {
  item: ShopItem; balance: number; owned: boolean; ownedPets: string[]; currentPet: string; currentName: string;
  onClose: () => void; onBuy: () => void; onWear: () => void; onMeet: () => void; onChooseFriend: () => void; busy: boolean; enabled: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {ref.current?.showModal();}, []);
  const wearable = wearableItem(item), friends = itemFriends(item), canWearNow = !wearable || compatibleWearable(currentPet, item);
  const hasFriend = friends.some(pet => ownedPets.includes(pet.id));
  const model = spaceItem(look.pet);
  return <dialog className={`ms-confirm ${wearable ? 'has-wardrobe-friends' : ''}`} ref={ref} onCancel={e => {e.preventDefault(); if (!busy) onClose();}} aria-label={wearable ? '내 친구에게 미리 입혀 보기' : '보말로 구매하기'}>
    <button className="ms-close" disabled={busy} onClick={onClose} aria-label="구매 창 닫기"><X size={18}/></button>
    <div className="ms-confirm-art"><Preview item={item} {...look}/></div><h2>{item.name}</h2>
    {wearable && <p className="ms-preview-caption">{look.petName || (model ? friendName(model) : '친구')}에게 미리 입혀 본 모습이에요. 함께하는 친구는 바뀌지 않아요.</p>}
    {wearable && <p className="ms-wardrobe-sharing">{friends.length}명의 친구가 함께 입어요. 한 번만 구입하면 돼요.</p>}
    {wearable && !canWearNow && <><p className="ms-other-wardrobe">{currentName}는 이 옷장을 사용하지 않아요. {hasFriend ? '함께하는 다른 친구에게 입힐 수 있어요.' : '옷을 보관해 두었다가 이 옷장의 친구를 만나면 입힐 수 있어요.'}</p><button type="button" className="ms-meet-friends" disabled={busy} onClick={hasFriend ? onChooseFriend : onMeet}>{hasFriend ? '내 친구에서 함께할 친구 고르기' : '이 옷을 입을 친구 만나보기'}</button></>}
    {owned ? <p>이미 내 보관함에 있어요. 다시 보말을 쓰지 않아도 돼요.</p> : <><p><Shell size={17}/>{item.price} 보말로 {item.kind === 'pet' ? '새 친구를 맞이할까요?' : '내 보관함에 담을까요?'}</p><p>{balance >= item.price ? `구매 후 ${balance - item.price} 보말이 남아요.` : `${item.price - balance} 보말을 더 모으면 구매할 수 있어요.`}</p>{!wearable && <small>{item.kind === 'pet' ? '내 친구에서 함께할 친구를 골라요.' : '구매한 아이템은 계속 사용할 수 있어요.'}</small>}</>}
    <div className="ms-actions"><button disabled={busy} onClick={onClose}>다음에</button>{owned ? <button className="ms-primary" disabled={busy || !enabled} onClick={canWearNow ? onWear : hasFriend ? onChooseFriend : onMeet}>{canWearNow ? `${currentName}에게 입히기` : hasFriend ? '내 친구에서 골라 입히기' : '친구 만나보기'}</button> : <button className="ms-primary" disabled={busy || !enabled || balance < item.price} onClick={onBuy}>{busy ? '친구가 담는 중…' : wearable ? canWearNow ? `구매하고 ${currentName}에게 입히기` : '구매해서 보관하기' : '보말로 구매하기'}</button>}</div>
    {wearable && <CompatibleFriends friends={friends} owned={ownedPets}/>}
  </dialog>;
}
export default function SpaceShop({owned, wardrobeOwned, balance, enabled, onBought, onWear, onChooseFriend, inventory = false, ...look}: Look & {
  owned: string[]; wardrobeOwned: string[]; balance: number; enabled: boolean; onBought: () => Promise<void>;
  onWear: (itemId: string) => Promise<void> | void; onChooseFriend?: () => void; inventory?: boolean;
}) {
  const [kind, setKind] = useState<ShopKind>('pet'), [preview, setPreview] = useState<ShopItem | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [group, setGroup] = useState<WardrobeGroupId>(() => petWardrobeGroup(look.pet)), [modelId, setModelId] = useState(look.pet);
  const [petFilter, setPetFilter] = useState<WardrobeGroupId | null>(null), [storedGroup, setStoredGroup] = useState<WardrobeGroupId | null>(null);
  const receipt = useRef({item: '', request: ''});
  useEffect(() => {setGroup(petWardrobeGroup(look.pet)); setModelId(look.pet); setPreview(null); setStoredGroup(null);}, [look.pet]);
  const owns = (item: ShopItem) => (item.kind === 'accessory' ? wardrobeOwned : owned).includes(item.id);
  const model = previewFriend(group, look.pet, owned, modelId), active = spaceItem(look.pet);
  const currentName = look.petName || (active ? friendName(active) : '내 친구');
  const wardrobeOpen = kind === 'clothes' || kind === 'accessory';
  const previewLook = {...look, pet: model.id, petName: model.id === look.pet ? currentName : friendName(model)};
  const items = shopCatalog.filter(item => item.kind === kind && (!wearableItem(item) || compatibleWearable(model.id, item)) && (!inventory || owns(item)) && (kind !== 'pet' || !petFilter || petWardrobeGroup(item.id) === petFilter));
  function chooseGroup(next: WardrobeGroupId) {
    setGroup(next); setModelId(previewFriend(next, look.pet, owned).id); setPreview(null);
  }
  function meet(groupId = group) {setPreview(null); setStoredGroup(null); setKind('pet'); setPetFilter(groupId);}
  function chooseFriend() {setPreview(null); setStoredGroup(null); if (onChooseFriend) onChooseFriend(); else meet();}
  async function wear(item: ShopItem) {
    if (busy || !enabled || !compatibleWearable(look.pet, item)) return;
    setBusy(true); setError('');
    try {await onWear(item.id); setPreview(null);} catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  async function buy() {
    if (!preview || busy) return;
    const item = preview;
    setBusy(true); setError(''); setStoredGroup(null);
    if (receipt.current.item !== item.id) receipt.current = {item: item.id, request: crypto.randomUUID()};
    try {
      if (item.kind === 'accessory') {
        const response = await fetch('/api/points/purchase', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({itemId: item.id, requestId: receipt.current.request})});
        const result = await response.json(); if (!response.ok) throw new Error(result.error || '잠시 후 다시 시도해 주세요.');
      } else await spaceRequest('/purchase', 'POST', {itemId: item.id, requestId: receipt.current.request});
      await onBought();
      receipt.current = {item: '', request: ''}; setPreview(null);
      if (wearableItem(item) && compatibleWearable(look.pet, item)) await onWear(item.id);
      else if (wearableItem(item)) {setStoredGroup(group); setNotice('내 보관함에 담았어요. 이 옷장의 친구와 함께할 때 입힐 수 있어요.');}
      else setNotice(item.kind === 'pet' ? '새 친구가 우리 집에 왔어요! 내 친구에서 만나 봐요.' : '보관함에 담았어요! 마음껏 꾸며 봐요.');
    } catch (e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  return <section className="ms-shop"><div className="ms-section-intro"><h2>{inventory ? '차곡차곡 내 보관함' : '모아의 작은 상점'}</h2><p>{inventory ? '친구의 옷장을 골라 내가 모은 옷과 장식을 꺼내 봐요.' : '내 친구에게 미리 입혀 보고 골라 봐요. 모든 구매는 보말로만 가능해요.'}</p></div>
    <div className="ms-categories" role="tablist" aria-label="상점 종류">{shopCategories.map(([id, name]) => <button key={id} type="button" role="tab" aria-selected={kind === id} onClick={() => {setKind(id); setPetFilter(null);}}>{name}</button>)}</div>
    {wardrobeOpen && <WardrobeBrowser group={group} model={model} currentName={currentName} currentPet={look.pet} owned={owned} onGroup={chooseGroup} onModel={setModelId}/>}
    {kind === 'pet' && petFilter && <div className="ms-pet-filter"><span>{wardrobeGroups.find(g => g.id === petFilter)?.name}를 만나 봐요</span><button type="button" onClick={() => setPetFilter(null)}>전체 친구 보기</button></div>}
    {notice && <p className="ms-notice" role="status">{notice}</p>}
    {storedGroup && <div className="ms-shop-followup"><button type="button" onClick={groupFriends(storedGroup).some(p => owned.includes(p.id)) ? chooseFriend : () => meet(storedGroup)}>{groupFriends(storedGroup).some(p => owned.includes(p.id)) ? '내 친구에서 골라 입히기' : '이 옷을 입을 친구 만나보기'}</button></div>}
    {error && <p className="ms-error" role="alert">{error}</p>}
    <div className="ms-product-grid">{items.map(item => {
      const has = owns(item), wearable = wearableItem(item), canWearNow = compatibleWearable(look.pet, item);
      return <article key={item.id} className={'ms-product kind-' + item.kind} data-item-id={item.id}>
        {wearable ? <button type="button" className="ms-product-art ms-try-on" aria-label={`${item.name} 미리 입어 보기`} onClick={() => setPreview(item)}><Preview item={item} {...previewLook}/><span>미리 입어 보기</span></button> : <div className="ms-product-art"><ItemArt id={item.id}/></div>}
        <h3>{item.name}</h3>
        {wearable && <CompatibilityBadge friends={itemFriends(item)} name={item.name} onClick={() => setPreview(item)}/>}
        <p>{has ? <><Check size={14}/>내 보관함에 있어요</> : <><Shell size={14}/>{item.price} 보말</>}</p>
        <button type="button" disabled={busy || (has && !wearable) || !enabled || (!has && balance < item.price)} onClick={() => has && wearable && canWearNow ? void wear(item) : setPreview(item)}>{has ? wearable ? canWearNow ? `${currentName}에게 입히기` : '입을 수 있는 친구 보기' : '함께하는 중' : balance < item.price ? '조금 더 모아요' : item.kind === 'pet' ? '친구 맞이하기' : '내 보관함에 담기'}</button>
      </article>;
    })}</div>
    {!items.length && <p className="ms-empty">{inventory ? '이 옷장에는 보유한 아이템이 아직 없어요. 다른 옷장도 구경해 보세요.' : '여기는 아직 비어 있어요. 상점에서 마음에 드는 조각을 만나 봐요.'}</p>}
    {preview && <Confirmation item={preview} balance={balance} owned={owns(preview)} ownedPets={owned} currentPet={look.pet} currentName={currentName} busy={busy} enabled={enabled} {...previewLook} onClose={() => setPreview(null)} onBuy={() => void buy()} onWear={() => void wear(preview)} onMeet={() => meet()} onChooseFriend={chooseFriend}/>}
  </section>;
}
