'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import dynamic from 'next/dynamic';
import {ArrowRight, Check, ImagePlus, Images, RotateCcw, Send, Sparkles} from 'lucide-react';
import {homework, homeworkPeers, homeworkPicks, praises, students, works, workImage} from '../data';

// One homework, three screens: the student hands it in, the teacher checks it, and it is already
// hanging in the linked room and board. The visitor's picture never leaves this browser tab.
const Scene = dynamic(() => import('@/components/exhibition-world'), {ssr: false});
const peers = homeworkPeers.map(p => {const w = works.find(x => x.id === p.workId)!; return {id: w.id, title: w.title, artist: students.find(s => s.id === w.studentId)!.name, text: p.text, url: workImage(w.id), thumb: workImage(w.id, true)};});
const STEPS = ['학생이 제출', '선생님이 검사', '전시실과 보드에'];

export default function FlowCorner() {
  const [step, setStep] = useState(0), [pick, setPick] = useState(homeworkPicks[0]), [own, setOwn] = useState(''), [text, setText] = useState('');
  const [praise, setPraise] = useState(praises[0]), [scene, setScene] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  // A chosen photo is shown from memory only and released when the corner closes.
  useEffect(() => () => {if (own) URL.revokeObjectURL(own);}, [own]);
  const mine = useMemo(() => ({id: 'mine', title: own ? '내가 올린 그림' : works.find(w => w.id === pick)!.title, artist: '나 (체험 학생)', text: text.trim() || '제가 좋아하는 것을 그렸어요.', url: own || workImage(pick), thumb: own || workImage(pick, true)}), [own, pick, text]);
  const all = [mine, ...peers];
  const choose = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    if (chosen && chosen.type.startsWith('image/')) setOwn(URL.createObjectURL(chosen));
    event.target.value = '';
  };
  const restart = () => {setScene(false); setStep(0); setText(''); setOwn(''); setPraise(praises[0]);};

  return <div className="try-flow">
    <ol className="try-flow-steps">{STEPS.map((label, i) => <li key={label} className={i === step ? 'on' : i < step ? 'done' : ''}><span>{i < step ? <Check size={13}/> : i + 1}</span>{label}</li>)}</ol>

    {step === 0 && <section className="try-card">
      <p className="try-role">학생 화면</p>
      <h2>{homework.title}</h2>
      <p className="try-note">{homework.due} · 사진으로 제출 · 낸 그림은 우리 반 전시실과 보드에 걸려요</p>
      <div className="try-picks">{homeworkPicks.map(id => <button key={id} type="button" className={!own && pick === id ? 'on' : ''} aria-pressed={!own && pick === id} onClick={() => {setOwn(''); setPick(id);}}><img src={workImage(id, true)} alt={works.find(w => w.id === id)!.title}/></button>)}
        <button type="button" className={own ? 'on try-pick-own' : 'try-pick-own'} aria-pressed={!!own} onClick={() => file.current?.click()}>{own ? <img src={own} alt="내가 고른 사진"/> : <><ImagePlus size={24}/><small>내 사진 고르기</small></>}</button>
        <input ref={file} type="file" accept="image/*" hidden onChange={choose}/>
      </div>
      <p className="try-note">고른 사진은 이 화면에서만 쓰이고 어디에도 올라가지 않아요.</p>
      <label className="try-field">한 줄 소개<input value={text} maxLength={60} placeholder="제가 좋아하는 것을 그렸어요." onChange={e => setText(e.target.value)}/></label>
      <button type="button" className="button primary try-go" onClick={() => setStep(1)}><Send size={17}/>제출하기</button>
    </section>}

    {step === 1 && <section className="try-card">
      <p className="try-role">선생님 화면</p>
      <h2>제출물 확인 · {homework.title}</h2>
      <p className="try-note">방금 낸 숙제가 맨 위에 올라왔어요. 한 명씩 넘겨 보며 말씀을 남겨요.</p>
      <ul className="try-subs">{all.map((s, i) => <li key={s.id} className={i === 0 ? 'new' : ''}><img src={s.thumb} alt=""/><div><strong>{s.artist}</strong><p>{s.text}</p></div><span className={i === 0 ? 'wait' : 'ok'}>{i === 0 ? '확인 전' : '검사 완료'}</span></li>)}</ul>
      <fieldset className="try-reasons"><legend>선생님 말씀</legend>{praises.map(p => <label key={p}><input type="radio" name="try-praise" checked={praise === p} onChange={() => setPraise(p)}/>{p}</label>)}</fieldset>
      <button type="button" className="button primary try-go" onClick={() => setStep(2)}><Check size={17}/>참 잘했어요 · 검사 완료</button>
    </section>}

    {step === 2 && <>
      <p className="try-flash"><Sparkles size={15}/>검사하는 순간, 전시실과 보드에 자동으로 걸렸어요. 선생님이 따로 옮기지 않았어요.</p>
      <div className="try-flow-result">
        <section className="try-card">
          <p className="try-role">전시실</p><h2>{homework.room}</h2>
          {scene ? <div className="try-flow-scene"><Scene stage="gallery" buildings={[]} rooms={[]} onEnterBuilding={() => {}} onEnterRoom={() => {}} theme="forest" roomTitle={homework.room} artworks={all.map(s => ({id: s.id, title: s.title, url: s.url, thumbnailUrl: s.thumb, artistName: s.artist}))} paused={false} onSelectArtwork={() => {}} onExit={() => setScene(false)} locale="ko"/></div>
            : <div className="try-wall">{all.map((s, i) => <figure key={s.id} className={i === 0 ? 'new' : ''}><img src={s.thumb} alt={s.title}/><figcaption>{s.artist}{i === 0 && <em>방금 걸렸어요</em>}</figcaption></figure>)}</div>}
          <button type="button" className="button soft" onClick={() => setScene(!scene)}><Images size={16}/>{scene ? '액자 목록으로' : '3D 전시실로 보기'}</button>
        </section>
        <section className="try-card">
          <p className="try-role">참여보드</p><h2>{homework.board}</h2>
          <div className="try-notes">{all.map((s, i) => <article key={s.id} style={{background: ['#fff3b0', '#ffd6e0', '#d3f0dc', '#d6e8ff', '#eadcff', '#fff3b0'][i]}} className={i === 0 ? 'new' : ''}><img src={s.thumb} alt=""/><p>{s.text}</p><small>{s.artist}</small></article>)}</div>
          <p className="try-note">선생님 말씀: &quot;{praise}&quot;</p>
        </section>
      </div>
      <div className="try-flow-again"><button type="button" className="button soft" onClick={restart}><RotateCcw size={16}/>처음부터 다시</button><span className="try-note">숙제를 만들 때 &quot;전시실·보드 연동&quot;을 한 번 켜 두면 돼요<ArrowRight size={13}/></span></div>
    </>}
  </div>;
}
