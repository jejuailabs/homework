'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {usePathname} from 'next/navigation';
import {ArrowUpRight, Check, ChevronRight, ClipboardList, Images, Inbox, LayoutGrid, LoaderCircle, Lock, MessageCircle, PencilLine, PlugZap, Send, Sparkles, StickyNote, TriangleAlert, X} from 'lucide-react';
import {abilityGroups, firstBlank, lackingFor, missingPermissions, type Ability} from './abilities';
import './styles.css';

type Card = {inbox_id: string; tool: string; preview: Record<string, unknown> | null; state: 'open' | 'saving' | 'saved' | 'rejected' | 'error'; note?: string};
type Message = {role: 'user' | 'assistant'; text: string; cards?: Card[]};
type InboxItem = {id: string; kind: string; rule: string | null; title_generic: string; payload: Record<string, unknown>; status: string; created_at: string};
const TOOL_LABELS: Record<string, string> = {
  add_calendar_event: '일정 추가', add_lesson_log: '수업 일지 추가', add_work_item: '업무 항목 추가', add_notebook_entry: '교무수첩 기록 추가', create_assignment: '숙제방 열기', create_exhibition: '전시실 열기', create_board: '참여보드 열기', approve_artworks: '작품 승인', approve_posts: '게시물 공개', publish_review: '복습 배포', get_signals: '현황 확인', get_catalog: '메뉴 살펴보기', get_storage: '저장 공간 확인', list_exhibitions: '전시실 확인', search_exhibitions: '전시 보관함 찾기', list_boards: '보드 확인', get_moderation_queue: '승인 대기 확인', get_quiz_status: '퀴즈 확인', get_review_status: '복습 확인', get_playground_status: '말놀이터 확인', get_points: '보말 확인', list_card_sets: '카드 확인', find_base_vocab: '기본 어휘 찾기', list_class_tools: '수업 도구 확인', list_neighborhood_packs: '동네 탐험 자료 찾기', get_neighborhood_pack: '동네 탐험 자료 열기',
  get_calendar: '일정 확인', get_timetable: '시간표 확인', get_lesson_log: '수업 일지 확인', search_workspace: '업무 폴더 찾기', get_work_item: '업무 항목 열기',
  list_classes: '학급 확인', get_roster: '명단 확인', list_assignments: '숙제 확인', get_missing_submissions: '미제출 확인', get_review_queue: '검사 대기 확인',
  list_deadlines: '마감 확인', search_notebook: '교무수첩 찾기', set_reminder: '알림 예약', list_schedule: '알림 확인', remember: '기억하기', forget: '기억 지우기',
  manage_homework: '숙제 관리', manage_exhibition: '전시실 관리', manage_board: '참여보드 관리', manage_quiz: '퀴즈 관리', manage_review: '복습 관리', manage_playground: '말놀이터 관리', manage_points: '보말', manage_cards: '카드 배부', manage_class_tools: '수업 도구', manage_class: '학급 관리', manage_workspace: '업무 공간 관리',
};
const PREVIEW_LABELS: Record<string, string> = {title: '제목', date: '날짜', start: '시작', end: '끝', kind: '종류', subject: '과목', period: '교시', unit: '단원', note: '메모', body: '내용', type: '종류', due_at: '기한', tags: '태그', students: '학생', checklist: '체크리스트', url: '링크', class: '학급', submission: '제출 방식', sync_exhibition: '전시실 연동', sync_board: '보드 연동', exhibition: '전시실', board: '보드', count: '개수', target: '대상', action: '할 일', changes: '바꿀 내용', reason: '사유', amount: '점수'};
const CONVERSATION = 'berry.conversation';

