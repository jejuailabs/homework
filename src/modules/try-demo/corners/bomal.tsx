'use client';
import {useMemo, useState} from 'react';
import {Check, Shell, Sparkles} from 'lucide-react';
import CharacterAvatar from '@/components/character-avatar';
import Buddy, {Clothes} from '@/modules/my-space/buddy';
import Scene, {ItemArt} from '@/modules/my-space/scene';
import {illustratedRoomThemes, spaceCatalog, spaceItem, type Placement, type SpaceItem} from '@/modules/my-space/catalog';
import {isCompletePet} from '@/modules/my-space/complete-outfits';
import {isWhiteknee} from '@/modules/my-space/whiteknee';
import {compatibleWearable} from '@/modules/my-space/new-pets';
import '@/modules/my-space/styles.css';
import '@/modules/my-space/whiteknee.css';
import {students} from '../data';

// The real shop catalog and the real room and friend views. Buying here only changes this screen.
type Tab = 'pet' | 'clothes' | 'theme' | 'furniture';
const TABS: [Tab, string][] = [['pet', '동물 친구'], ['clothes', '옷'], ['theme', '방 배경'], ['furniture', '가구와 소품']];
const REASONS = ['발표를 또박또박 했어요', '친구를 도와줬어요', '숙제를 정성껏 했어요', '교실 정리를 먼저 했어요'];
const SPOTS: [number, number, number][] = [[22, 66, 30], [78, 64, 28], [30, 84, 20], [72, 86, 20], [50, 52, 24], [14, 84, 18]];
const pets = spaceCatalog.filter(i => i.kind === 'pet' && i.art && !isWhiteknee(i.id) && !isCompletePet(i.id));
const themes = [spaceItem('theme-sage')!, ...illustratedRoomThemes];
const furniture = spaceCatalog.filter(i => i.kind === 'furniture');
const hero = students[0];

