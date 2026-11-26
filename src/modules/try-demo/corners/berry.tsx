'use client';
import {useEffect, useRef, useState} from 'react';
import {Check, LoaderCircle, Send, ShieldCheck, X} from 'lucide-react';
import {berryAssetUrl} from '@/lib/berry-brand';
import {tryBerryExamples, tryBerryGreeting} from '@/modules/try-live/config';

// The real Berry, talking as the tour's demo teacher through /api/try. Save buttons on cards really save into the
// demo class, which is put back to its starting state every night.
type Card = {inbox_id: string; tool: string; preview: Record<string, unknown> | null; state: 'open' | 'saving' | 'saved' | 'rejected' | 'error'; note?: string};
type Message = {role: 'user' | 'assistant'; text: string; cards?: Card[]};
const TOOL_TITLES: Record<string, string> = {create_assignment: '숙제 내기', approve_artworks: '작품 승인', add_calendar_event: '일정 추가', create_exhibition: '전시실 열기', create_board: '참여보드 열기', add_notebook_entry: '교무수첩 기록', add_lesson_log: '수업 일지', add_work_item: '업무 항목', publish_review: '복습 배포', approve_posts: '글 승인', manage_homework: '숙제 관리', manage_exhibition: '전시실 관리'};
const ACTIVITY: Record<string, string> = {list_assignments: '숙제를 살펴보는 중', get_review_queue: '검사할 숙제를 모으는 중', get_missing_submissions: '안 낸 학생을 확인하는 중', get_roster: '명단을 확인하는 중', list_classes: '학급을 확인하는 중', get_signals: '오늘 챙길 것을 모으는 중', open_menu: '메뉴를 여는 중', load_tools: '필요한 도구를 고르는 중'};
const LABELS: Record<string, string> = {title: '제목', description: '설명', body: '내용', due_at: '마감', submission_type: '제출 방식', class_name: '학급', date: '날짜', start: '시작', end: '끝', students: '학생', note: '메모', theme: '테마', link_exhibition: '전시관 연동'};
const show = (value: unknown) => Array.isArray(value) ? value.map(v => typeof v === 'object' && v ? Object.values(v).join(' ') : String(v)).join(', ') : typeof value === 'object' && value ? JSON.stringify(value) : String(value);

export default function BerryCorner() {
  const [messages, setMessages] = useState<Message[]>([{role: 'assistant', text: tryBerryGreeting}]);
  const [input, setInput] = useState(''), [busy, setBusy] = useState(false), [activity, setActivity] = useState(''), [error, setError] = useState('');
  const conversation = useRef<string | undefined>(undefined), end = useRef<HTMLDivElement>(null);
  useEffect(() => {end.current?.scrollIntoView({block: 'nearest', behavior: 'smooth'});}, [messages, activity]);

  async function send(raw: string) {
    const text = raw.trim(); if (!text || busy) return;
    setBusy(true); setError(''); setInput(''); setActivity('우리 반 자료를 찾는 중');
    setMessages(old => [...old, {role: 'user', text}, {role: 'assistant', text: '', cards: []}]);
    const update = (fn: (last: Message) => Message) => setMessages(old => [...old.slice(0, -1), fn(old[old.length - 1])]);
    try {
      const response = await fetch('/api/try/berry/chat', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text, conversation_id: conversation.current})});
      if (!response.ok || !response.body) throw new Error((await response.json().catch(() => ({}))).error || '베리가 답하지 못했어요.');
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        const events = buffer.split(/\r?\n\r?\n/); buffer = events.pop() ?? '';
        for (const block of events) {
          const event = /^event: ?(.*)$/m.exec(block)?.[1]?.trim(), payload = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          let data: Record<string, unknown> = {};
          try {data = JSON.parse(payload || '{}');} catch {}
          if (event === 'conversation' && typeof data.conversation_id === 'string') conversation.current = data.conversation_id;
          if (event === 'status') setActivity(ACTIVITY[String(data.tool)] ?? '확인하는 중');
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
  async function decide(card: Card, action: 'approve' | 'reject') {
    const patch = (p: Partial<Card>) => setMessages(old => old.map(m => m.cards?.some(c => c.inbox_id === card.inbox_id) ? {...m, cards: m.cards.map(c => c.inbox_id === card.inbox_id ? {...c, ...p} : c)} : m));
    patch({state: 'saving'});
    try {
      const response = await fetch(`/api/try/berry/inbox/${card.inbox_id}/${action}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || '처리하지 못했어요.');
      patch({state: action === 'approve' ? 'saved' : 'rejected'});
    } catch (e) {patch({state: 'error', note: (e as Error).message});}
  }

  return <div className="try-berry-live">
    <section className="try-card">
      <div className="try-berry-head"><img src={berryAssetUrl('berry-duo-logo')} alt=""/><div><p className="try-role">부담임 베리 · 실제 AI</p><h2>우리 반 자료로만 답하는 부담임 챗봇</h2></div></div>
      <p className="try-berry-safe"><ShieldCheck size={16}/>체험 학급(가상 학생 10명)의 자료로 답해요. 저장하면 실제로 반영되고, 체험 학급은 매일 밤 처음으로 돌아가요.</p>
      <div className="try-chat" aria-live="polite">
        {messages.map((m, i) => (m.text || m.cards?.length) ? <div key={i} className={`try-bubble ${m.role === 'user' ? 'me' : 'berry'}`}>
          {m.text.split('\n').filter(Boolean).map((t, n) => <p key={n}>{t}</p>)}
          {m.cards?.map(card => <div key={card.inbox_id} className="try-confirm"><strong>{TOOL_TITLES[card.tool] ?? '확인 카드'}</strong>
            {card.preview && <dl>{Object.entries(card.preview).filter(([, v]) => v !== null && v !== '' && v !== undefined).slice(0, 8).map(([k, v]) => <div key={k}><dt>{LABELS[k] ?? k}</dt><dd>{show(v)}</dd></div>)}</dl>}
            {card.state === 'saved' ? <p className="try-confirm-done"><Check size={14}/>저장했어요. 체험 학급에 반영됐어요.</p>
              : card.state === 'rejected' ? <p className="try-note">취소했어요.</p>
              : <div className="try-confirm-actions"><button type="button" className="button primary" disabled={card.state === 'saving'} onClick={() => void decide(card, 'approve')}>{card.state === 'saving' ? <LoaderCircle className="spin" size={15}/> : <Check size={15}/>}저장</button><button type="button" className="button soft" disabled={card.state === 'saving'} onClick={() => void decide(card, 'reject')}><X size={15}/>취소</button>{card.note && <span className="try-note">{card.note}</span>}</div>}
          </div>)}
        </div> : null)}
        {activity && <div className="try-bubble berry try-thinking" role="status"><LoaderCircle className="spin" size={15}/>{activity}…</div>}
        <div ref={end}/>
      </div>
      {error && <p className="try-error" role="alert">{error}</p>}
      <div className="try-asks try-asks-big">{tryBerryExamples.map(q => <button key={q} type="button" disabled={busy} onClick={() => void send(q)}>{q}</button>)}</div>
      <form className="try-berry-form" onSubmit={e => {e.preventDefault(); void send(input);}}>
        <input value={input} maxLength={300} placeholder="아무거나 물어보세요" aria-label="베리에게 보낼 말" onChange={e => setInput(e.target.value)}/>
        <button type="submit" className="button primary" disabled={busy || !input.trim()}>{busy ? <LoaderCircle className="spin" size={16}/> : <Send size={16}/>}보내기</button>
      </form>
    </section>
  </div>;
}
