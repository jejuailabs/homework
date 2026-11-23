'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {withBanners} from './links';
import {usePathname} from 'next/navigation';
import {ArrowUpRight, Check, ChevronRight, ClipboardList, Images, Inbox, LayoutGrid, LoaderCircle, Lock, MessageCircle, Mic, Paperclip, PencilLine, PlugZap, Send, Sparkles, Square, StickyNote, TriangleAlert, X} from 'lucide-react';
import {abilityGroups, firstBlank, lackingFor, missingPermissions, type Ability} from './abilities';
import {useVoiceInput} from './voice';
import {pickGreeting, remember, seoul, type Greeting, type GreetingHistory} from './greetings';
import {AttachButton, AttachChips, useAttachments} from '@/modules/attachments/client';
import {ACCEPT_HINT, MAX_PER_MESSAGE} from '@/modules/attachments/policy';
import './styles.css';

type Card = {inbox_id: string; tool: string; preview: Record<string, unknown> | null; state: 'open' | 'saving' | 'saved' | 'rejected' | 'error'; note?: string};
type Message = {role: 'user' | 'assistant'; text: string; cards?: Card[]; files?: string[]};
type InboxItem = {id: string; kind: string; rule: string | null; title_generic: string; payload: Record<string, unknown>; status: string; created_at: string};
const TOOL_LABELS: Record<string, string> = {
  add_calendar_event: '일정 추가', add_lesson_log: '수업 일지 추가', add_work_item: '업무 항목 추가', add_notebook_entry: '교무수첩에 기록할까요?', create_assignment: '숙제방 열기', create_exhibition: '전시실 열기', create_board: '참여보드 열기', approve_artworks: '작품 승인', approve_posts: '게시물 공개', publish_review: '복습 배포', get_signals: '현황 확인', get_catalog: '메뉴 살펴보기', get_storage: '저장 공간 확인', list_exhibitions: '전시실 확인', search_exhibitions: '전시 보관함 찾기', list_boards: '보드 확인', get_moderation_queue: '승인 대기 확인', get_quiz_status: '퀴즈 확인', get_review_status: '복습 확인', get_playground_status: '말놀이터 확인', get_points: '보말 확인', list_card_sets: '카드 확인', find_base_vocab: '기본 어휘 찾기', list_class_tools: '수업 도구 확인', list_neighborhood_packs: '동네 탐험 자료 찾기', get_neighborhood_pack: '동네 탐험 자료 열기',
  get_calendar: '일정 확인', get_timetable: '시간표 확인', read_attachment: '붙인 파일 읽기', list_attachments: '붙인 파일 확인', get_lesson_log: '수업 일지 확인', search_workspace: '업무 폴더 찾기', get_work_item: '업무 항목 열기',
  list_classes: '학급 확인', get_roster: '명단 확인', list_assignments: '숙제 확인', get_missing_submissions: '미제출 확인', get_submission_times: '제출 시간 확인', get_review_queue: '검사 대기 확인',
  list_deadlines: '마감 확인', search_notebook: '교무수첩 찾기', set_reminder: '알림 예약', list_schedule: '알림 확인', remember: '기억하기', forget: '기억 지우기',
  manage_homework: '숙제 관리', manage_exhibition: '전시실 관리', manage_board: '참여보드 관리', manage_quiz: '퀴즈 관리', manage_review: '복습 관리', manage_playground: '말놀이터 관리', manage_points: '보말', manage_cards: '카드 배부', manage_class_tools: '수업 도구', manage_class: '학급 관리', manage_workspace: '업무 공간 관리',
};
const PREVIEW_LABELS: Record<string, string> = {title: '제목', date: '날짜', start: '시작', end: '끝', kind: '종류', subject: '과목', period: '교시', unit: '단원', note: '메모', body: '내용', type: '종류', due_at: '기한', tags: '태그', students: '학생', checklist: '체크리스트', url: '링크', class: '학급', submission: '제출 방식', sync_exhibition: '전시실 연동', sync_board: '보드 연동', exhibition: '전시실', board: '보드', count: '개수', target: '대상', action: '할 일', changes: '바꿀 내용', reason: '사유', amount: '점수'};
const CONVERSATION = 'berry.conversation', GREETED = 'berry.greeted', GREETINGS = 'berry.greetings';
type TodayBriefing = {state: 'loading'} | {state: 'ready'; item: InboxItem | null; readyAt?: string} | {state: 'hidden'};

