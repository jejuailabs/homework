'use client';

import {useEffect, useState} from 'react';
import Link from 'next/link';
import {useLocale} from 'next-intl';
import {ArrowRight, PanelsTopLeft, RefreshCw} from 'lucide-react';
import {characterFiles} from '@/lib/characters';
import type {BoardListResponse, ParticipationBoard} from '@/lib/participation-types';

/** Only the board index is loaded; post bodies, comments and files stay on the board route. */
export default function BoardDashboardSummary({classId}: {classId: string}) {
  const ko = useLocale() === 'ko';
  const [boards, setBoards] = useState<ParticipationBoard[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setBoards(null); setFailed(false);
    fetch(`/api/boards${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`, {signal: controller.signal, cache: 'no-store'})
      .then(async response => {if (!response.ok) throw new Error('boards'); return await response.json() as BoardListResponse;})
      .then(data => {if (!controller.signal.aborted) setBoards(data.boards.filter(board => board.status !== 'archived').slice(0, 3));})
      .catch(() => {if (!controller.signal.aborted) setFailed(true);});
    return () => controller.abort();
  }, [classId, reload]);
  return <section className="thd-panel thd-board-summary" aria-labelledby="dashboard-boards-title">
    <div className="thd-section-heading"><div className="thd-heading-label"><span className="thd-small-icon thd-sky"><PanelsTopLeft size={21}/></span><div><h2 id="dashboard-boards-title">{ko ? '함께 나누는 생각' : 'Ideas we share'}</h2><p>{ko ? '최근 참여보드 · 현재 참여 현황' : 'Recent boards · current participation'}</p></div></div><Link className="thd-text-link" href={`/teacher/boards${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`}>{ko ? '참여보드 열기' : 'Open class boards'}<ArrowRight size={15}/></Link></div>
    {failed ? <p className="thd-board-summary-note">{ko ? '참여 현황을 불러오지 못했어요.' : 'Could not load board activity.'} <button className="thd-text-link" onClick={() => setReload(value => value + 1)}><RefreshCw size={13}/>{ko ? '다시 보기' : 'Retry'}</button></p> : boards === null ? <p className="thd-board-summary-note" role="status">{ko ? '참여보드를 불러오고 있어요…' : 'Loading class boards…'}</p> : boards.length ? <div className="thd-board-list">{boards.map(board => <Link key={board.id} href={`/teacher/boards?board=${encodeURIComponent(board.id)}`}><div className="thd-board-meta"><small>{board.className}</small><img src={`/characters/${characterFiles[board.character] || characterFiles.rabbit}.webp`} alt=""/></div><strong>{board.title}</strong><span className="thd-board-meta"><span>{ko ? `${board.participantCount}명 참여 · 게시물 ${board.postCount}개` : `${board.participantCount} participating · ${board.postCount} posts`}</span><ArrowRight size={14}/></span><small>{ko ? (board.status === 'frozen' ? '활동 마감' : '참여 중') : (board.status === 'frozen' ? 'Closed' : 'Open')}</small></Link>)}</div> : <div className="thd-gallery-empty"><img src="/characters/rabbit-tori.webp" alt=""/><div><h3>{ko ? '우리 반 생각을 한곳에 모아요' : 'A place for everyone’s ideas'}</h3><p>{ko ? '글, 사진, 목소리로 함께하는 첫 활동을 열어보세요.' : 'Start an activity with words, pictures, and voices.'}</p><Link className="thd-text-link" href="/teacher/boards">{ko ? '참여보드 시작하기' : 'Start a class board'}<ArrowRight size={15}/></Link></div></div>}
  </section>;
}
