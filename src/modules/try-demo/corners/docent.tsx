'use client';
import {useEffect, useRef, useState} from 'react';
import {LoaderCircle, Pause, Play, Send, Sparkles} from 'lucide-react';
import {docentAudio, docentImage, docentItems, type DocentItem} from '../docent';

// One child's work, one button. The voice is the child's own recording; questions go to the docent AI through /api/try,
// which answers only from the work and what the child said.
const EXAMPLES = ['왜 글씨를 크게 썼어요?', '이 작품에서 칭찬할 점은?', '어떤 순서로 설명했나요?'];
type Answer = {q: string; a: string; error?: boolean};

export default function DocentCorner() {
  const [item, setItem] = useState<DocentItem>(docentItems[0]), [started, setStarted] = useState(false), [playing, setPlaying] = useState(false), [time, setTime] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]), [question, setQuestion] = useState(''), [asking, setAsking] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {setTime(0); setPlaying(false); setAnswers([]);}, [item]);

  function play() {
    const el = audio.current; if (!el) return;
    setStarted(true);
    if (el.paused) void el.play().catch(() => setPlaying(false)); else el.pause();
  }
  async function ask(text: string) {
    const q = text.trim(); if (!q || asking) return;
    setAsking(true); setQuestion('');
    try {
      const response = await fetch('/api/try/docent/ask', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({item: item.id, question: q})});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '답하지 못했어요.');
      setAnswers(old => [...old, {q, a: data.answer}]);
    } catch (e) {setAnswers(old => [...old, {q, a: (e as Error).message, error: true}]);}
    finally {setAsking(false);}
  }
  const active = started && time > 0 ? item.segments.findIndex(s => time >= s.start && time < s.end) : -1;

  return <div className="try-docent">
    <section className="try-docent-stage">
      <figure className="try-docent-art"><img src={docentImage(item.id)} alt={item.title}/>
        {!started && <div className="try-docent-coach">
          <p className="try-coach-text">작품을 만든 아이가 직접 설명해 줘요</p>
          <span className="try-coach-arrow" aria-hidden="true">⬇</span>
          <button type="button" className="try-docent-start" onClick={play}><Play size={24}/>도슨트 들어보기</button>
        </div>}
      </figure>
      <div className="try-docent-side">
        <p className="try-role">3학년 · 태권도 띠 발표 자료</p>
        <h2>{item.title}</h2><p className="try-docent-theme">{item.theme}</p>
        <audio ref={audio} src={docentAudio(item.id)} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={e => setTime(e.currentTarget.currentTime)}/>
        {started && <button type="button" className="try-docent-play" onClick={play}>{playing ? <><Pause size={18}/>잠깐 멈추기</> : <><Play size={18}/>{time > 0 && time < item.duration - 0.3 ? '이어 듣기' : '다시 듣기'}</>}</button>}
        <ol className="try-docent-lines" aria-label="아이가 말한 내용">
          {item.segments.map((s, i) => <li key={i} className={i === active ? 'on' : i < active ? 'past' : ''}><button type="button" onClick={() => {if (audio.current) {audio.current.currentTime = s.start; setStarted(true); void audio.current.play();}}}>{s.text}</button></li>)}
        </ol>
        <p className="try-note">이름은 가렸고, 보호자와 담임 선생님 동의를 받아 실제 목소리를 그대로 들려 드려요.</p>
        <div className="try-docent-others">{docentItems.filter(d => d.id !== item.id).map(d => <button key={d.id} type="button" onClick={() => {audio.current?.pause(); setItem(d);}}><img src={docentImage(d.id, true)} alt=""/><span>{d.title}</span></button>)}</div>
      </div>
    </section>

    {started && <section className="try-card try-docent-ask">
      <h3><Sparkles size={18}/>도슨트에게 물어보기</h3>
      <p className="try-note">AI 도슨트가 이 작품과 아이의 설명만 근거로 답해요.</p>
      {answers.map((x, i) => <div key={i} className="try-docent-qa"><p className="q">{x.q}</p><p className={x.error ? 'a error' : 'a'}>{x.a}</p></div>)}
      {asking && <p className="try-thinking"><LoaderCircle className="spin" size={15}/>작품과 아이 설명을 살펴보는 중…</p>}
      <div className="try-asks">{EXAMPLES.map(q => <button key={q} type="button" disabled={asking} onClick={() => void ask(q)}>{q}</button>)}</div>
      <form className="try-docent-form" onSubmit={e => {e.preventDefault(); void ask(question);}}><input value={question} maxLength={300} placeholder="작품에 대해 궁금한 걸 물어보세요" aria-label="도슨트에게 물어볼 말" onChange={e => setQuestion(e.target.value)}/><button type="submit" className="button primary" disabled={asking || !question.trim()}><Send size={16}/>묻기</button></form>
    </section>}
  </div>;
}
