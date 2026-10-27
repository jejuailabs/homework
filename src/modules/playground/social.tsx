'use client';

import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {Check, Mail, RefreshCw, Send, Users, X} from 'lucide-react';
import CharacterAvatar from '@/components/character-avatar';
import {PlayRequestError, playMutation, playRequest} from './client';
import './styles.css';

type SocialState = {online: {id: string; name: string; character: string}[]; invites: {id: string; fromName: string; roomId: string; code: string}[]; ownRoom: {roomId: string; code: string} | null};
export default function SocialPanel({enabled}: {enabled: boolean}) {
  const router = useRouter(), [state, setState] = useState<SocialState | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false, serial = 0, failures = 0, timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined;
    const schedule = () => {clearTimeout(timer); if (!stopped && document.visibilityState === 'visible' && navigator.onLine) timer = setTimeout(() => void refresh(), Math.min(60000, 15000 * 2 ** failures));};
    async function refresh() {
      clearTimeout(timer); controller?.abort(); const current = ++serial;
      if (stopped || document.visibilityState !== 'visible' || !navigator.onLine) return;
      controller = new AbortController(); const requestController = controller;
      const timeout = setTimeout(() => requestController.abort(), 10000);
      try {
        await playMutation('presence', {}, 'POST', requestController.signal);
        const data = await playRequest<SocialState>('social', {signal: requestController.signal});
        if (stopped || current !== serial) return;
        setState(data); setError(''); failures = 0;
      } catch (cause) {
        if (stopped || current !== serial) return;
        if (cause instanceof PlayRequestError && [401, 403, 404].includes(cause.status)) {stopped = true; setState(null);}
        if ((cause as Error).name !== 'AbortError') {setError((cause as Error).message); failures = Math.min(2, failures + 1);}
        else failures = Math.min(2, failures + 1);
      } finally {clearTimeout(timeout); if (current === serial) schedule();}
    }
    const visibility = () => {if (document.visibilityState === 'visible') void refresh(); else {clearTimeout(timer); ++serial; controller?.abort();}};
    const offline = () => {clearTimeout(timer); ++serial; controller?.abort();};
    const stop = () => {stopped = true; ++serial; clearTimeout(timer); controller?.abort();};
    document.addEventListener('visibilitychange', visibility); window.addEventListener('online', visibility); window.addEventListener('offline', offline); window.addEventListener('homework-session-ended', stop);
    void refresh();
    return () => {stop(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('online', visibility); window.removeEventListener('offline', offline); window.removeEventListener('homework-session-ended', stop);};
  }, [enabled, revision]);
  async function invite(studentId: string, name: string) {
    if (!state?.ownRoom || busy) return; setBusy(studentId); setError(''); setNotice('');
    try {await playMutation('invites', {toStudentId: studentId, roomId: state.ownRoom.roomId}); setNotice(`${name} 친구에게 초대를 보냈어요.`);}
    catch (cause) {setError((cause as Error).message);} finally {setBusy('');}
  }
  async function respond(inviteId: string, action: 'accept' | 'decline') {
    if (busy) return; setBusy(inviteId); setError(''); setNotice('');
    try {
      const value = await playMutation<{roomId?: string; code?: string}>(`invites/${encodeURIComponent(inviteId)}/${action}`, {});
      setState(previous => previous ? {...previous, invites: previous.invites.filter(invite => invite.id !== inviteId)} : previous);
      if (action === 'accept' && value.roomId && value.code) router.push(`/student/playground/room/${encodeURIComponent(value.code)}?roomId=${encodeURIComponent(value.roomId)}`);
      else setNotice('이번 초대는 지나갈게요.');
    } catch (cause) {setError((cause as Error).message);} finally {setBusy('');}
  }
  if (!enabled) return null;
  return <section className="playground pg-card pg-social" aria-label="접속한 친구와 초대함">{state?.ownRoom && <p><Link className="pg-button pg-secondary" href={`/student/playground/room/${encodeURIComponent(state.ownRoom.code)}?roomId=${encodeURIComponent(state.ownRoom.roomId)}`}>내 방으로 돌아가기 · {state.ownRoom.code}</Link></p>}<div className="pg-social-columns"><div><h2><Users size={21}/>지금 놀러 온 친구</h2><p className="pg-help">최근에 접속한 우리 반 친구예요.{state?.ownRoom ? ` 내 방 코드 ${state.ownRoom.code}로 초대할 수 있어요.` : ' 대결방을 만든 뒤 친구를 초대해 보세요.'}</p>{!state && !error && <p className="pg-help" role="status">친구들을 만나러 가고 있어요…</p>}{state && (state.online.length ? <ul className="pg-friends">{state.online.map(friend => <li key={friend.id}><span className="pg-friend-avatar"><CharacterAvatar character={friend.character} alt=""/></span><span>{friend.name}</span><button className="pg-button pg-secondary" type="button" disabled={!!busy || !state.ownRoom} onClick={() => void invite(friend.id, friend.name)} aria-label={`${friend.name} 친구 초대`}><Send size={14}/>초대</button></li>)}</ul> : <p className="pg-help">아직 놀러 온 친구가 없어요. 먼저 한 문제 풀어 볼까요?</p>)}</div><div><h2><Mail size={21}/>나에게 온 초대</h2>{state?.invites.length ? <ul className="pg-invites">{state.invites.map(invite => <li key={invite.id}><p><strong>{invite.fromName}</strong> 친구가 함께 놀자고 해요.<small>방 코드 {invite.code}</small></p><div className="pg-inline-actions"><button className="pg-button" type="button" disabled={!!busy} onClick={() => void respond(invite.id, 'accept')} aria-label={`${invite.fromName} 친구 초대 수락`}><Check size={15}/>함께 놀기</button><button className="pg-button pg-secondary" type="button" disabled={!!busy} onClick={() => void respond(invite.id, 'decline')} aria-label={`${invite.fromName} 친구 초대 거절`}><X size={15}/>다음에</button></div></li>)}</ul> : <p className="pg-help">새로운 초대가 오면 여기에 보여요.</p>}</div></div>{notice && <p className="pg-notice" role="status">{notice}</p>}{error && <div className="pg-error" role="alert"><p>{error}</p><button className="pg-button pg-secondary" type="button" disabled={!!busy} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15}/>다시 확인</button></div>}</section>;
}
