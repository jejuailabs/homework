'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, Inbox, LoaderCircle, Mail, Save} from 'lucide-react';
import {mailboxLimits, mailboxStatuses, mailboxStatusLabels, type MailboxLetter, type MailboxLetterSummary, type MailboxStatus} from '@/lib/developer-mailbox';
import '@/styles/admin-developer-mailbox.css';

type InboxData = {items: MailboxLetterSummary[]; newCount: number; nextCursor: string | null};
async function mailboxApi<T>(suffix = '', options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api/admin/developer-mailbox' + suffix, {...options, cache: 'no-store'});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '편지를 불러오지 못했어요.');
  return data as T;
}
const date = (value: string) => new Date(value).toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'});
const role = (value: string) => value === 'student' ? '학생' : value === 'teacher' ? '교사' : '운영자';

export function AdminMailboxCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => {void mailboxApi<{newCount: number}>('?summary=1', {signal: controller.signal}).then(data => {if (!controller.signal.aborted) setCount(data.newCount);}).catch(() => {});};
    load(); window.addEventListener('developer-mailbox-updated', load);
    return () => {controller.abort(); window.removeEventListener('developer-mailbox-updated', load);};
  }, []);
  return count > 0 ? <span className="admin-mailbox-count" aria-label={`새 편지 ${count}개`}>{count > 99 ? '99+' : count}</span> : null;
}

export default function AdminDeveloperMailbox({revision = 0}: {revision?: number}) {
  const [data, setData] = useState<InboxData | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(''), [history, setHistory] = useState<string[]>([]), [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(''), [letter, setLetter] = useState<MailboxLetter | null>(null), [detailError, setDetailError] = useState('');
  const [status, setStatus] = useState<MailboxStatus>('new'), [note, setNote] = useState(''), [saving, setSaving] = useState(false), [notice, setNotice] = useState('');
  const lock = useRef(false);
  const reload = useCallback(() => setRefresh(value => value + 1), []);

  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError('');
    mailboxApi<InboxData>(cursor ? '?cursor=' + encodeURIComponent(cursor) : '', {signal: abort.signal})
      .then(value => {if (!abort.signal.aborted) setData(value);})
      .catch(cause => {if (!abort.signal.aborted) setError(cause.message);})
      .finally(() => {if (!abort.signal.aborted) setLoading(false);});
    return () => abort.abort();
  }, [cursor, revision, refresh]);
  useEffect(() => {
    setLetter(null); setDetailError('');
    if (!selected) return;
    const abort = new AbortController();
    mailboxApi<{letter: MailboxLetter}>('/' + selected, {signal: abort.signal}).then(({letter: value}) => {
      if (!abort.signal.aborted) {setLetter(value); setStatus(value.status); setNote(value.adminNote);}
    }).catch(cause => {if (!abort.signal.aborted) setDetailError(cause.message);});
    return () => abort.abort();
  }, [selected, revision, refresh]);
  useEffect(() => {setNotice('');}, [selected]);

  async function save() {
    if (!letter || lock.current) return;
    lock.current = true; setSaving(true); setDetailError(''); setNotice('');
    try {
      await mailboxApi('/' + letter.id, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({status, adminNote: note, version: letter.version})});
      reload(); window.dispatchEvent(new Event('developer-mailbox-updated')); setNotice('처리 상태와 메모를 저장했습니다.');
    } catch (cause) {setDetailError(cause instanceof Error ? cause.message : '변경을 저장하지 못했어요.');}
    finally {lock.current = false; setSaving(false);}
  }

  return <section className="admin-mailbox">
    <div className="admin-mailbox-intro"><span><Inbox size={25}/></span><div><h2>개발자에게 도착한 편지</h2><p>학생과 선생님의 아이디어를 접수순으로 모았어요.</p></div>{data && <strong>새 편지 {data.newCount}개</strong>}</div>
    {error && <p role="alert" className="admin-error">{error}<button className="button" onClick={reload}>다시 불러오기</button></p>}
    <div className="admin-mailbox-columns"><div className="admin-mailbox-list" aria-busy={loading}>
      {loading ? <p className="admin-loading" role="status"><LoaderCircle size={19} className="spin"/>편지를 불러오는 중</p> : !data?.items.length ? <div className="admin-mailbox-empty"><Mail size={29}/><p>아직 도착한 편지가 없어요.</p></div> : data.items.map(item => <button type="button" key={item.id} className={`admin-mailbox-row ${selected === item.id ? 'is-selected' : ''}`} onClick={() => setSelected(item.id)} disabled={saving} aria-pressed={selected === item.id}>
        <span className={`admin-mailbox-status is-${item.status}`}>{mailboxStatusLabels[item.status]}</span><strong>{item.title}</strong><span>{item.author.name} · {role(item.author.role)}{item.author.className && ` · ${item.author.className}`}</span><time dateTime={item.createdAt}>{date(item.createdAt)}</time>
      </button>)}
      <nav className="admin-mailbox-pagination" aria-label="편지 목록 페이지"><button type="button" className="button" disabled={loading || saving || !history.length} onClick={() => {setCursor(history.at(-1)!); setHistory(value => value.slice(0, -1)); setSelected('');}}><ArrowLeft size={15}/>이전</button><span>{history.length + 1} 페이지</span><button type="button" className="button" disabled={loading || saving || !data?.nextCursor} onClick={() => {setHistory(value => [...value, cursor]); setCursor(data!.nextCursor!); setSelected('');}}>다음<ArrowRight size={15}/></button></nav>
    </div><div className="admin-mailbox-detail" aria-live="polite">
      {!selected ? <div className="admin-mailbox-empty"><Mail size={30}/><p>편지를 선택하면 내용을 볼 수 있어요.</p></div> : !letter ? <>{detailError ? <p role="alert">{detailError}<button className="button" onClick={reload}>다시 불러오기</button></p> : <p role="status"><LoaderCircle size={19} className="spin"/>편지를 여는 중</p>}</> : <>
        <span className={`admin-mailbox-status is-${letter.status}`}>{mailboxStatusLabels[letter.status]}</span><h3>{letter.title}</h3><p className="admin-mailbox-sender">{letter.author.name} · {role(letter.author.role)}{letter.author.className && ` · ${letter.author.className}`}<time dateTime={letter.createdAt}>{date(letter.createdAt)}</time></p>
        <div className="admin-mailbox-message">{letter.message}</div>
        <form onSubmit={event => {event.preventDefault(); void save();}}><label htmlFor="mailbox-status">처리 상태</label><select id="mailbox-status" value={status} disabled={saving} onChange={event => setStatus(event.target.value as MailboxStatus)}>{mailboxStatuses.map(value => <option key={value} value={value}>{mailboxStatusLabels[value]}</option>)}</select><label htmlFor="mailbox-note">관리자 메모 <small>작성자에게 공개되지 않아요</small></label><textarea id="mailbox-note" rows={4} maxLength={mailboxLimits.note} value={note} disabled={saving} onChange={event => setNote(event.target.value)} placeholder="검토 내용이나 반영 계획을 적어주세요."/>
          <button className="button primary" disabled={saving || status === letter.status && note === letter.adminNote}>{saving ? <LoaderCircle size={16} className="spin"/> : <Save size={16}/>}저장하기</button>
          {detailError && <p role="alert" className="error-message">{detailError}<button type="button" className="button" onClick={reload}>편지 다시 열기</button></p>}{notice && <p role="status">{notice}</p>}
        </form>
      </>}
    </div></div>
  </section>;
}