export default function BomalCorner() {
  const [balance, setBalance] = useState(hero.bomal), [reason, setReason] = useState(REASONS[0]), [log, setLog] = useState<{reason: string; amount: number}[]>([{reason: '봄 그림전 작품 승인', amount: 10}]);
  const [tab, setTab] = useState<Tab>('pet'), [owned, setOwned] = useState<string[]>(['friend-cat', 'theme-sage', 'rug']);
  const [pet, setPet] = useState('friend-cat'), [body, setBody] = useState(''), [theme, setTheme] = useState('theme-sage');
  const [placements, setPlacements] = useState<Placement[]>([{id: 'starter-rug', itemId: 'rug', x: 48, y: 76, size: 36, rotation: 0, flip: false}]);
  const [selected, setSelected] = useState(''), [flash, setFlash] = useState('');
  const clothes = useMemo(() => spaceCatalog.filter(i => i.kind === 'clothes' && i.slot === 'body' && compatibleWearable(pet, i)).slice(0, 8), [pet]);
  const items: SpaceItem[] = tab === 'pet' ? pets : tab === 'clothes' ? clothes : tab === 'theme' ? themes : furniture;
  const say = (text: string) => {setFlash(text); window.setTimeout(() => setFlash(current => current === text ? '' : current), 2600);};

  function praise() {
    setBalance(b => b + 5); setLog(old => [{reason, amount: 5}, ...old].slice(0, 4));
    say(`${hero.name}에게 보말 5개를 줬어요`);
  }
  function use(item: SpaceItem) {
    if (item.kind === 'pet') {setPet(item.id); if (body && !compatibleWearable(item.id, spaceItem(body)!)) setBody('');}
    else if (item.kind === 'clothes') setBody(current => current === item.id ? '' : item.id);
    else if (item.kind === 'theme') setTheme(item.id);
    else setPlacements(old => {
      if (old.some(p => p.itemId === item.id)) return old.filter(p => p.itemId !== item.id);
      const [x, y, size] = SPOTS[old.length % SPOTS.length];
      return [...old, {id: 'demo-' + item.id, itemId: item.id, x, y, size, rotation: 0, flip: false}];
    });
  }
  function pick(item: SpaceItem) {
    if (!owned.includes(item.id)) {
      if (balance < item.price) {say(`보말이 ${item.price - balance}개 모자라요. 왼쪽에서 칭찬 보말을 받아 보세요`); return;}
      setBalance(b => b - item.price); setOwned(old => [...old, item.id]);
      say(item.price ? `${item.name} · 보말 ${item.price}개로 샀어요` : `${item.name}을(를) 골랐어요`);
    }
    use(item);
  }
  const active = (item: SpaceItem) => item.kind === 'pet' ? pet === item.id : item.kind === 'clothes' ? body === item.id : item.kind === 'theme' ? theme === item.id : placements.some(p => p.itemId === item.id);
  const friend = spaceItem(pet);

  return <div className="try-bomal">
    <section className="try-card try-teacher" aria-label="선생님 화면">
      <p className="try-role">선생님 화면</p>
      <h2>칭찬과 함께 보말 주기</h2>
      <p className="try-note">보말은 우리 반 칭찬 포인트예요. 준 까닭이 기록으로 남아요.</p>
      <div className="try-roster">{students.slice(0, 6).map(s => <span key={s.id} className={s.id === hero.id ? 'on' : ''}><CharacterAvatar character={s.character} alt=""/><small>{s.number}. {s.name}</small></span>)}</div>
      <fieldset className="try-reasons"><legend>{hero.name}에게 주는 까닭</legend>{REASONS.map(r => <label key={r}><input type="radio" name="try-reason" checked={reason === r} onChange={() => setReason(r)}/>{r}</label>)}</fieldset>
      <button type="button" className="button primary" onClick={praise}><Shell size={17}/>보말 5개 주기</button>
      <ul className="try-log" aria-label="최근 보말 기록">{log.map((entry, i) => <li key={i}><span>{entry.reason}</span><strong>+{entry.amount}</strong></li>)}</ul>
    </section>

    <section className="try-card try-student" aria-label="학생 화면">
      <p className="try-role">{hero.name} 학생 화면</p>
      <div className="try-wallet"><h2>나의 작은 세상</h2><span className="try-balance" aria-live="polite"><Shell size={18}/>보말 {balance}</span></div>
      <div className="try-room">
        <Scene layers={placements} onChange={setPlacements} selected={selected} onSelect={setSelected} background={spaceItem(theme)?.art} paper={theme} selectionOnTop>
          <div className="ms-room-friend" inert><Buddy pet={pet} earned={140} adopted={140} outfit={body ? {body} : {}} presentation="scene" small/></div>
          <span className="ms-room-nameplate">{friend?.buddyName || friend?.name}의 작은 방</span>
        </Scene>
        <p className="try-note">가구는 손가락이나 마우스로 옮길 수 있어요.</p>
      </div>
      <p className="try-flash" role="status">{flash && <><Sparkles size={15}/>{flash}</>}</p>
      <div className="try-tabs try-shop-tabs" role="tablist" aria-label="작은 상점">{TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}><strong>{label}</strong></button>)}</div>
      <div className="try-shop">{items.map(item => {
        const mine = owned.includes(item.id), on = active(item);
        return <button key={item.id} type="button" className={`try-item${on ? ' on' : ''}`} aria-pressed={on} onClick={() => pick(item)}>
          <span className={`try-item-art kind-${item.kind}`}>{item.kind === 'clothes' ? <Clothes id={item.id} pet={pet}/> : item.kind === 'furniture' ? <ItemArt id={item.id}/> : <img src={item.previewArt || item.art} alt="" loading="lazy"/>}</span>
          <strong>{item.kind === 'pet' ? item.buddyName || item.name : item.name}</strong>
          <small>{on ? <><Check size={13}/>쓰는 중</> : mine ? '가지고 있어요' : item.price ? <><Shell size={12}/>{item.price}</> : '기본'}</small>
        </button>;
      })}</div>
    </section>
  </div>;
}
