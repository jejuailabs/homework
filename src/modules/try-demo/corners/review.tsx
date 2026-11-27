'use client';
import {useEffect, useRef, useState} from 'react';
import {ArrowRight, BookOpen, Check, CircleAlert, ClipboardCheck, Image as ImageIcon, LoaderCircle, MessageSquareText, Sparkles, ThumbsUp, X} from 'lucide-react';
import {student, workImage} from '../data';

// 평어 sample: one made-up student's records, the draft built from them, the NEIS-style checks, and where it lands.
// Prepared in advance (no AI call); the real screen builds the draft from the teacher's own records.
const KID = student('s3');
const HOMEWORK = [
  {title: '내가 가 보고 싶은 우주', date: '10월 14일', text: '별을 이어서 국자 모양을 만들었어요. 이름은 국자자리예요.', comment: '별자리 이름을 직접 지은 생각이 멋져요.', image: workImage('space-05', true)},
  {title: '독서 감상문', date: '11월 3일', text: '주인공이 친구를 도와주는 장면이 제일 좋았어요. 나도 전학 온 친구에게 먼저 말을 걸어 봤어요.', comment: '책 내용을 내 생활과 이어서 쓴 점이 훌륭해요.'},
  {title: '태권도 띠 발표 자료', date: '11월 18일', text: '띠마다 뜻을 찾아서 적고, 친구들 앞에서 발표했어요.', comment: '조사한 내용을 또박또박 발표했어요.'},
];
const WORKS = [{title: '내 별자리', room: '우주 전시실', image: workImage('space-05', true)}, {title: '비 온 뒤 무지개', room: '봄 그림전', image: workImage('spring-03', true)}];
const COMMENTS = ['별자리 이름을 직접 지은 생각이 멋져요.', '책 내용을 내 생활과 이어서 쓴 점이 훌륭해요.', '조사한 내용을 또박또박 발표했어요.'];
const ISSUES = [
  {good: true, date: '9월 22일', text: '모둠 활동에서 친구 의견을 끝까지 듣고 "좋은 생각이다"라고 먼저 칭찬함.'},
  {good: true, date: '10월 15일', text: '전학 온 친구에게 학교 곳곳을 안내해 줌.'},
  {good: true, date: '11월 18일', text: '태권도 발표에서 띠의 뜻을 조사해 와 친구들 질문에도 답함.'},
  {good: false, date: '10월 6일', text: '수학 익힘책 숙제를 2주 연속 늦게 냄. 이후 스스로 계획표를 만들어 11월에는 모두 제때 냄.'},
];
const DRAFT = '우주를 주제로 한 그림 활동에서 별을 직접 이어 국자자리라는 이름을 붙이는 등 자신만의 생각을 독창적으로 표현함. 독서 감상문에서 주인공이 친구를 돕는 장면을 골라 전학 온 친구에게 먼저 말을 건넨 자신의 경험과 연결하여 진솔하게 씀. 태권도 띠 발표 자료를 만들며 띠마다 담긴 뜻을 스스로 조사하여 정리하고, 친구들 앞에서 또박또박 발표하며 질문에도 차분히 답함. 모둠 활동에서 친구의 의견을 끝까지 듣고 먼저 칭찬하는 말을 건네며, 새로 온 친구를 살뜰히 챙기는 배려심이 돋보임. 과제 제출이 늦어진 적이 있었으나 스스로 계획표를 만들어 지키려고 노력하면서 점차 제때 과제를 해내는 습관이 자리 잡음. 맡은 일을 끝까지 해내려는 끈기가 있어 앞으로의 성장이 더욱 기대됨.';
const NEGATIVE = /부족|미흡|산만|문제|다툼|지적|못함|늦게 냄|게으/;
const checks = (text: string) => [
  {ok: text.length >= 350 && text.length <= 500, label: `분량 ${text.length}자 (나이스 권장 350~500자)`},
  {ok: text.split(/(?<=[.])\s*/).filter(Boolean).every(s => /(함|임|음|됨|보임|씀|잡음)\.$/.test(s.trim())), label: '문장 끝 "~함. ~임." (생활기록부 말투)'},
  {ok: !text.includes(KID.name), label: '학생 이름 없음'},
  {ok: !NEGATIVE.test(text), label: '부정 표현 없음 · 아쉬운 점은 노력과 변화로'},
];
type Panel = 'homework' | 'works' | 'comments' | 'issues' | null;

