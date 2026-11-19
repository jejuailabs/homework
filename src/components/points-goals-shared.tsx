'use client';
import {useMemo} from 'react';
import {PartyPopper, Shell, X} from 'lucide-react';
import type {PointGoal} from '@/lib/points-types';

type Copy = (ko: string, en: string) => string;

export function goalStatusText(goal: PointGoal, copy: Copy) {
  if (goal.status === 'reached') return copy('목표 달성! 선생님 보상을 기다려요', 'Goal reached! Waiting for the reward');
  if (goal.status === 'rewarded') return copy('보상 완료', 'Rewarded');
  if (goal.status === 'failed') return goal.failReason === 'deadline' ? copy('미션 실패 · 마감까지 못 채웠어요 · 보말을 모두 돌려줬어요', 'Mission failed · deadline passed · all points returned') : copy('미션 실패 · 보말을 모두 돌려줬어요', 'Mission failed · all points returned');
  return copy('모으는 중', 'Collecting');
}
export function goalDueText(goal: PointGoal, locale: string, copy: Copy) {
  if (!goal.dueAt) return '';
  return `${copy('마감', 'Due')} ${new Date(goal.dueAt).toLocaleString(locale, {month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit'})}`;
}
export function GoalProgress({goal, label, locale, big = false}: {goal: PointGoal; label: string; locale: string; big?: boolean}) {
  const percent = goal.target ? Math.min(100, Math.round(goal.raised / goal.target * 100)) : 0;
  return <div className={`pg-progress${big ? ' is-big' : ''} is-${goal.status}`}>
    <div className="pg-bar" role="progressbar" aria-valuemin={0} aria-valuemax={goal.target} aria-valuenow={goal.raised} aria-label={`${goal.raised} / ${goal.target} ${label}`}><span style={{width: `${percent}%`}}/></div>
    <p><Shell size={big ? 28 : 15}/><strong>{goal.raised.toLocaleString(locale)}</strong> / {goal.target.toLocaleString(locale)} {label}<span>{percent}%</span></p>
  </div>;
}
/** Everyone in the class sees who gave how much. */
export function GoalDonors({goal, label, locale, me, copy}: {goal: PointGoal; label: string; locale: string; me?: string; copy: Copy}) {
  if (!goal.donors.length) return <p className="points-muted">{copy('아직 기부한 친구가 없어요.', 'No one has given yet.')}</p>;
  return <ul className="pg-donors" aria-label={copy('기부한 친구', 'Donors')}>{goal.donors.map(donor => <li key={donor.studentId} className={donor.studentId === me ? 'is-me' : ''}><span>{donor.number ? `${donor.number}. ` : ''}{donor.name}{donor.studentId === me ? copy(' (나)', ' (me)') : ''}</span><b>{donor.amount.toLocaleString(locale)} {label}</b></li>)}</ul>;
}

const COLORS = ['#f2b84b', '#ef8f86', '#7fc2a1', '#86aee0', '#c49be0', '#f6d977'];
/** 축포: confetti and a big 목표 달성 card. Motion is dropped for anyone who asked their device for less of it. */
export function GoalCelebration({goal, label, locale, copy, onClose}: {goal: PointGoal; label: string; locale: string; copy: Copy; onClose: () => void}) {
  const pieces = useMemo(() => Array.from({length: 70}, (_, index) => ({left: (index * 37) % 100, delay: (index % 14) * 0.12, duration: 2.4 + (index % 5) * 0.35, color: COLORS[index % COLORS.length], size: 7 + (index % 4) * 3, turn: index % 2 ? 1 : -1})), []);
  return <div className="pg-celebrate" role="dialog" aria-modal="true" aria-labelledby="pg-celebrate-title">
    <div className="pg-confetti" aria-hidden="true">{pieces.map((piece, index) => <i key={index} style={{left: `${piece.left}%`, animationDelay: `${piece.delay}s`, animationDuration: `${piece.duration}s`, background: piece.color, width: piece.size, height: piece.size * 1.6, ['--turn' as string]: piece.turn}}/>)}</div>
    <div className="pg-celebrate-card">
      <button type="button" className="icon-button pg-celebrate-close" aria-label={copy('닫기', 'Close')} onClick={onClose}><X size={20}/></button>
      <PartyPopper size={56} aria-hidden="true"/>
      <h2 id="pg-celebrate-title">{copy('목표 달성!', 'Goal reached!')}</h2>
      <p className="pg-celebrate-title">{goal.title}</p>
      <p>{copy(`우리 반이 ${label} ${goal.target.toLocaleString(locale)}개를 모두 모았어요. 함께한 친구 ${goal.donors.length}명, 고마워요!`, `Our class gathered all ${goal.target.toLocaleString(locale)} ${label}. Thank you, ${goal.donors.length} friends!`)}</p>
      <button type="button" className="button primary" onClick={onClose}>{copy('야호!', 'Hooray!')}</button>
    </div>
  </div>;
}
/** Each viewer sees a goal's 축포 once per device. */
export function celebrationSeen(key: string) {try {return localStorage.getItem(key) === '1';} catch {return false;}}
export function markCelebrationSeen(key: string) {try {localStorage.setItem(key, '1');} catch {}}
