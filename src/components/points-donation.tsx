'use client';
import Link from 'next/link';
import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowLeft, HandHeart, Shell} from 'lucide-react';
import type {PointGoal, PointSettings} from '@/lib/points-types';
import {notifyPointsChanged} from '@/lib/use-point-sync';
import AccessGate from './access-gate';
import {pointError, pointLabel, pointsRequest, usePointCopy} from './points-shared';
import {celebrationSeen, GoalCelebration, GoalDonors, goalDueText, GoalProgress, goalStatusText, markCelebrationSeen} from './points-goals-shared';
import '@/styles/points.css';

type State = {goals: PointGoal[]; settings: PointSettings; studentId: string; points: number};
const partyKey = (goalId: string) => `bomal-goal-party:s:${goalId}`;
/** Only goals reached in the last two weeks still fire 축포 for someone who missed the moment. */
const RECENT_MS = 14 * 24 * 60 * 60 * 1000;

export default function PointsDonation() {return <AccessGate role="student"><Donation/></AccessGate>;}
function Donation() {
  const {ko, locale, copy} = usePointCopy();
  const [state, setState] = useState<State | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, number>>({}), [confirm, setConfirm] = useState<{goal: PointGoal; amount: number} | null>(null), [party, setParty] = useState<PointGoal | null>(null);
  const requestIds = useRef<Record<string, string>>({}), busyRef = useRef(false), dialog = useRef<HTMLDialogElement>(null);
  const load = useCallback(async () => {
    const result = await pointsRequest<State>('/api/points/goals');
    setState(result);
    const fresh = result.goals.find(goal => (goal.status === 'reached' || goal.status === 'rewarded') && goal.reachedAt && Date.now() - new Date(goal.reachedAt).getTime() < RECENT_MS && !celebrationSeen(partyKey(goal.id)));
    if (fresh) {markCelebrationSeen(partyKey(fresh.id)); setParty(fresh);}
  }, []);
  useEffect(() => {void load().catch(cause => setError(pointError(cause, ko)));}, [load, ko]);
  // Friends give from their own screens: keep the bars moving while this page is open.
  useEffect(() => {
    const timer = window.setInterval(() => {if (document.visibilityState === 'visible' && !busyRef.current) void load().catch(() => {});}, 5000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => {if (confirm) dialog.current?.showModal();}, [confirm]);

  async function give(goal: PointGoal, amount: number) {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const key = `${goal.id}:${amount}`, requestId = requestIds.current[key] ||= crypto.randomUUID();
      const result = await pointsRequest<{goal: PointGoal; points: number; reached: boolean}>(`/api/points/goals/${goal.id}/donate`, {method: 'POST', body: JSON.stringify({amount, requestId})});
      delete requestIds.current[key]; setConfirm(null); notifyPointsChanged();
      setState(current => current ? {...current, points: result.points, goals: current.goals.map(item => item.id === goal.id ? result.goal : item)} : current);
      setAmounts(current => ({...current, [goal.id]: 0}));
      if (result.reached) {markCelebrationSeen(partyKey(goal.id)); setParty(result.goal);}
      else setNotice(copy(`${amount}개를 기부했어요. 고마워요!`, `You gave ${amount}. Thank you!`));
    } catch (cause) {setError(pointError(cause, ko)); setConfirm(null); void load().catch(() => {});}
    finally {busyRef.current = false; setBusy(false);}
  }

  if (!state) return <section className="points-page points-empty" aria-live="polite"><Shell size={34}/><p>{error || copy('기부함을 열고 있어요.', 'Opening donations…')}</p>{error && <button className="button" onClick={() => void load().catch(cause => setError(pointError(cause, ko)))}>{copy('다시 시도', 'Try again')}</button>}</section>;
  const label = pointLabel(state.settings, locale), open = state.goals.filter(goal => goal.status === 'open'), done = state.goals.filter(goal => goal.status !== 'open');
  const card = (goal: PointGoal) => {
    const remaining = Math.max(0, goal.target - goal.raised), most = Math.min(remaining, state.points), value = amounts[goal.id] || 0, mine = goal.donors.find(donor => donor.studentId === state.studentId)?.amount ?? 0;
    const set = (next: number) => setAmounts(current => ({...current, [goal.id]: Math.max(0, Math.min(most, Math.floor(next) || 0))}));
    return <li key={goal.id} className={`pg-card is-${goal.status}`}>
      <div className="pg-card-head"><div><h3>{goal.title}</h3>{goal.description && <p className="points-muted">{goal.description}</p>}</div><span className="pg-status">{goalStatusText(goal, copy)}</span></div>
      <GoalProgress goal={goal} label={label} locale={locale}/>
      <p className="points-muted">{goal.status === 'open' ? copy(`남은 ${label} ${remaining.toLocaleString(locale)}개`, `${remaining.toLocaleString(locale)} ${label} to go`) : ''}{goal.dueAt ? `${goal.status === 'open' ? ' · ' : ''}${goalDueText(goal, locale, copy)}` : ''}{mine ? ` · ${goal.status === 'failed' ? copy(`내가 낸 ${mine}개는 돌려받았어요`, `Your ${mine} came back`) : copy(`내가 낸 ${label} ${mine}개`, `You gave ${mine}`)}` : ''}</p>
      <GoalDonors goal={goal} label={label} locale={locale} me={state.studentId} copy={copy}/>
      {goal.status === 'open' && state.settings.enabled && <div className="pg-give">
        <label className="points-muted" htmlFor={`pg-amount-${goal.id}`}>{copy('기부할 보말', 'Amount')}</label>
        <input id={`pg-amount-${goal.id}`} type="number" min={1} max={most} step={1} value={value || ''} disabled={busy || most < 1} onChange={event => set(Number(event.target.value))}/>
        {[1, 10, 50].map(step => <button key={step} type="button" className="button" disabled={busy || value + step > most} onClick={() => set(value + step)}>+{step}</button>)}
        <button type="button" className="button" disabled={busy || most < 1} onClick={() => set(most)}>{remaining <= state.points ? copy('남은 만큼 채우기', 'Fill the rest') : copy('내 보말 모두', 'All I have')}</button>
        <button type="button" className="button primary" disabled={busy || value < 1 || value > most} onClick={() => setConfirm({goal, amount: value})}><HandHeart size={16}/>{copy('기부하기', 'Give')}</button>
        {most < 1 && <span className="points-muted">{copy(`${label}를 더 모으면 기부할 수 있어요.`, `Collect more ${label} to give.`)}</span>}
      </div>}
    </li>;
  };
  return <main className="points-page">
    <Link className="points-back" href="/student"><ArrowLeft size={17}/>{copy('내 교실', 'My classroom')}</Link>
    <header className="points-heading"><div><span className="points-eyebrow">{copy('우리 반이 함께 모아요', 'Gathering together')}</span><h1><HandHeart size={30}/>{copy('보말 기부', 'Point donations')}</h1><p>{copy('선생님이 건 보상을 위해 보말을 모아요. 목표가 다 차면 축포가 터지고, 선생님이 교실에서 보상을 줘요. 미션에 실패하면 낸 보말은 모두 돌아와요.', 'Pool points for the reward your teacher set. When it fills, confetti — and your teacher gives the reward in class. If the mission fails, every point comes back.')}</p></div><span className="points-balance"><Shell size={25}/><strong>{state.points.toLocaleString(locale)}</strong><span>{label}</span></span></header>
    {error && <p className="points-error" role="alert">{error}</p>}{notice && <p className="points-notice" role="status">{notice}</p>}
    {!state.settings.enabled ? <section className="points-empty"><h2>{copy('보말 기부가 쉬고 있어요', 'Donations are resting')}</h2><p>{copy('선생님이 보말을 켜면 기부할 수 있어요.', 'Your teacher can turn points on.')}</p></section> : <>
      <section className="pg-section"><h2>{copy('모으는 중', 'Collecting')}</h2>{open.length ? <ul className="pg-list">{open.map(card)}</ul> : <p className="points-muted">{copy('지금 열린 기부가 없어요. 선생님이 새 보상을 걸면 여기에 보여요.', 'No open goals. New ones from your teacher will show here.')}</p>}</section>
      {done.length > 0 && <section className="pg-section"><h2>{copy('지난 기부', 'Past goals')}</h2><ul className="pg-list">{done.map(card)}</ul></section>}
    </>}
    {confirm && <dialog ref={dialog} className="points-dialog" onCancel={event => {if (busy) event.preventDefault(); else setConfirm(null);}} aria-labelledby="pg-give-title"><HandHeart size={40}/><h2 id="pg-give-title">{confirm.goal.title}</h2><p>{copy(`${label} ${confirm.amount}개를 기부할까요?`, `Give ${confirm.amount} ${label}?`)}</p><p className="points-muted">{copy(`기부 후 ${state.points - confirm.amount}개가 남아요. 친구들도 누가 얼마나 냈는지 볼 수 있어요.`, `You will have ${state.points - confirm.amount} left. Classmates can see who gave how much.`)}</p><div className="points-actions"><button className="button" disabled={busy} onClick={() => setConfirm(null)}>{copy('다음에', 'Not now')}</button><button className="button primary" disabled={busy} onClick={() => void give(confirm.goal, confirm.amount)}>{busy ? copy('기부하는 중…', 'Giving…') : copy('기부하기', 'Give')}</button></div></dialog>}
    {party && <GoalCelebration goal={party} label={label} locale={locale} copy={copy} onClose={() => setParty(null)}/>}
  </main>;
}
