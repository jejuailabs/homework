'use client';
import {useEffect, useMemo, useState} from 'react';
import {RotateCcw, Timer, Trophy, Volume2} from 'lucide-react';
import {cardSet} from '../data';

// Pair matching with a sample set. The round is not recorded anywhere; reading aloud uses the browser's own voice.
type Face = {key: string; pair: number; kind: 'word' | 'meaning'; label: string; emoji: string};
function deal(seed: number): Face[] {
  const faces = cardSet.cards.flatMap((c, pair): Face[] => [{key: 'w' + pair, pair, kind: 'word', label: c.word, emoji: c.emoji}, {key: 'm' + pair, pair, kind: 'meaning', label: c.meaning, emoji: c.emoji}]);
  let v = seed;
  const random = () => (v = (v * 9301 + 49297) % 233280) / 233280;
  for (let i = faces.length - 1; i > 0; i--) {const j = Math.floor(random() * (i + 1)); [faces[i], faces[j]] = [faces[j], faces[i]];}
  return faces;
}
function speak(word: string) {
  try {const voice = new SpeechSynthesisUtterance(word); voice.lang = 'en-US'; voice.rate = .9; speechSynthesis.cancel(); speechSynthesis.speak(voice);} catch {}
}

export default function CardsCorner() {
  const [round, setRound] = useState(1), faces = useMemo(() => deal(round * 7919), [round]);
  const [open, setOpen] = useState<string[]>([]), [matched, setMatched] = useState<number[]>([]), [moves, setMoves] = useState(0), [seconds, setSeconds] = useState(0), [started, setStarted] = useState(false);
  const done = matched.length === cardSet.cards.length;
  useEffect(() => {
    if (!started || done) return;
    const timer = window.setInterval(() => setSeconds(s => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [started, done]);
  useEffect(() => {
    if (open.length !== 2) return;
    const [a, b] = open.map(key => faces.find(f => f.key === key)!);
    if (a.pair === b.pair) {setMatched(old => [...old, a.pair]); setOpen([]); return;}
    const timer = window.setTimeout(() => setOpen([]), 800);
    return () => window.clearTimeout(timer);
  }, [open, faces]);
  function flip(face: Face) {
    if (open.length === 2 || open.includes(face.key) || matched.includes(face.pair)) return;
    setStarted(true);
    if (face.kind === 'word') speak(face.label);
    if (open.length === 1) setMoves(m => m + 1);
    setOpen(old => [...old, face.key]);
  }
  const again = () => {setRound(r => r + 1); setOpen([]); setMatched([]); setMoves(0); setSeconds(0); setStarted(false);};
  return <div className="try-cards">
    <section className="try-card">
      <div className="try-wallet"><div><p className="try-role">학생 화면 · 카드놀이</p><h2>{cardSet.title} · 짝 맞추기</h2></div>
        <div className="try-score"><span><Timer size={15}/>{seconds}초</span><span>{moves}번</span><span>{matched.length} / {cardSet.cards.length}쌍</span></div></div>
      <p className="try-note">영어 단어와 뜻을 짝지어 보세요. 영어 카드를 누르면 읽어 줘요.</p>
      <div className="try-deck">{faces.map(face => {
        const shown = open.includes(face.key) || matched.includes(face.pair);
        return <button key={face.key} type="button" className={`try-flip${shown ? ' shown' : ''}${matched.includes(face.pair) ? ' matched' : ''}`} aria-label={shown ? face.label : '뒤집힌 카드'} disabled={matched.includes(face.pair)} onClick={() => flip(face)}>
          <span className="try-flip-back" aria-hidden="true">?</span>
          <span className="try-flip-front" aria-hidden={!shown}><i>{face.emoji}</i><strong lang={face.kind === 'word' ? 'en' : 'ko'}>{face.label}</strong>{face.kind === 'word' && <Volume2 size={13}/>}</span>
        </button>;
      })}</div>
      {done && <div className="try-win" role="status"><Trophy size={22}/><div><strong>모두 맞혔어요! {seconds}초 · {moves}번</strong><p>실제로는 기록이 쌓여 우리 반 순위와 보호자용 학습 소식에 반영돼요.</p></div><button type="button" className="button primary" onClick={again}><RotateCcw size={16}/>한 판 더</button></div>}
      <p className="try-note">카드놀이에는 암기·스펠·테스트와 단어 비, 문장 퍼즐, 카드 팀전도 있어요. 카드 세트는 선생님이 만들거나 CSV로 가져와요.</p>
    </section>
  </div>;
}
