'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { WardrobeOutfit } from '@/lib/points-types';
import Buddy, { Clothes } from './buddy';
import Scene, { ItemArt } from './scene';
import { spaceCatalog, spaceItem, type Room } from './catalog';
import { useDraft } from './use-draft';
import { spaceRequest } from './client';
import { SaveStatus, LayerTools } from './editor-tools';
import { petPersonality, friendBase } from './personality';
import AccessoryPicker, {type Decorate} from './accessory-picker';
export default function RoomEditor({ initial, owned, profile, enabled, mode, onSaved, wearRequest, onDecorate }: {
    initial: Room;
    owned: string[];
    profile: {
        earned: number;
        adopted: Record<string, number>;
        wardrobe?: WardrobeOutfit;
        wardrobeOwned: string[];
    };
    enabled: boolean;
    mode: 'room' | 'friends';
    onSaved: (room: Room) => void;
    wearRequest?: {itemId: string; token: string} | null;
    onDecorate: Decorate;
}) {
    const editor = useDraft(initial, async (value) => { const result = await spaceRequest<{
        room: Room;
    }>('/room', 'PUT', value); onSaved(result.room); return result.room; }, enabled), [selected, setSelected] = useState(''), r = editor.draft, item = spaceItem(r.pet)!, persona = petPersonality(r.pet);
    const furniture = spaceCatalog.filter(i => i.kind === 'furniture' && owned.includes(i.id));
    const wornRequest = useRef('');
    useEffect(() => {
        if (!wearRequest || wornRequest.current === wearRequest.token || !enabled || !owned.includes(wearRequest.itemId)) return;
        const garment = spaceItem(wearRequest.itemId);
        if (garment?.kind !== 'clothes' || !garment.slot) return;
        wornRequest.current = wearRequest.token;
        editor.edit({...editor.draft, outfit: {...editor.draft.outfit, [garment.slot]: garment.id}});
    }, [wearRequest, owned, enabled]);
    return <section className="ms-room-editor"><SaveStatus editor={editor} onReload={() => { if (confirm('저장하지 않은 꾸미기를 내려놓고 다시 불러올까요?')) {
        editor.discard();
        location.reload();
    } }}/>{mode === 'room' ? <div className="ms-room-layout"><div><Scene onGestureStart={editor.begin} onGestureEnd={editor.end} layers={r.placements} onChange={placements => editor.edit({ ...r, placements })} selected={selected} onSelect={setSelected} background={spaceItem(r.theme)?.art} paper={r.theme} disabled={!enabled}><div className="ms-room-friend"><Buddy pet={r.pet} name={r.nicknames[r.pet]} earned={profile.earned} adopted={profile.adopted[r.pet] || 0} outfit={r.outfit} wardrobe={profile.wardrobe} small/></div><span className="ms-room-nameplate">{r.nicknames[r.pet] || item?.name}의 작은 방</span></Scene><LayerTools layers={r.placements} selected={selected} onChange={placements => editor.edit({ ...r, placements })} disabled={!enabled}/><p className="ms-hint">물건을 손가락으로 옮겨 봐요. 구매한 가구는 다시 배치해도 보말이 들지 않아요.</p></div><aside className="ms-inventory"><h2>방에 놓아 볼까?</h2><div className="ms-tiles">{furniture.map(i => <button type="button" key={i.id} disabled={!enabled || r.placements.length >= 40} onClick={() => { const id = crypto.randomUUID(); editor.edit({ ...r, placements: [...r.placements, { id, itemId: i.id, x: 50, y: 70, size: i.id === 'plant' ? 20 : 32, rotation: 0, flip: false }] }); setSelected(id); }}><ItemArt id={i.id}/><span>{i.name}</span></button>)}</div><label>창밖과 방 분위기<select aria-label="창밖과 방 분위기" value={r.theme} disabled={!enabled} onChange={e => editor.edit({ ...r, theme: e.target.value })}>{spaceCatalog.filter(i => i.kind === 'theme' && owned.includes(i.id)).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label><p>더 많은 가구는 상점에서 만나요.</p></aside></div> : <div className="ms-friends-layout"><div className="ms-friend-card"><Buddy pet={r.pet} name={r.nicknames[r.pet]} earned={profile.earned} adopted={profile.adopted[r.pet] || 0} outfit={r.outfit} wardrobe={profile.wardrobe}/><p>{persona.trait}</p><label>내가 지어 준 이름<input aria-label="내가 지어 준 이름" value={r.nicknames[r.pet] || ''} placeholder={item?.name} maxLength={20} disabled={!enabled} onChange={e => editor.edit({ ...r, nicknames: { ...r.nicknames, [r.pet]: e.target.value } })}/></label><small>성장은 함께한 활동과 누적 획득 보말로 자라요. 물건을 사도 줄어들지 않아요.</small></div><div className="ms-inventory"><h2>함께하는 친구들</h2><div className="ms-tiles ms-pet-picker">{spaceCatalog.filter(i => i.kind === 'pet' && owned.includes(i.id)).map(i => <button key={i.id} type="button" disabled={!enabled} aria-pressed={r.pet === i.id} onClick={() => editor.edit({ ...r, pet: i.id })}><ItemArt id={i.id}/><span>{i.name}</span></button>)}</div><h2>오늘은 어떤 옷?</h2><div className="ms-tiles">{spaceCatalog.filter(i => i.kind === 'clothes' && owned.includes(i.id)).map(i => <button key={i.id} type="button" disabled={!enabled} aria-pressed={r.outfit[i.slot!] === i.id} onClick={() => { const outfit = { ...r.outfit }; if (outfit[i.slot!] === i.id)
        delete outfit[i.slot!];
    else
        outfit[i.slot!] = i.id; editor.edit({ ...r, outfit }); }}><Clothes id={i.id} pet={r.pet}/><span>{i.name}</span></button>)}</div><p className="ms-hint">입은 옷을 다시 누르면 벗어요.</p><AccessoryPicker room={r} outfit={profile.wardrobe} owned={profile.wardrobeOwned} disabled={!enabled} onChange={onDecorate}/><Link href="/student/shop">기존 장식 옷장 열기 →</Link></div></div>}</section>;
}
