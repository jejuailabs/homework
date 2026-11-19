'use client';
import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {Check, HandHeart, Maximize2, X} from 'lucide-react';
import {POINT_GOAL_OPEN_LIMIT, type PointGoal} from '@/lib/points-types';
import {pointError, pointsRequest, usePointCopy} from './points-shared';
import {celebrationSeen, GoalCelebration, GoalDonors, goalDueText, GoalProgress, goalStatusText, markCelebrationSeen} from './points-goals-shared';

/** 보말 기부 on the teacher's 보말 page: open up to three goals, watch them fill, then 보상 완료 or 미션 실패 (refunds everyone). */
export default function PointsTeacherGoals({classId, enabled, label, onChanged}: {classId: string; enabled: boolean; label: string; onChanged: () => void}) {
  const {ko, locale, copy} = usePointCopy();
  const [goals, setGoals] = useState<PointGoal[] | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [target, setTarget] = useState(100), [dueAt, setDueAt] = useState('');
  const [big, setBig] = useState<string | null>(null), [party, setParty] = useState<PointGoal | null>(null);
  const requestId = useRef(crypto.randomUUID()), busyRef = useRef(false);
  const load = useCallback(async () => {
    const result = await pointsRequest<{goals: PointGoal[]}>(`/api/points/classes/${classId}/goals`);
    setGoals(result.goals);
    const fresh = result.goals.find(goal => goal.status === 'reached' && !celebrationSeen(`bomal-goal-party:t:${goal.id}`));
    if (fresh) {markCelebrationSeen(`bomal-goal-party:t:${fresh.id}`); setParty(fresh);}
  }, [classId]);
  useEffect(() => {setGoals(null); void load().catch(cause => setError(pointError(cause, ko)));}, [load, ko]);
  // Donations come in from students' screens: refresh while the page is visible.
  useEffect(() => {
    const timer = window.setInterval(() => {if (document.visibilityState === 'visible' && !busyRef.current) void load().catch(() => {});}, 5000);
    return () => window.clearInterval(timer);
  }, [load]);
  async function action(fn: () => Promise<void>) {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {await fn();} catch (cause) {setError(pointError(cause, ko));} finally {busyRef.current = false; setBusy(false);}
  }
  function create(event: FormEvent) {
    event.preventDefault();
    void action(async () => {
      await pointsRequest(`/api/points/classes/${classId}/goals`, {method: 'POST', body: JSON.stringify({title: title.trim(), description: description.trim(), target, dueAt: dueAt ? new Date(dueAt).toISOString() : null, requestId: requestId.current})});
      requestId.current = crypto.randomUUID(); setTitle(''); setDescription(''); setDueAt(''); await load();
      setNotice(copy('기부를 열었어요. 학생 화면에 바로 보여요.', 'The goal is open. Students can see it now.'));
    });
  }
  function fail(goal: PointGoal) {
    if (!window.confirm(copy(`'${goal.title}' 미션을 실패로 끝낼까요? 학생들이 낸 ${label} ${goal.raised}개를 모두 돌려줘요.`, `End '${goal.title}' as failed? All ${goal.raised} ${label} go back to the students.`))) return;
    void action(async () => {await pointsRequest(`/api/points/classes/${classId}/goals/${goal.id}/fail`, {method: 'POST', body: '{}'}); await load(); onChanged(); setNotice(copy('미션 실패로 정리하고 보말을 모두 돌려줬어요.', 'Marked as failed and returned all points.'));});
  }
  function rewarded(goal: PointGoal) {
    void action(async () => {await pointsRequest(`/api/points/classes/${classId}/goals/${goal.id}/rewarded`, {method: 'POST', body: '{}'}); await load(); setNotice(copy('보상 완료로 표시했어요.', 'Marked as rewarded.'));});
  }
  const open = goals?.filter(goal => goal.status === 'open').length ?? 0, full = open >= POINT_GOAL_OPEN_LIMIT, shown = goals?.find(goal => goal.id === big);
  return <section className="pg-section" aria-labelledby="pg-teacher-title">
    <h2 id="pg-teacher-title"><HandHeart size={22}/>{copy('보말 기부', 'Point donations')}</h2>
    <p className="points-muted">{copy(`보상을 걸고 목표 ${label}를 정하면 학생들이 원하는 만큼 기부해요. 목표가 차면 축포가 터지고, 보상은 교실에서 직접 주세요. 진행 중인 기부는 ${POINT_GOAL_OPEN_LIMIT}개까지, 미션 실패면 낸 ${label}를 모두 돌려줘요.`, `Set a reward and a goal; students give what they like. When it fills, confetti! Give the reward in class. Up to ${POINT_GOAL_OPEN_LIMIT} open goals; a failed mission returns every point.`)}</p>
    {error && <p className="points-error" role="alert">{error}</p>}{notice && <p className="points-notice" role="status"><Check size={17}/>{notice}</p>}
    {!enabled ? <p className="points-notice">{copy('학급 설정에서 보말 사용을 켜면 기부를 열 수 있어요.', 'Enable points in class settings to open a goal.')}</p> : <form className="pg-form" onSubmit={create}>
      <label>{copy('보상 이름', 'Reward')}<input value={title} maxLength={60} required disabled={busy || full} placeholder={copy('예: 금요일 영화 보기', 'e.g. Movie on Friday')} onChange={event => setTitle(event.target.value)}/></label>
      <label>{copy(`목표 ${label}`, `Goal (${label})`)}<input type="number" min={1} max={1000000} step={1} required disabled={busy || full} value={target} onChange={event => setTarget(Number(event.target.value))}/></label>
      <label>{copy('마감 (선택)', 'Deadline (optional)')}<input type="datetime-local" disabled={busy || full} value={dueAt} onChange={event => setDueAt(event.target.value)}/></label>
      <label className="pg-wide">{copy('설명 (선택)', 'Description (optional)')}<input value={description} maxLength={300} disabled={busy || full} placeholder={copy('예: 다 모이면 금요일 6교시에 영화를 봐요.', 'e.g. When it fills, we watch a movie on Friday.')} onChange={event => setDescription(event.target.value)}/></label>
      <button className="button primary" disabled={busy || full || !title.trim() || !Number.isSafeInteger(target) || target < 1}>{copy('기부 열기', 'Open goal')}</button>
      {full && <p className="points-muted pg-wide">{copy(`진행 중인 기부가 ${POINT_GOAL_OPEN_LIMIT}개예요. 하나가 끝나면 새로 열 수 있어요.`, `${POINT_GOAL_OPEN_LIMIT} goals are open. Finish one to open another.`)}</p>}
    </form>}
    {goals === null ? <p role="status">{copy('기부를 불러오고 있어요.', 'Loading goals…')}</p> : !goals.length ? <p className="points-muted">{copy('아직 연 기부가 없어요.', 'No goals yet.')}</p> : <ul className="pg-list">{goals.map(goal => <li key={goal.id} className={`pg-card is-${goal.status}`}>
      <div className="pg-card-head"><div><h3>{goal.title}</h3>{goal.description && <p className="points-muted">{goal.description}</p>}</div><span className="pg-status">{goalStatusText(goal, copy)}</span></div>
      <GoalProgress goal={goal} label={label} locale={locale}/>
      {goal.dueAt && <p className="points-muted">{goalDueText(goal, locale, copy)}</p>}
      <GoalDonors goal={goal} label={label} locale={locale} copy={copy}/>
      <div className="pg-actions">
        {(goal.status === 'open' || goal.status === 'reached') && <button type="button" className="button" onClick={() => setBig(goal.id)}><Maximize2 size={16}/>{copy('크게 보기', 'Show big')}</button>}
        {goal.status === 'reached' && <button type="button" className="button primary" disabled={busy} onClick={() => rewarded(goal)}><Check size={16}/>{copy('교실에서 보상 완료', 'Reward given')}</button>}
        {goal.status === 'open' && <button type="button" className="button pg-danger" disabled={busy} onClick={() => fail(goal)}><X size={16}/>{copy('미션 실패 (보말 돌려주기)', 'Mission failed (return points)')}</button>}
      </div>
    </li>)}</ul>}
    {shown && <div className="pg-big" role="dialog" aria-modal="true" aria-label={shown.title}><button type="button" className="icon-button pg-big-close" aria-label={copy('닫기', 'Close')} onClick={() => setBig(null)}><X size={24}/></button><div className="pg-big-inner">
      <h2>{shown.title}</h2>{shown.description && <p>{shown.description}</p>}
      <GoalProgress goal={shown} label={label} locale={locale} big/>
      <p className="points-muted">{shown.status === 'open' ? copy(`남은 ${label} ${Math.max(0, shown.target - shown.raised).toLocaleString(locale)}개`, `${Math.max(0, shown.target - shown.raised).toLocaleString(locale)} ${label} to go`) : goalStatusText(shown, copy)}{shown.dueAt ? ` · ${goalDueText(shown, locale, copy)}` : ''}</p>
      <GoalDonors goal={shown} label={label} locale={locale} copy={copy}/>
      {shown.status === 'reached' && <button type="button" className="button primary" style={{marginTop: 20}} onClick={() => setParty(shown)}>{copy('축포 다시 보기', 'Confetti again')}</button>}
    </div></div>}
    {party && <GoalCelebration goal={party} label={label} locale={locale} copy={copy} onClose={() => setParty(null)}/>}
  </section>;
}
