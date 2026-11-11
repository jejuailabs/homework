'use client';
import {useCallback, useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {roomRequest} from './use-play-room';
import './room-styles.css';

type OpenRoom = {id: string; code: string; status: string; round: number; roundsTotal: number; players: number; createdAt: number; title: string; cards: boolean; classNames: string[]};
const statusLabel = (room: OpenRoom) => room.status === 'lobby' ? '참가 기다리는 중' : room.status === 'paused' ? `일시정지 · ${room.round + 1}/${room.roundsTotal}문제` : room.round < 0 ? '시작 준비 중' : `진행 중 · ${room.round + 1}/${room.roundsTotal}문제`;
const timeLabel = (at: number) => new Intl.DateTimeFormat('ko-KR', {hour: 'numeric', minute: '2-digit'}).format(at);

/** Team rooms this teacher left running (for example after closing the tab): reopen one, or end it. */
export default function OpenRooms({classId, refresh = 0, from}: {classId?: string; refresh?: number; from?: 'cards'}) {
  const router = useRouter(), [rooms, setRooms] = useState<OpenRoom[]>([]), [ending, setEnding] = useState(''), [armed, setArmed] = useState(''), [error, setError] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!classId) return;
    try {const value = await roomRequest<{rooms: OpenRoom[]}>(`rooms/open?classId=${encodeURIComponent(classId)}`, undefined, signal); setRooms(value.rooms); setError('');}
    catch (cause) {if (!signal?.aborted) setError((cause as Error).message);}
  }, [classId]);
  useEffect(() => {const controller = new AbortController(); void load(controller.signal); return () => controller.abort();}, [load, refresh]);
  async function end(roomId: string) {
    setEnding(roomId); setError('');
    try {await roomRequest(`rooms/${encodeURIComponent(roomId)}/end`, {}); setArmed(''); await load();}
    catch (cause) {setError((cause as Error).message);}
    finally {setEnding('');}
  }
  if (!rooms.length && !error) return null;
  return <section className="play-open-rooms" aria-label="열려 있는 팀전">
    <h3>열려 있는 팀전 <small>{rooms.length}</small></h3>
    {rooms.map(room => <div className="play-open-room" key={room.id}>
      <div><strong>{room.title || (room.cards ? '카드 팀전' : '말놀이터 팀전')} · 코드 {room.code}</strong><span>{statusLabel(room)} · 학생 {room.players}명 · {timeLabel(room.createdAt)} 시작{room.classNames.length > 1 ? ` · ${room.classNames.join(' vs ')}` : ''}</span></div>
      <div className="play-open-room-actions">
        <button type="button" className="button" disabled={!!ending} onClick={() => router.push(`/teacher/playground/live/${room.id}${from ? `?from=${from}` : ''}`)}>그 방으로 가기</button>
        {armed === room.id
          ? <><button type="button" className="button danger" disabled={!!ending} onClick={() => void end(room.id)}>{ending === room.id ? '끝내는 중…' : '정말 끝내기'}</button><button type="button" disabled={!!ending} onClick={() => setArmed('')}>취소</button></>
          : <button type="button" disabled={!!ending} onClick={() => setArmed(room.id)}>방 끝내기</button>}
      </div>
    </div>)}
    {error && <p role="alert" className="play-room-error">{error}</p>}
  </section>;
}
