'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {ArrowRight, BookOpen, CalendarDays, Lightbulb, MessageCircleQuestion, PencilLine, RefreshCw, Smile, Sparkles, Trophy} from 'lucide-react';
import {playKinds, playLabels, type PlayHome, type PlayRankings} from './types';
import {playRequest} from './client';
import RoomLauncher from './room-launcher';
import SocialPanel from './social';
import './styles.css';

const menuDetails = {
  nonsense: {icon: Smile, description: '말 속에 숨어 있는 웃음을 찾아요.', verb: '웃음 찾으러 가기'},
  riddle: {icon: MessageCircleQuestion, description: '힌트를 따라 정체를 알아맞혀요.', verb: '수수께끼 풀러 가기'},
  vocab: {icon: BookOpen, description: '뜻과 초성을 보며 낱말을 배워요.', verb: '낱말 만나러 가기'},
  spelling: {icon: PencilLine, description: '헷갈리는 우리말을 하나씩 익혀요.', verb: '맞춤법 익히러 가기'},
};

export default function PlaygroundHub() {
  const [home, setHome] = useState<PlayHome | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const [ranking, setRanking] = useState<keyof PlayRankings>('solo');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    playRequest<PlayHome>('home', {signal: controller.signal}).then(setHome).catch(cause => {if (!controller.signal.aborted) setError((cause as Error).message);}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [revision]);
  const enabled = home?.settings.enabled;
  return <section className="playground pg-hub">
    <header className="pg-hero"><div className="pg-hero-copy"><p className="pg-eyebrow"><Sparkles size={15}/>말 한 조각, 생각 한 뼘</p><h1>말놀이터</h1><p>웃고, 생각하고, 알아맞히며<br/>우리말과 조금 더 친해져요.</p>{home && <span className="pg-class-tag">{home.className} · {home.name}</span>}</div><div className="pg-hero-art" aria-hidden="true"><span className="pg-art-book"><BookOpen/></span><span className="pg-art-bubble"><MessageCircleQuestion/></span><span className="pg-art-spark"><Sparkles/></span><span className="pg-art-light"><Lightbulb/></span><i className="pg-art-hill"/></div></header>
    {loading && <p className="pg-status" role="status">놀이터 문을 열고 있어요…</p>}
    {error && <div className="pg-error" role="alert"><p>{error}</p><button className="pg-button" onClick={() => setRevision(value => value + 1)}><RefreshCw size={16}/>다시 불러오기</button></div>}
    {home && <>
      {!enabled && <div className="pg-notice" role="status"><Lightbulb size={22}/><div><strong>선생님이 놀이터를 준비하고 있어요.</strong><p>우리 반 놀이터가 열리면 여기에서 함께 놀 수 있어요.</p></div></div>}
      <div className="pg-stats" aria-label="이번 주 내 기록"><div><Trophy size={19}/><span>이번 주 생각 점수<strong>{home.score.solo.toLocaleString()}<small>점</small></strong></span></div><div><CalendarDays size={19}/><span>놀러 온 날<strong>{home.score.days.length}<small>일</small></strong></span></div><div><PencilLine size={19}/><span>오늘 첫 도전<strong>{home.scoredToday}<small> / {home.dailyLimit}개</small></strong></span></div></div>
      <div className="pg-section-title"><div><p className="pg-eyebrow">나만의 속도로, 혼자 풀기</p><h2>오늘은 무엇을 해 볼까요?</h2></div><span className="pg-soft-note">틀려도 괜찮아요</span></div>
      <div className="pg-menu-grid">{playKinds.map(kind => {const details = menuDetails[kind], Icon = details.icon, counts = home.menus.find(menu => menu.kind === kind); const content = <><span className="pg-menu-icon"><Icon size={37} strokeWidth={1.6}/></span><h3>{playLabels[kind]}</h3><p>{details.description}</p><small>{counts?.remaining ? `새로운 문제 ${counts.remaining}개` : counts?.total ? '다시 풀며 연습해요' : '문제를 준비하고 있어요'}</small>{counts?.assigned ? <em className="pg-assigned">선생님이 낸 문제 {counts.assigned}개</em> : null}<span className="pg-menu-action">{details.verb}<ArrowRight size={17}/></span></>; return enabled && !!counts?.total ? <Link className={`pg-menu pg-${kind}`} href={`/student/playground/${kind}`} key={kind}>{content}</Link> : <div className={`pg-menu pg-${kind} is-disabled`} key={kind} aria-disabled="true">{content}</div>;})}</div>
      {enabled && home.dueCount > 0 && <Link className="pg-review-banner" href="/student/playground/spelling?review=1"><span className="pg-review-icon"><RefreshCw size={24}/></span><span><strong>다시 만나면 더 쉬워져요</strong><small>오늘 다시 볼 맞춤법 {home.dueCount}개가 기다려요.</small></span><ArrowRight size={22}/></Link>}
      {enabled && <RoomLauncher enabled={home.liveEnabled && home.settings.allowDuels}/>}
      <SocialPanel enabled={home.liveEnabled && home.settings.enabled && home.settings.allowDuels}/>
      <div className="pg-bottom-grid"><section className="pg-card pg-how"><h2><Lightbulb size={21}/>이렇게 놀아요</h2><ol><li><b>하나</b><span>천천히 읽고 답을 골라요. 직접 써도 좋아요.</span></li><li><b>둘</b><span>어려우면 힌트를 눌러 보세요.</span></li><li><b>셋</b><span>정답과 설명을 읽고 다음 문제로 가요.</span></li></ol><p className="pg-help">첫 도전만 점수에 들어가요. 힌트 없이 정답 10점, 힌트 1개는 7점, 2개 이상은 4점이에요. 하루 {home.dailyLimit}개 이후에는 마음껏 연습해요.</p>{home.settings.rewardsEnabled && <p className="pg-help">점수가 기록되는 문제 10개마다 {home.settings.soloReward}보말을 받아요. 하루 최대 3보말이에요.</p>}</section>
        {enabled && home.settings.showRankings && <section className="pg-card"><h2><Trophy size={21}/>이번 주 우리 반</h2><div className="pg-tabs pg-ranking-tabs" role="group" aria-label="순위 종류">{([['solo','문제 왕'],['duel','대결 왕'],['steady','꾸준왕']] as const).map(([key,label]) => <button type="button" key={key} aria-pressed={ranking === key} onClick={() => setRanking(key)}>{label}</button>)}</div>{home.ranking[ranking].length ? <ol className="pg-ranking">{home.ranking[ranking].map(row => <li className={row.id === home.studentId ? 'is-me' : ''} key={row.id}><b>{row.rank}</b><span>{row.name}{row.id === home.studentId && <small>나</small>}</span><strong>{row.score}{ranking === 'steady' ? '일' : '점'}</strong></li>)}</ol> : <p className="pg-help">이번 주 첫 기록을 기다리고 있어요.</p>}<p className="pg-help">상위 5명과 내 순위예요. 같은 점수는 같은 순위예요.</p></section>}
      </div>
    </>}
  </section>;
}