async function api<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`/api/berry/${path}`, {method: body ? 'POST' : 'GET', cache: 'no-store', ...(body ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '처리하지 못했어요.');
  return data as T;
}
const shown = (value: unknown) => Array.isArray(value) ? value.join(', ') : value === null || value === undefined || value === '' ? null : typeof value === 'boolean' ? (value ? '예' : '아니요') : String(value);
/** Berry's [이름](/teacher/…) links become banners under the answer; only ourclass teacher pages, never outside links. */
const BANNER_LINK = /\[([^\]\n]{1,120})\]\((\/teacher(?:[/?][^\s)]{0,400})?)\)/g;
function withBanners(text: string) {
  const links = [...text.matchAll(BANNER_LINK)].map(match => ({label: match[1], href: match[2]}));
  return {text: text.replace(BANNER_LINK, '$1'), links: [...new Map(links.map(link => [link.href, link])).values()].slice(0, 12)};
}
function bannerKind(href: string) {
  if (href.includes('archive=1')) return {icon: Images, label: '전시 보관함에서 보기'};
  if (href.startsWith('/teacher/exhibitions')) return {icon: Images, label: '전시실 열기'};
  if (href.startsWith('/teacher/homework')) return {icon: ClipboardList, label: href.includes('assignmentId=') ? '숙제 열기' : '숙제 메뉴 열기'};
  if (href.startsWith('/teacher/boards')) return {icon: StickyNote, label: '참여보드 열기'};
  return {icon: ArrowUpRight, label: '바로 열기'};
}
/** Berry's **굵게** shows as bold; no other markdown is interpreted. */
const Bold = ({text}: {text: string}) => <>{text.split(/\*\*([^*\n]+)\*\*/).map((part, index) => index % 2 ? <strong key={index}>{part}</strong> : part)}</>;
function Banners({links}: {links: {label: string; href: string}[]}) {
  if (!links.length) return null;
  return <div className="bp-banners">{links.map(link => <a key={link.href} className="bp-banner" href={link.href}>
    <span className="bp-banner-icon">{(() => {const Icon = bannerKind(link.href).icon; return <Icon size={17}/>;})()}</span>
    <span><strong>{link.label}</strong><small>{bannerKind(link.href).label}</small></span>
    <ChevronRight size={16}/>
  </a>)}</div>;
}
const clock = (iso: string) => {const d = new Date(Date.parse(iso) + 9 * 3_600_000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;};

function Preview({card, onDecide}: {card: Card; onDecide: (card: Card, decision: 'approve' | 'reject') => void}) {
  const [armed, setArmed] = useState(false);
  const rows = Object.entries(card.preview ?? {}).filter(([key, value]) => PREVIEW_LABELS[key] && shown(value) !== null);
  // Risky actions (delete, deduct, reset) say so in red and need a second press.
  const danger = typeof card.preview?.danger === 'string' ? card.preview.danger : '', savedNote = typeof card.preview?.saved_note === 'string' ? card.preview.saved_note : '';
  const approve = () => {if (danger && !armed) {setArmed(true); return;} onDecide(card, 'approve');};
  return <div className={`bp-card is-${card.state}${danger ? ' is-danger' : ''}`}>
    <strong>{TOOL_LABELS[card.tool] ?? card.tool}</strong>
    {danger && <p className="bp-danger"><TriangleAlert size={14}/>{danger}</p>}
    <dl>{rows.map(([key, value]) => <div key={key}><dt>{PREVIEW_LABELS[key]}</dt><dd>{key === 'changes' && Array.isArray(value) ? value.join('\n') : shown(value)}</dd></div>)}</dl>
    {card.state === 'open' || card.state === 'saving' ? <div className="bp-card-actions">
      <button type="button" className="button soft" disabled={card.state === 'saving'} onClick={() => {setArmed(false); onDecide(card, 'reject');}}>취소</button>
      <button type="button" className={`button primary${armed ? ' is-armed' : ''}`} disabled={card.state === 'saving'} onClick={approve}>{card.state === 'saving' ? <LoaderCircle className="spin" size={14}/> : danger ? <TriangleAlert size={14}/> : <Check size={14}/>}{armed ? '한 번 더 누르면 실행' : danger ? '실행' : '저장'}</button>
    </div> : <p className="bp-card-note">{card.state === 'saved' ? (savedNote || (card.tool.startsWith('create_') ? '열었어요. 학생 화면에 바로 보여요.' : '저장했어요. 업무 공간·교무수첩에서 "베리 제안"을 확정하면 반영돼요.')) : card.state === 'rejected' ? '저장하지 않았어요.' : card.note}</p>}
  </div>;
}

/** "할 수 있는 일": groups of one-tap requests. Blanks go to the input box; complete requests are sent at once. */
function Abilities({onPick, granted, off}: {onPick: (ability: Ability) => void; granted?: readonly string[]; off?: readonly string[]}) {
  const groups = abilityGroups(off);
  const [group, setGroup] = useState(groups[0].key);
  const current = groups.find(entry => entry.key === group) ?? groups[0];
  return <div className="bp-abilities">
    <div className="bp-ability-groups" role="tablist" aria-label="할 수 있는 일 분류">{groups.map(entry => <button type="button" role="tab" key={entry.key} aria-selected={entry.key === group} onClick={() => setGroup(entry.key)}><span aria-hidden="true">{entry.emoji}</span>{entry.label}</button>)}</div>
    <div className="bp-ability-list">{current.abilities.map(ability => {
      const locked = !!granted && lackingFor(ability, granted).length > 0;
      return <button type="button" key={ability.label} className={[ability.danger ? 'is-danger' : '', locked ? 'is-locked' : ''].filter(Boolean).join(' ')} title={locked ? '다시 연결하면 쓸 수 있어요' : ability.prompt} onClick={() => onPick(ability)}>
        {locked ? <Lock size={13} aria-hidden="true"/> : ability.write ? <PencilLine size={13} aria-hidden="true"/> : <MessageCircle size={13} aria-hidden="true"/>}<span>{ability.label}</span>
      </button>;
    })}</div>
    <p className="bp-ability-hint"><PencilLine size={11} aria-hidden="true"/> 표시는 확인 카드에서 [저장]을 눌러야 반영돼요. <a href="/teacher/berry">전체 안내</a></p>
  </div>;
}

/** Floating Berry chat for teachers. Talks only to /api/berry (same origin); the brain never sees the session cookie. */
export default function BerryPanel() {
  const pathname = usePathname();
  const [status, setStatus] = useState<{available: boolean; connected: boolean; scopes?: string[]; off?: string[]} | null>(null), [open, setOpen] = useState(false), [tab, setTab] = useState<'chat' | 'menu' | 'inbox'>('chat');
  const [messages, setMessages] = useState<Message[]>([]), [text, setText] = useState(''), [busy, setBusy] = useState(false), [activity, setActivity] = useState(''), [error, setError] = useState('');
  const [inbox, setInbox] = useState<InboxItem[] | null>(null), [notice, setNotice] = useState('');
  const [asked, setAsked] = useState<Ability | null>(null);
  const conversation = useRef<string | null>(null), list = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    try {conversation.current = sessionStorage.getItem(CONVERSATION);} catch {}
    const result = new URLSearchParams(window.location.search).get('berry');
    if (result) {
      setOpen(true);
      setNotice(result === 'connected' ? '모두의 교실과 연결됐어요. 이제 물어보세요.' : result === 'denied' ? '연결을 취소했어요.' : '연결하지 못했어요. 다시 시도해 주세요.');
      const url = new URL(window.location.href); url.searchParams.delete('berry'); history.replaceState(null, '', url);
    }
    api<{available: boolean; connected: boolean; scopes?: string[]; off?: string[]}>('status').then(setStatus).catch(() => setStatus({available: false, connected: false}));
  }, []);
  const loadInbox = useCallback(() => {api<{items: InboxItem[]}>('inbox').then(data => setInbox(data.items)).catch(e => setError((e as Error).message));}, []);
  useEffect(() => {if (open && tab === 'inbox' && status?.connected) loadInbox();}, [open, tab, status, loadInbox]);
  // The list unmounts on the menu and inbox tabs, so coming back lands on the latest message too.
  useEffect(() => {list.current?.scrollTo({top: list.current.scrollHeight});}, [messages, activity, tab]);
  // Buttons on /teacher/berry (or anywhere) open the panel with a request: window.dispatchEvent(new CustomEvent('berry:ask', {detail}))
  useEffect(() => {
    const onAsk = (event: Event) => {const detail = (event as CustomEvent<Ability>).detail; if (detail?.prompt) {setOpen(true); setTab('chat'); setAsked(detail);}};
    window.addEventListener('berry:ask', onAsk);
    return () => window.removeEventListener('berry:ask', onAsk);
  }, []);
  useEffect(() => {if (asked && status?.connected && !busy) {setAsked(null); pick(asked);}}, [asked, status, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!status?.available) return null;

  async function connect() {
    setBusy(true); setError('');
    try {window.location.assign((await api<{authorize_url: string}>('connect', {})).authorize_url);} catch (e) {setError((e as Error).message); setBusy(false);}
  }
  const patchCard = (id: string, patch: Partial<Card>) => setMessages(old => old.map(message => message.cards?.some(card => card.inbox_id === id) ? {...message, cards: message.cards.map(card => card.inbox_id === id ? {...card, ...patch} : card)} : message));
  async function decide(card: Card, decision: 'approve' | 'reject') {
    patchCard(card.inbox_id, {state: 'saving'});
    try {await api(`inbox/${card.inbox_id}/${decision}`, {}); patchCard(card.inbox_id, {state: decision === 'approve' ? 'saved' : 'rejected'});}
    catch (e) {patchCard(card.inbox_id, {state: 'error', note: (e as Error).message});}
  }
  function pick(ability: Ability) {
    if (status?.scopes && lackingFor(ability, status.scopes).length) {setTab('menu'); setNotice(`'${ability.label}'은(는) 베리를 다시 연결하면 쓸 수 있어요.`); return;}
    setTab('chat'); setNotice('');
    const blank = firstBlank(ability.prompt);
    if (!blank) {if (busy) setAsked(ability); else void send(ability.prompt); return;}
    setText(ability.prompt);
    requestAnimationFrame(() => {input.current?.focus(); input.current?.setSelectionRange(blank[0], blank[1]);});
  }
  async function send(override?: string) {
    const message = (override ?? text).trim();
    if (!message || busy) return;
    setText(''); setBusy(true); setError(''); setActivity('생각하는 중…');
    setMessages(old => [...old, {role: 'user', text: message}, {role: 'assistant', text: '', cards: []}]);
    const update = (fn: (last: Message) => Message) => setMessages(old => [...old.slice(0, -1), fn(old[old.length - 1])]);
    try {
      const response = await fetch('/api/berry/chat', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text: message, conversation_id: conversation.current, context: {route: pathname}})});
      if (!response.ok || !response.body) throw new Error((await response.json().catch(() => ({}))).error || '베리가 답하지 못했어요.');
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? '';
        for (const block of events) {
          const event = /^event: ?(.*)$/m.exec(block)?.[1]?.trim(), raw = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          let data: Record<string, unknown> = {};
          try {data = JSON.parse(raw || '{}');} catch {}
          if (event === 'conversation' && typeof data.conversation_id === 'string') {conversation.current = data.conversation_id; try {sessionStorage.setItem(CONVERSATION, data.conversation_id);} catch {}}
          if (event === 'status') setActivity(`${TOOL_LABELS[String(data.tool)] ?? '확인'} 중…`);
          if (event === 'card') update(last => ({...last, cards: [...(last.cards ?? []), {inbox_id: String(data.inbox_id), tool: String(data.tool), preview: (data.preview ?? null) as Record<string, unknown> | null, state: 'open'}]}));
          if (event === 'message') update(last => ({...last, text: String(data.text ?? '')}));
          if (event === 'error') throw new Error(String(data.message ?? '답을 만들지 못했어요.'));
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setMessages(old => old[old.length - 1]?.role === 'assistant' && !old[old.length - 1].text && !old[old.length - 1].cards?.length ? old.slice(0, -1) : old);
    } finally {setBusy(false); setActivity('');}
  }
  async function dismiss(item: InboxItem) {
    try {await api(`inbox/${item.id}/done`, {}); setInbox(old => old?.filter(entry => entry.id !== item.id) ?? null);} catch (e) {setError((e as Error).message);}
  }
  const newChat = () => {conversation.current = null; try {sessionStorage.removeItem(CONVERSATION);} catch {} setMessages([]);};
  const missing = status.scopes ? missingPermissions(status.scopes) : null;
  const reconnect = status.connected && missing && missing.scopes.length > 0 && tab !== 'inbox' && <div className="bp-reconnect" role="status">
    <p><strong>베리를 다시 연결해 주세요.</strong> 지금 연결에는 {missing.titles.join(', ')} 권한이 없어서 자물쇠 버튼을 쓸 수 없어요. 연결 화면에서 <strong>쓰기 항목까지 모두 선택</strong>해 주세요.</p>
    <button type="button" className="button primary" disabled={busy} onClick={() => void connect()}><PlugZap size={14}/>다시 연결</button>
  </div>;

  return <>
    <button type="button" className="bp-fab" aria-label="베리 열기" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={22}/> : <img src="/berry/raspberry-160.webp" alt="" width="46" height="46"/>}</button>
    {open && <section className="bp-panel" aria-label="베리">
      <header className="bp-head">
        <strong className="bp-title"><img src="/berry/raspberry-64.webp" alt="" width="28" height="28"/>베리</strong>
        {status.connected && <div className="bp-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'is-active' : ''} onClick={() => setTab('chat')}><MessageCircle size={14}/>대화</button>
          <button type="button" role="tab" aria-selected={tab === 'menu'} className={tab === 'menu' ? 'is-active' : ''} onClick={() => setTab('menu')}><LayoutGrid size={14}/>메뉴</button>
          <button type="button" role="tab" aria-selected={tab === 'inbox'} className={tab === 'inbox' ? 'is-active' : ''} onClick={() => setTab('inbox')}><Inbox size={14}/>알림함</button>
        </div>}
        <button type="button" className="icon-button" aria-label="닫기" onClick={() => setOpen(false)}><X size={18}/></button>
      </header>
      {notice && <p className="bp-notice">{notice}</p>}
      {error && <p className="bp-error" role="alert">{error}</p>}
      {reconnect}
      {!status.connected ? <div className="bp-connect">
        <div className="bp-duo" aria-hidden="true"><img src="/berry/blueberry-160.webp" alt="" width="72" height="72"/><img src="/berry/raspberry-160.webp" alt="" width="64" height="64"/></div>
        <p>베리가 우리 반 숙제·일정·업무 공간을 보고 도와드리려면 모두의 교실과 한 번 연결해야 해요.</p>
        <ul><li>학생은 "학생 07"처럼 가명으로만 봐요.</li><li>상담·건강·가정 기록은 볼 수 없어요.</li><li>저장은 선생님이 카드에서 [저장]을 눌러야만 돼요.</li></ul>
        <button type="button" className="button primary" disabled={busy} onClick={() => void connect()}>{busy ? <LoaderCircle className="spin" size={16}/> : <PlugZap size={16}/>}모두의 교실 연결하기</button>
      </div> : tab === 'chat' ? <>
        <div className="bp-messages" ref={list}>
          {!messages.length && <div className="bp-empty"><img className="bp-hero" src="/berry/raspberry-160.webp" alt="" width="84" height="84"/><p>무엇을 도와드릴까요? 버튼을 누르거나 편하게 말로 시켜 주세요.</p><Abilities onPick={pick} granted={status.scopes} off={status.off}/></div>}
          {/* The empty answer placeholder stays hidden until text or a card arrives, so Berry never shows an avatar with nothing beside it. */}
          {messages.map((message, index) => !message.text && !message.cards?.length ? null : <div key={index} className={`bp-msg is-${message.role}`}>
            {message.role === 'assistant' && <img className="bp-avatar" src="/berry/raspberry-64.webp" alt="" width="26" height="26"/>}
            {message.text && (() => {const view = withBanners(message.text); return <><p><Bold text={view.text}/></p><Banners links={view.links}/></>;})()}
            {message.cards?.map(card => <Preview key={card.inbox_id} card={card} onDecide={(c, d) => void decide(c, d)}/>)}
          </div>)}
          {activity && <div className="bp-msg is-assistant" role="status"><img className="bp-avatar" src="/berry/raspberry-64.webp" alt="" width="26" height="26"/><p className="bp-thinking"><LoaderCircle className="spin" size={14}/>{activity}</p></div>}
        </div>
        <div className="bp-input">
          {messages.length > 0 && <button type="button" className="bp-ability-toggle" aria-label="메뉴 열기" title="메뉴 열기" onClick={() => setTab('menu')}><Sparkles size={17}/></button>}
          <textarea ref={input} value={text} rows={2} maxLength={4000} placeholder="베리에게 물어보세요" aria-label="베리에게 보낼 메시지" onChange={e => setText(e.target.value)} onKeyDown={e => {if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {e.preventDefault(); void send();}}}/>
          <button type="button" className="button primary" aria-label="보내기" disabled={busy || !text.trim()} onClick={() => void send()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Send size={16}/>}</button>
        </div>
        {messages.length > 0 && <button type="button" className="bp-new" onClick={newChat}>새 대화</button>}
      </> : tab === 'menu' ? <div className="bp-messages">
        {/* The conversation stays in state here: picking a button or the tab returns to it and continues the same thread. */}
        <div className="bp-empty"><img className="bp-hero" src="/berry/raspberry-160.webp" alt="" width="84" height="84"/><p>{messages.length ? '버튼을 누르면 지금 대화에 이어서 부탁해요.' : '무엇을 도와드릴까요? 버튼을 누르거나 편하게 말로 시켜 주세요.'}</p><Abilities onPick={pick} granted={status.scopes} off={status.off}/></div>
        {messages.length > 0 && <button type="button" className="bp-back" onClick={() => setTab('chat')}><MessageCircle size={14}/>{busy ? '답하는 중이에요. 대화 보기' : '대화로 돌아가기'}</button>}
      </div> : <div className="bp-messages">
        {!inbox ? <p className="bp-activity"><LoaderCircle className="spin" size={14}/>불러오는 중…</p> : !inbox.length ? <p className="bp-muted">새 알림이 없어요.</p> : inbox.map(item => <div key={item.id} className="bp-card">
          <strong>{item.title_generic}</strong><small>{clock(item.created_at)}</small>
          {item.kind === 'briefing' && <Briefing payload={item.payload}/>}
          {item.kind === 'reminder' && typeof item.payload.label === 'string' && <p>{item.payload.label}</p>}
          {item.kind === 'routine' && typeof item.payload.text === 'string' && <p className="bp-routine">{item.payload.text}</p>}
          {item.kind !== 'write_approval' && <div className="bp-card-actions"><button type="button" className="button soft" onClick={() => void dismiss(item)}>확인</button></div>}
        </div>)}
      </div>}
    </section>}
  </>;
}

function Briefing({payload}: {payload: Record<string, unknown>}) {
  const today = (payload.today ?? []) as {title: string; start: string; all_day: boolean}[], deadlines = (payload.deadlines ?? []) as {title: string; dueAt: string}[];
  const pending = (payload.review as {total_pending?: number} | null)?.total_pending ?? 0, conflicts = Number(payload.conflicts ?? 0);
  return <ul className="bp-brief">
    <li>오늘 일정 {today.length}건{today.length ? `: ${today.slice(0, 3).map(event => event.title).join(', ')}` : ''}</li>
    <li>3일 안 마감 {deadlines.length}건{deadlines.length ? `: ${deadlines.slice(0, 3).map(task => task.title).join(', ')}` : ''}</li>
    <li>검사 대기 {pending}건</li>
    {conflicts > 0 && <li>겹치는 일정 {conflicts}건</li>}
  </ul>;
}
