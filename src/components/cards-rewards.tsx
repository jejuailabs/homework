'use client';
import Link from 'next/link';
import {useEffect, useState} from 'react';
import {Gift, RotateCw} from 'lucide-react';
import {useCardsFamilyCopy} from '@/lib/cards-family-copy';
import '@/styles/cards-family.css';

type RewardSettings = {rewardsEnabled: boolean; pointsEnabled: boolean; label: string; amounts: {study: number; goal: number}};
type Reward = {id: string; kind: 'study' | 'goal'; amount: number; at: string};
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {...init, cache: 'no-store', headers: {'Content-Type': 'application/json'}});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'request failed');
  return data as T;
}

/** 우리 반 학습 기본값 안의 카드놀이 보말 스위치. 바로 저장되고 학습 기본값의 [저장]과는 따로다. */
export function CardsRewardToggle({classId}: {classId: string}) {
  const {copy: c, fill} = useCardsFamilyCopy();
  const [value, setValue] = useState<RewardSettings | null>(null), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
  const path = `/api/cards/classes/${encodeURIComponent(classId)}/rewards`;
  useEffect(() => {let alive = true; request<RewardSettings>(path).then(data => {if (alive) setValue(data);}).catch(() => {if (alive) setError(c.rewardError);}); return () => {alive = false;};}, [path, c]);
  async function toggle(next: boolean) {
    setBusy(true); setStatus(''); setError('');
    try {setValue(await request<RewardSettings>(path, {method: 'PATCH', body: JSON.stringify({rewardsEnabled: next})})); setStatus(c.rewardSaved);} catch {setError(c.rewardError);} finally {setBusy(false);}
  }
  return <section className="cards-reward-settings" aria-labelledby={`card-reward-${classId}`}>
    <h3 id={`card-reward-${classId}`}><Gift size={17}/>{c.rewardTitle}</h3>
    <label className="cards-check"><input type="checkbox" checked={!!value?.rewardsEnabled} disabled={!value || busy} onChange={event => void toggle(event.target.checked)}/>{c.rewardToggle}</label>
    <p className="cards-muted">{fill('rewardRule', {study: value?.amounts.study ?? 5, goal: value?.amounts.goal ?? 10})} {c.rewardSeparate}</p>
    {value && value.rewardsEnabled && !value.pointsEnabled && <p className="cards-muted">{c.rewardPointsOff} <Link className="cards-text-link" href="/teacher/points">{c.rewardPointsLink}</Link></p>}
    {status && <p role="status" className="cards-muted">{status}</p>}{error && <p role="alert" className="cards-error">{error}</p>}
  </section>;
}

const seenKey = (reward: Reward) => `cards-reward-seen:${reward.id}`;
function seen(reward: Reward) {try {return localStorage.getItem(seenKey(reward)) === '1';} catch {return false;}}
/**
 * 보상 순간: 복습하기의 카드 뒤집기처럼, 새 보말을 받은 학생에게 카드 한 장을 보여 준다. 누르면 뒤집혀 보말 수가 나온다.
 * `watch`가 바뀔 때(필수 학습 완료·목표 달성) 서버의 고정 영수증을 다시 읽는다. 한 번 본 보상은 이 기기에서 다시 띄우지 않는다.
 */
export function CardRewardMoment({distributionId, watch}: {distributionId: string; watch: string}) {
  const {copy: c, fill} = useCardsFamilyCopy();
  const [queue, setQueue] = useState<Reward[]>([]), [label, setLabel] = useState(''), [flipped, setFlipped] = useState(false);
  useEffect(() => {
    let alive = true;
    request<{label: string; rewards: Reward[]}>(`/api/cards/distributions/${encodeURIComponent(distributionId)}/rewards`).then(data => {if (alive) {setLabel(data.label); setQueue(data.rewards.filter(reward => !seen(reward)));}}).catch(() => {});
    return () => {alive = false;};
  }, [distributionId, watch]);
  const reward = queue[0];
  if (!reward) return null;
  const done = () => {try {localStorage.setItem(seenKey(reward), '1');} catch {} setFlipped(false); setQueue(rest => rest.slice(1));};
  return <aside className="cards-reward-moment" role="status" aria-live="polite">
    <div className={`cards-reward-flip${flipped ? ' is-flipped' : ''}`}>
      <button type="button" className="cards-reward-inner" aria-expanded={flipped} onClick={() => setFlipped(true)}>
        <span className="cards-reward-face cards-reward-front"><img src="/cards/v1/cards-streak-card.svg" alt="" width={74} height={74}/><strong>{c.momentFront}</strong><em><RotateCw size={14}/>{c.momentFlip}</em></span>
        <span className="cards-reward-face cards-reward-back"><b>🐚 {fill('momentAmount', {label, n: reward.amount})}</b><span>{reward.kind === 'study' ? c.momentStudy : c.momentGoal}</span><small>{fill('momentSeparate', {label})}</small></span>
      </button>
    </div>
    {flipped && <button type="button" className="button primary" onClick={done}>{c.momentThanks}</button>}
  </aside>;
}
