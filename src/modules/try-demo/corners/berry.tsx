'use client';
import {useEffect, useRef, useState} from 'react';
import {Check, Send} from 'lucide-react';
import {berryAssetUrl} from '@/lib/berry-brand';
import {berryTurns, type BerryCard, type BerryTurn} from '../data';

// A replay of answers recorded for the demo class. No AI and no server is called from here.
type Line = {who: 'me' | 'berry'; text?: string[]; card?: BerryCard; saved?: boolean};
export default function BerryCorner() {
  const [lines, setLines] = useState<Line[]>([{who: 'berry', text: ['안녕하세요, 선생님! 저는 우리 반 일을 챙기는 베리예요.', '아래 버튼을 눌러 물어보세요.']}]);
  const [typing, setTyping] = useState(false), [follow, setFollow] = useState<BerryTurn | null>(null), [asked, setAsked] = useState<string[]>([]);
  const end = useRef<HTMLDivElement>(null), timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {end.current?.scrollIntoView({block: 'nearest', behavior: 'smooth'});}, [lines, typing]);
  function ask(turn: BerryTurn) {
    if (typing) return;
    setFollow(null); setAsked(old => [...old, turn.ask]);
    setLines(old => [...old, {who: 'me', text: [turn.ask]}]);
    setTyping(true);
    timer.current = window.setTimeout(() => {
      setLines(old => [...old, {who: 'berry', text: turn.answer, card: turn.card}]);
      setTyping(false); setFollow(turn.follow ?? null);
    }, 900);
  }
  const save = (index: number) => setLines(old => old.map((line, i) => i === index ? {...line, saved: true} : line));
  return <div className="try-berry">
    <section className="try-card">
      <div className="try-berry-head"><img src={berryAssetUrl('berry-duo-logo')} alt=""/><div><p className="try-role">선생님 화면 · 베리</p><h2>말로 시키는 AI 비서</h2></div></div>
      <div className="try-chat" aria-live="polite">
        {lines.map((line, i) => <div key={i} className={`try-bubble ${line.who}`}>
          {line.text?.map((t, n) => <p key={n}>{t}</p>)}
          {line.card && <div className="try-confirm"><strong>{line.card.title}</strong><dl>{line.card.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            {line.saved ? <p className="try-confirm-done"><Check size={14}/>{line.card.done}</p> : <div className="try-confirm-actions"><button type="button" className="button primary" onClick={() => save(i)}>저장</button><span className="try-note">선생님이 눌러야 반영돼요</span></div>}</div>}
        </div>)}
        {typing && <div className="try-bubble berry try-typing" role="status" aria-label="베리가 답하는 중"><i/><i/><i/></div>}
        <div ref={end}/>
      </div>
      <div className="try-asks">{follow && <button type="button" className="on" disabled={typing} onClick={() => ask(follow)}><Send size={13}/>{follow.ask}</button>}
        {berryTurns.map(turn => <button key={turn.ask} type="button" disabled={typing} className={asked.includes(turn.ask) ? 'asked' : ''} onClick={() => ask(turn)}>{turn.ask}</button>)}</div>
      <p className="try-note">체험에서는 미리 받아 둔 답변을 보여 드려요. 실제 베리는 선생님 반의 숙제·전시·보드·일정을 읽고 답하며, 학생 이름은 가명으로만 다루고, 바꾸는 일은 확인 카드에서 선생님이 눌러야 반영돼요.</p>
    </section>
  </div>;
}
