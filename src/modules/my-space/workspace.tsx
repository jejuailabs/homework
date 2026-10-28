'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookHeart, Home, Heart, Package, Shell, ShoppingBag, RefreshCw } from 'lucide-react';
import {wardrobeCatalog, type PointSettings, type WardrobeOutfit} from '@/lib/points-types';
import type { Room } from './catalog';
import {accessoryCatalog} from './shop-catalog';
import {whitekneeItemCompatible} from './whiteknee';
import RoomEditor from './room-editor';
import SpaceShop from './shop';
import Diary from './diary';
import { spaceRequest } from './client';
import {notifyPointsChanged, usePointSync} from '@/lib/use-point-sync';
import './styles.css';
type State = {
    settings: PointSettings;
    profile: {
        name: string;
        character: string;
        points: number;
        earned: number;
        xp: number;
        adopted: Record<string, number>;
        wardrobe?: WardrobeOutfit;
        wardrobeOwned: string[];
    };
    owned: string[];
    room: Room;
};
type Tab = 'room' | 'friends' | 'shop' | 'diary' | 'inventory';
const tabs: [
    Tab,
    string,
    typeof Home
][] = [['room', '내 방', Home], ['friends', '내 친구', Heart], ['shop', '작은 상점', ShoppingBag], ['diary', '다꾸 노트', BookHeart], ['inventory', '보관함', Package]];
export default function MySpace() {
    const [state, setState] = useState<State | null>(null), [tab, setTab] = useState<Tab>('room'), [seenDiary, setSeenDiary] = useState(false), [error, setError] = useState('');
    const [wearRequest, setWearRequest] = useState<{itemId: string; token: string} | null>(null);
    async function decorate(slot: 'head' | 'neck' | 'face', itemId: string | null) {
        const response = await fetch('/api/points/equip', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({slot, itemId})});
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '장식을 다시 골라 주세요.');
        setState(current => current ? {...current, profile: {...current.profile, wardrobe: result.outfit}} : current);
        window.dispatchEvent(new Event('my-space-changed'));
    }
    const wear = async (itemId: string) => {
        const accessory = accessoryCatalog.find(item => item.id === itemId);
        if (accessory) await decorate(accessory.slot as 'head' | 'neck' | 'face', itemId);
        else setWearRequest({itemId, token: crypto.randomUUID()});
        setTab('friends');
    };
    const load = useCallback(async () => { try {
        const r = await spaceRequest<State>();
        setState(r);
        setError('');
    }
    catch (e) {
        setError((e as Error).message);
    } }, []);
    useEffect(() => { void load(); }, [load]);
    usePointSync(value => setState(current => current ? {...current, settings: value.settings, profile: {...current.profile, points: value.points, earned: value.earned}} : current), !!state);
    if (!state)
        return <main className="ms-page"><div className="ms-loading"><img src="/characters/otter-moa.webp" alt=""/><p role="status">{error || '모아가 방에 햇살을 들이는 중이에요…'}</p>{error && <button onClick={() => void load()}>다시 만나기</button>}</div></main>;
    const enabled = state.settings.enabled;
    return <main className="ms-page"><Link className="ms-back" href="/student"><ArrowLeft size={16}/>내 교실</Link><header className="ms-heading"><div><span>친구와 함께, 나의 취향이 자라는 곳</span><h1>{state.profile.name}의 작은 세상</h1><p>오늘의 작은 노력이 내 방에 반짝이는 조각으로.</p></div><div className="ms-wallet"><Shell size={25}/><button type="button" className="ms-wallet-refresh" aria-label={`보말 ${state.profile.points}개, 새로고침`} title="새로 받은 보말 확인" onClick={()=>void load()}><strong>{state.profile.points.toLocaleString()}</strong><RefreshCw size={12}/></button><span>보말</span><small>지금까지 {state.profile.earned.toLocaleString()}보말을 모았어요</small></div></header><nav className="ms-nav" aria-label="나의 작은 세상 메뉴">{tabs.map(([id, label, Icon]) => <button type="button" key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); if (id === 'diary')
        setSeenDiary(true); }}><Icon size={19}/><span>{label}</span></button>)}</nav>{error && <p role="alert" className="ms-error">{error}</p>}{!enabled && <p className="ms-notice">꾸미기 방이 잠시 쉬고 있어요. 선생님이 보말 꾸미기를 켜면 편집과 구매를 할 수 있어요. 모은 물건과 기록은 그대로 남아요.</p>}
 <div hidden={tab !== 'room' && tab !== 'friends'}><RoomEditor onDecorate={decorate} wearRequest={wearRequest} initial={state.room} owned={state.owned} profile={state.profile} enabled={enabled} mode={tab === 'friends' ? 'friends' : 'room'} onSaved={room => { setState(s => s ? {...s, room, profile: {...s.profile, wardrobe: Object.fromEntries(Object.entries(s.profile.wardrobe || {}).filter(([slot, id]) => {const item = wardrobeCatalog.find(entry => entry.id === id && entry.slot === slot); return !!item && whitekneeItemCompatible(room.pet, item);}))}} : s); window.dispatchEvent(new Event('my-space-changed')); }}/></div>
 {tab === 'shop' && <SpaceShop pet={state.room.pet} outfit={state.room.outfit} pose={state.room.pose} wardrobe={state.profile.wardrobe} onWear={wear} wardrobeOwned={state.profile.wardrobeOwned} owned={state.owned} balance={state.profile.points} enabled={enabled} onBought={async () => {await load(); notifyPointsChanged(); }}/>}{tab === 'inventory' && <SpaceShop inventory pet={state.room.pet} outfit={state.room.outfit} pose={state.room.pose} wardrobe={state.profile.wardrobe} onWear={wear} wardrobeOwned={state.profile.wardrobeOwned} owned={state.owned} balance={state.profile.points} enabled={enabled} onBought={async () => {await load(); notifyPointsChanged(); }}/>}
 {seenDiary && <div hidden={tab !== 'diary'}><Diary owned={state.owned} enabled={enabled}/></div>}<footer className="ms-footer"><img src="/characters/otter-moa.webp" alt=""/><p>물건을 사도 함께 자란 기억은 줄어들지 않아요.<br /><small>모든 구매는 보말로만 · 구매 내역은 기존 옷장에서 확인해요.</small></p><Link href="/student/shop">보말 내역·장식 옷장 →</Link></footer></main>;
}