/** Today's first hello on this device: a written line, shown once per Seoul day; null when already greeted today. */
function firstGreetingToday(now = Date.now()): Greeting | null {
  try {
    const today = seoul(now).date;
    if (localStorage.getItem(GREETED) === today) return null;
    const saved = JSON.parse(localStorage.getItem(GREETINGS) ?? '[]') as unknown, history = Array.isArray(saved) ? saved as GreetingHistory : [];
    const greeting = pickGreeting(now, history);
    localStorage.setItem(GREETED, today);
    localStorage.setItem(GREETINGS, JSON.stringify(remember(history, today, greeting.id)));
    return greeting;
  } catch {return pickGreeting(now, []);}
}
/** "오늘 일정 2 · 마감 1 · 검사 대기 5": the briefing's numbers on one line; null when there is nothing to look at. */
function summaryLine(payload: Record<string, unknown>) {
  const count = (value: unknown) => Array.isArray(value) ? value.length : 0;
  const parts: [string, number][] = [['오늘 일정', count(payload.today)], ['마감', count(payload.deadlines)], ['검사 대기', Number((payload.review as {total_pending?: number} | null)?.total_pending ?? 0)], ['밤사이 알림', count(payload.overnight)]];
  if (!parts.some(([, n]) => n > 0)) return null;
  return parts.filter(([, n], index) => index < 3 || n > 0).map(([label, n]) => `${label} ${n}`).join(' · ');
}

async function api<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`/api/berry/${path}`, {method: body ? 'POST' : 'GET', cache: 'no-store', ...(body ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '처리하지 못했어요.');
  return data as T;
}
const shown = (value: unknown) => Array.isArray(value) ? value.join(', ') : value === null || value === undefined || value === '' ? null : typeof value === 'boolean' ? (value ? '예' : '아니요') : String(value);
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
    <span><strong>{link.label || bannerKind(link.href).label}</strong>{link.label && <small>{bannerKind(link.href).label}</small>}</span>
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
      <button type="button" className={`button primary${armed ? ' is-armed' : ''}`} disabled={card.state === 'saving'} onClick={approve}>{card.state === 'saving' ? <LoaderCircle className="spin" size={14}/> : danger ? <TriangleAlert size={14}/> : <Check size={14}/>}{armed ? '한 번 더 누르면 실행' : danger ? '실행' : card.tool === 'add_notebook_entry' ? '기록' : '저장'}</button>
    </div> : <p className="bp-card-note">{card.state === 'saved' ? (savedNote || (card.tool.startsWith('create_') ? '열었어요. 학생 화면에 바로 보여요.' : card.tool === 'add_notebook_entry' ? <>교무수첩에 기록했어요. <a href="/teacher/me/notebook">교무수첩</a>에서 고치거나 지울 수 있어요.</> : '저장했어요. 업무 공간에서 "베리 제안"을 확정하면 반영돼요.')) : card.state === 'rejected' ? '저장하지 않았어요.' : card.note}</p>}
  </div>;
}