export default function ReviewCorner() {
  const [panel, setPanel] = useState<Panel>(null), [phase, setPhase] = useState<'intro' | 'writing' | 'draft' | 'saved'>('intro'), [shown, setShown] = useState(0), [text, setText] = useState(DRAFT);
  const timer = useRef(0);
  useEffect(() => () => window.clearInterval(timer.current), []);
  function write() {
    setPhase('writing'); setShown(0);
    timer.current = window.setInterval(() => setShown(n => {if (n >= DRAFT.length) {window.clearInterval(timer.current); setPhase('draft'); return n;} return n + 6;}), 30);
  }
  const list = checks(text);

  if (phase === 'saved') return <div className="try-review">
    <section className="try-card try-review-saved">
      <p className="try-role">학생별 모아 보기 › {KID.number}번 {KID.name} › 평어</p>
      <h2><Check size={22}/>행동특성 및 종합의견에 반영했어요</h2>
      <blockquote>{text}</blockquote>
      <p className="try-note">실제 서비스에서는 이 칸에 저장되고, 복사하거나 글 파일로 받아 나이스에 붙여 넣어요. 체험에서는 저장되지 않아요.</p>
      <button type="button" className="button soft" onClick={() => {setPhase('intro'); setText(DRAFT);}}>처음부터 다시 보기</button>
    </section>
  </div>;

  return <div className="try-review">
    <section className="try-card try-review-intro">
      <p className="try-role"><Sparkles size={14}/>성장 기록으로 쓰는 맞춤 평어</p>
      <h2>뻔한 예시문 대신, 그 아이가 실제로 한 일로 써요</h2>
      <ul className="try-review-points">
        <li><BookOpen size={16}/>숙제와 작품, 거기에 남긴 선생님 말씀</li>
        <li><ThumbsUp size={16}/>학생 기록의 좋은 일과 아쉬운 일</li>
        <li><ClipboardCheck size={16}/>아쉬운 일은 노력과 변화로 바꿔, 아이에게 힘이 되는 문장으로</li>
      </ul>
    </section>

    <section className="try-card try-review-kid">
      <div className="try-review-kid-head"><span className="try-review-avatar">{KID.name.slice(-1)}</span><div><strong>{KID.number}번 {KID.name}</strong><small>3학년 2반 · 샘플 학생 (가상)</small></div></div>
      <div className="try-review-sources">
        <button type="button" onClick={() => setPanel('homework')}><BookOpen size={18}/><b>숙제 {HOMEWORK.length}개</b><span>숙제 보기</span></button>
        <button type="button" onClick={() => setPanel('works')}><ImageIcon size={18}/><b>전시 작품 {WORKS.length}점</b><span>작품 보기</span></button>
        <button type="button" onClick={() => setPanel('comments')}><MessageSquareText size={18}/><b>선생님 말씀 {COMMENTS.length}개</b><span>말씀 보기</span></button>
        <button type="button" onClick={() => setPanel('issues')}><ThumbsUp size={18}/><b>기록 · 좋은 일 3 · 아쉬운 일 1</b><span>기록 보기</span></button>
      </div>
      {phase === 'intro' && <button type="button" className="try-review-go" onClick={write}><Sparkles size={20}/>평어 작성하기</button>}
      {phase !== 'intro' && <div className="try-review-draft">
        <h3>평어 초안 {phase === 'writing' && <LoaderCircle className="spin" size={16}/>}</h3>
        {phase === 'writing' ? <p className="try-review-typing">{DRAFT.slice(0, shown)}<i/></p>
          : <textarea value={text} rows={8} aria-label="평어 초안" onChange={e => setText(e.target.value)}/>}
        {phase === 'draft' && <>
          <ul className="try-review-checks">{list.map(c => <li key={c.label} className={c.ok ? 'ok' : 'no'}>{c.ok ? <Check size={15}/> : <CircleAlert size={15}/>}{c.label}</li>)}</ul>
          <p className="try-note">AI가 정리한 초안이에요. 사실과 맞는지 선생님이 읽고 고친 뒤 반영해요.</p>
          <button type="button" className="try-review-go" onClick={() => setPhase('saved')}><Check size={20}/>확인하고 반영하기<ArrowRight size={18}/></button>
        </>}
      </div>}
    </section>

    {panel && <div className="try-modal-backdrop" onClick={() => setPanel(null)}><section className="try-modal" role="dialog" aria-modal="true" aria-label="샘플 학생 기록" onClick={e => e.stopPropagation()}>
      <header><h3>{panel === 'homework' ? '숙제' : panel === 'works' ? '전시 작품' : panel === 'comments' ? '선생님 말씀' : '학생 기록'}</h3><button type="button" className="try-modal-x" aria-label="닫기" onClick={() => setPanel(null)}><X size={18}/></button></header>
      {panel === 'homework' && HOMEWORK.map(h => <article key={h.title} className={h.image ? "try-review-item" : "try-review-item no-image"}>{h.image && <img src={h.image} alt=""/>}<div><strong>{h.title}</strong><small>{h.date}</small><p>{h.text}</p><p className="try-review-comment">선생님: {h.comment}</p></div></article>)}
      {panel === 'works' && <div className="try-review-works">{WORKS.map(w => <figure key={w.title}><img src={w.image} alt={w.title}/><figcaption><strong>{w.title}</strong><small>{w.room}</small></figcaption></figure>)}</div>}
      {panel === 'comments' && <ul className="try-review-list">{COMMENTS.map(c => <li key={c}>{c}</li>)}</ul>}
      {panel === 'issues' && <ul className="try-review-list">{ISSUES.map(i => <li key={i.text} className={i.good ? 'good' : 'bad'}><b>{i.good ? '좋은 일' : '아쉬운 일'}</b><small>{i.date}</small>{i.text}</li>)}</ul>}
    </section></div>}
  </div>;
}