/** "할 수 있는 일": groups of one-tap requests. Blanks go to the input box; complete requests are sent at once. */
function Abilities({onPick, granted, off}: {onPick: (ability: Ability) => void; granted?: readonly string[]; off?: readonly string[]}) {
  const groups = abilityGroups(off);
  const [group, setGroup] = useState(groups[0].key);
  const current = groups.find(entry => entry.key === group) ?? groups[0];
  const strip = useRef<HTMLDivElement>(null);
  // A mouse wheel only scrolls up and down; turn it sideways so the category chips move on desktop too.
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if ((event.deltaY < 0 && el.scrollLeft <= 0) || (event.deltaY > 0 && el.scrollLeft >= max)) return;
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    };
    el.addEventListener('wheel', onWheel, {passive: false});
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  return <div className="bp-abilities">
    <div className="bp-ability-groups" ref={strip} role="tablist" aria-label="할 수 있는 일 분류">{groups.map(entry => <button type="button" role="tab" key={entry.key} aria-selected={entry.key === group} onClick={event => {setGroup(entry.key); event.currentTarget.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'smooth'});}}><span aria-hidden="true">{entry.emoji}</span>{entry.label}</button>)}</div>
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
  const [status, setStatus] = useState<{available: boolean; connected: boolean; scopes?: string[]; off?: string[]; attach?: boolean} | null>(null), [open, setOpen] = useState(false), [tab, setTab] = useState<'chat' | 'menu' | 'inbox'>('chat');
  const [messages, setMessages] = useState<Message[]>([]), [text, setText] = useState(''), [busy, setBusy] = useState(false), [activity, setActivity] = useState(''), [error, setError] = useState('');
  const [inbox, setInbox] = useState<InboxItem[] | null>(null), [notice, setNotice] = useState('');
  const [asked, setAsked] = useState<Ability | null>(null);
  const [topic, setTopic] = useState('');
  const [greeting, setGreeting] = useState<Greeting | null>(null), [brief, setBrief] = useState<TodayBriefing>({state: 'hidden'}), [briefOpen, setBriefOpen] = useState(false);
  const greeted = useRef(false);
  const conversation = useRef<string | null>(null), list = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const voice = useVoiceInput(text, setText);
  // Files are read into text as soon as they are attached, so sending is as quick as a plain message.
  const files = useAttachments(MAX_PER_MESSAGE), [dropping, setDropping] = useState(false);
  useEffect(() => {
    try {conversation.current = sessionStorage.getItem(CONVERSATION);} catch {}
    const result = new URLSearchParams(window.location.search).get('berry');
    if (result) {
      setOpen(true);
      setNotice(result === 'connected' ? '모두의 교실과 연결됐어요. 이제 물어보세요.' : result === 'denied' ? '연결을 취소했어요.' : '연결하지 못했어요. 다시 시도해 주세요.');
      const url = new URL(window.location.href); url.searchParams.delete('berry'); history.replaceState(null, '', url);
    }
    api<{available: boolean; connected: boolean; scopes?: string[]; off?: string[]; attach?: boolean}>('status').then(setStatus).catch(() => setStatus({available: false, connected: false}));
  }, []);
  const loadInbox = useCallback(() => {api<{items: InboxItem[]}>('inbox').then(data => setInbox(data.items)).catch(e => setError((e as Error).message));}, []);
  useEffect(() => {if (open && tab === 'inbox' && status?.connected) loadInbox();}, [open, tab, status, loadInbox]);
  // First open with a connection: say hello (once a day on this device) and fetch today's briefing (the brain makes it on first ask).
  useEffect(() => {
    if (!open || !status?.connected || greeted.current) return;
    greeted.current = true;
    setGreeting(firstGreetingToday());
    setBrief({state: 'loading'});
    api<{item: InboxItem | null; ready_at?: string; off?: boolean}>('briefing')
      .then(data => setBrief(data.off ? {state: 'hidden'} : {state: 'ready', item: data.item, readyAt: data.ready_at}))
      .catch(() => setBrief({state: 'hidden'}));
  }, [open, status]);
  // The list unmounts on the menu and inbox tabs, so coming back lands on the latest message too.
  useEffect(() => {list.current?.scrollTo({top: list.current.scrollHeight});}, [messages, activity, tab]);
  // Buttons on /teacher/berry (or anywhere) open the panel with a request: window.dispatchEvent(new CustomEvent('berry:ask', {detail}))
  useEffect(() => {
    const onAsk = (event: Event) => {const detail = (event as CustomEvent<Ability>).detail; if (detail?.prompt) {setOpen(true); setTab('chat'); setAsked(detail);}};
    // "To 베리" buttons open the chat with a first line for that screen and send nothing.
    const onOpen = (event: Event) => {setOpen(true); setTab('chat'); setTopic((event as CustomEvent<{topic?: string}>).detail?.topic ?? '');};
    window.addEventListener('berry:ask', onAsk); window.addEventListener('berry:open', onOpen);
    return () => {window.removeEventListener('berry:ask', onAsk); window.removeEventListener('berry:open', onOpen);};
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
    const message = (override ?? text).trim(), attached = override === undefined ? files.ready : [];
    if ((!message && !attached.length) || busy || (override === undefined && files.busy)) return;
    if (voice.listening) voice.cancel();
    setText(''); setBusy(true); setError(''); setActivity('생각하는 중…');
    // The files now belong to this message: the list empties, the read text stays on the server for later turns.
    if (attached.length) files.clear();
    setMessages(old => [...old, {role: 'user', text: message, ...(attached.length ? {files: attached.map(file => file.name)} : {})}, {role: 'assistant', text: '', cards: []}]);
    const update = (fn: (last: Message) => Message) => setMessages(old => [...old.slice(0, -1), fn(old[old.length - 1])]);
    try {
      // A new conversation carries the hello Berry just showed, so a reply to it reads naturally.
      const hello = !conversation.current && greeting ? [greeting.text, todaySummary].filter(Boolean).join(' / ') : undefined;
      const response = await fetch('/api/berry/chat', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text: message, ...(attached.length ? {attachments: attached.map(file => file.id)} : {}), conversation_id: conversation.current, context: {route: pathname, ...(hello ? {greeting: hello} : {})}})});
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
  const todayItem = brief.state === 'ready' ? brief.item : null, todaySummary = todayItem ? summaryLine(todayItem.payload) : null;
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
          {/* Hello and today's briefing stay on top; the menu buttons live in the 메뉴 tab (✨ beside the input). */}
          {!messages.length && <img className="bp-hero" src="/berry/raspberry-160.webp" alt="" width="84" height="84"/>}
          <div className="bp-msg is-assistant bp-today">
            <img className="bp-avatar" src="/berry/raspberry-64.webp" alt="" width="26" height="26"/>
            <p>{topic || (greeting?.text ?? '선생님, 무엇을 도와드릴까요? 편하게 말로 시켜 주세요.')}</p>
            {brief.state === 'loading' && <p className="bp-thinking"><LoaderCircle className="spin" size={14}/>오늘 브리핑 준비 중…</p>}
            {brief.state === 'ready' && !todayItem && brief.readyAt && <p className="bp-today-line">오늘 브리핑은 {brief.readyAt}부터 볼 수 있어요.</p>}
            {brief.state === 'ready' && todayItem && <div className="bp-card bp-today-card">
              <strong>{todaySummary ?? '오늘은 따로 챙길 일이 없어요.'}</strong>
              {todaySummary && <button type="button" className="button soft" aria-expanded={briefOpen} onClick={() => setBriefOpen(!briefOpen)}>{briefOpen ? '브리핑 접기' : '오늘 브리핑 보기'}</button>}
              {briefOpen && <Briefing payload={todayItem.payload}/>}
            </div>}
            {!messages.length && <small className="bp-today-hint"><Sparkles size={11} aria-hidden="true"/>버튼으로 부탁하려면 입력창 옆 ✨이나 메뉴 탭을 눌러 주세요.</small>}
          </div>
          {/* The empty answer placeholder stays hidden until text or a card arrives, so Berry never shows an avatar with nothing beside it. */}
          {messages.map((message, index) => !message.text && !message.cards?.length && !message.files?.length ? null : <div key={index} className={`bp-msg is-${message.role}`}>
            {message.role === 'assistant' && <img className="bp-avatar" src="/berry/raspberry-64.webp" alt="" width="26" height="26"/>}
            {message.files && <ul className="bp-files">{message.files.map((name, at) => <li key={at}><Paperclip size={11}/>{name}</li>)}</ul>}
            {message.text && (() => {const view = withBanners(message.text); return <><p><Bold text={view.text}/></p><Banners links={view.links}/></>;})()}
            {message.cards?.map(card => <Preview key={card.inbox_id} card={card} onDecide={(c, d) => void decide(c, d)}/>)}
          </div>)}
          {activity && <div className="bp-msg is-assistant" role="status"><img className="bp-avatar" src="/berry/raspberry-64.webp" alt="" width="26" height="26"/><p className="bp-thinking"><LoaderCircle className="spin" size={14}/>{activity}</p></div>}
        </div>
        {status.attach && (files.items.length > 0 || files.notice) && <div className="bp-attached"><AttachChips items={files.items} onRemove={files.remove}/>{files.notice && <small>{files.notice}</small>}</div>}
        <div className={`bp-input${dropping ? ' att-drop' : ''}`} onDragOver={status.attach ? event => {if (event.dataTransfer.types.includes('Files')) {event.preventDefault(); setDropping(true);}} : undefined} onDragLeave={() => setDropping(false)} onDrop={status.attach ? event => {event.preventDefault(); setDropping(false); if (event.dataTransfer.files.length) files.add(event.dataTransfer.files);} : undefined}>
          <button type="button" className="bp-ability-toggle" aria-label="메뉴 열기" title="메뉴 열기" onClick={() => setTab('menu')}><Sparkles size={17}/></button>
          {status.attach && <AttachButton className="bp-attach" label={`파일 붙이기 (${ACCEPT_HINT})`} disabled={busy || files.full} onFiles={files.add}/>}
          <textarea ref={input} value={text} rows={2} maxLength={4000} placeholder={voice.listening ? '듣고 있어요. 말씀하신 뒤 ■를 눌러 주세요' : '베리에게 물어보세요'} aria-label="베리에게 보낼 메시지" onChange={e => setText(e.target.value)} onPaste={status.attach ? e => {if (e.clipboardData.files.length) {e.preventDefault(); files.add(e.clipboardData.files);}} : undefined} onKeyDown={e => {if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {e.preventDefault(); void send();}}}/>
          {voice.supported && <button type="button" className={`bp-mic${voice.listening ? ' is-listening' : ''}`} aria-label={voice.listening ? '음성 입력 멈추기' : '말로 입력하기'} aria-pressed={voice.listening} title={voice.listening ? '음성 입력 멈추기' : '말로 입력하기'} disabled={busy} onClick={voice.toggle}>{voice.listening ? <Square size={15}/> : <Mic size={17}/>}</button>}
          <button type="button" className="button primary" aria-label="보내기" disabled={busy || files.busy || (!text.trim() && !files.ready.length)} onClick={() => void send()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Send size={16}/>}</button>
        </div>
        {voice.error && <p className="bp-error" role="alert">{voice.error}</p>}
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
  const overnight = (Array.isArray(payload.overnight) ? payload.overnight : []) as {title?: string}[];
  const signals = (payload.signals ?? null) as {pending_artworks?: number; pending_posts?: number; storage_level?: string; storage_percent?: number; review_drafts?: number} | null;
  const approvals = (signals?.pending_artworks ?? 0) + (signals?.pending_posts ?? 0), drafts = signals?.review_drafts ?? 0;
  return <ul className="bp-brief">
    <li>오늘 일정 {today.length}건{today.length ? `: ${today.slice(0, 3).map(event => event.title).join(', ')}` : ''}</li>
    <li>3일 안 마감 {deadlines.length}건{deadlines.length ? `: ${deadlines.slice(0, 3).map(task => task.title).join(', ')}` : ''}</li>
    <li>검사 대기 {pending}건</li>
    {conflicts > 0 && <li>겹치는 일정 {conflicts}건</li>}
    {overnight.length > 0 && <li>밤사이 알림 {overnight.length}건{overnight.some(item => item.title) ? `: ${overnight.slice(0, 3).map(item => item.title ?? '').filter(Boolean).join(', ')}` : ''}</li>}
    {approvals > 0 && <li>공개 승인 대기 {approvals}건</li>}
    {drafts > 0 && <li>배포 안 한 복습 {drafts}건</li>}
    {signals?.storage_level && signals.storage_level !== 'ok' && <li>저장 공간 {signals.storage_percent ?? ''}% 사용</li>}
  </ul>;
}
