'use client';
import {useEffect, useRef, useState} from 'react';
import {Check, ClipboardCheck, FilePlus2, LoaderCircle, PlayCircle, Send, X} from 'lucide-react';
import {berryAssetUrl} from '@/lib/berry-brand';
import {berryDemo, berryVideo, student, workImage, works} from '../data';

// Left: a screen recording of the two requests. Right: the same two requests to press yourself.
// Everything is a replay prepared for the demo class. No AI and no server is called from here.
type Flow = 'give' | 'check';
type Line = {who: 'me' | 'berry'; text: string[]; open?: Flow; done?: boolean};
const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

export default function BerryCorner() {
  const [lines, setLines] = useState<Line[]>([{who: 'berry', text: ['안녕하세요, 선생님! 저는 우리 반 일을 함께 챙기는 부담임 베리예요.', '아래 버튼을 눌러 말을 걸어 보세요.']}]);
  const [thinking, setThinking] = useState(''), [modal, setModal] = useState<Flow | null>(null), [finished, setFinished] = useState<Flow[]>([]);
  const busy = useRef(false), alive = useRef(true), end = useRef<HTMLDivElement>(null);
  useEffect(() => () => {alive.current = false;}, []);
  useEffect(() => {end.current?.scrollIntoView({block: 'nearest', behavior: 'smooth'});}, [lines, thinking]);

  async function ask(flow: Flow) {
    if (busy.current) return;
    busy.current = true;
    const script = berryDemo[flow];
    setLines(old => [...old, {who: 'me', text: [script.ask]}]);
    for (const step of script.thinking) {if (!alive.current) return; setThinking(step); await wait(850);}
    if (!alive.current) return;
    setThinking('');
    setLines(old => [...old, {who: 'berry', text: script.answer, open: flow}]);
    busy.current = false;
  }
  function complete(flow: Flow) {
    setModal(null); setFinished(old => [...old, flow]);
    setLines(old => [...old.map(line => line.open === flow ? {...line, done: true} : line), {who: 'berry', text: [berryDemo[flow].done]}]);
  }

  return <div className="try-berry try-berry-split">
    <section className="try-card try-berry-video">
      <p className="try-role"><PlayCircle size={14}/>체험 영상</p>
      <h2>이렇게 말하면, 이렇게 해 줘요</h2>
      <video src={berryVideo.src} poster={berryVideo.poster} autoPlay muted loop playsInline controls preload="metadata" aria-label="부담임 베리에게 숙제 내기와 숙제 검사를 맡기는 화면 영상"/>
      <ol className="try-berry-steps"><li><b>“오늘 숙제 좀 내 줘”</b> → 초안을 열고 저장하면 숙제가 나가요.</li><li><b>“숙제 검사해 줘”</b> → 칭찬 한마디까지 준비된 검사 화면이 열려요.</li></ol>
    </section>

    <section className="try-card try-berry-live">
      <div className="try-berry-head"><img src={berryAssetUrl('berry-duo-logo')} alt=""/><div><p className="try-role">직접 해 보기 · 부담임 베리</p><h2>말로 시키는 부담임 AI</h2></div></div>
      <div className="try-chat" aria-live="polite">
        {lines.map((line, i) => <div key={i} className={`try-bubble ${line.who}`}>
          {line.text.map((t, n) => <p key={n}>{t}</p>)}
          {line.open && (line.done
            ? <p className="try-confirm-done"><Check size={14}/>{line.open === 'give' ? '숙제를 냈어요' : '검사를 마쳤어요'}</p>
            : <button type="button" className="try-berry-action" onClick={() => setModal(line.open!)}>{line.open === 'give' ? <FilePlus2 size={17}/> : <ClipboardCheck size={17}/>}{berryDemo[line.open].button}</button>)}
        </div>)}
        {thinking && <div className="try-bubble berry try-thinking" role="status"><LoaderCircle className="spin" size={15}/>{thinking}…</div>}
        <div ref={end}/>
      </div>
      <div className="try-asks try-asks-big">
        {(['give', 'check'] as Flow[]).map(flow => <button key={flow} type="button" className={finished.includes(flow) ? 'asked' : 'on'} disabled={!!thinking || !!modal} onClick={() => void ask(flow)}><Send size={15}/>{berryDemo[flow].ask}</button>)}
      </div>
      <p className="try-note">체험에서는 미리 받아 둔 답변을 보여 드려요. 실제 부담임 베리는 선생님 반의 숙제·전시·일정을 읽고 답하며, 학생 이름은 가명으로만 AI에 전달하고, 저장은 선생님이 눌러야 반영돼요.</p>
    </section>

    {modal === 'give' && <GiveModal onClose={() => setModal(null)} onDone={() => complete('give')}/>}
    {modal === 'check' && <CheckModal onClose={() => setModal(null)} onDone={() => complete('check')}/>}
  </div>;
}

function Modal({title, onClose, children}: {title: string; onClose: () => void; children: React.ReactNode}) {
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    box.current?.querySelector<HTMLElement>('button, input, textarea')?.focus();
    const onKey = (event: KeyboardEvent) => {if (event.key === 'Escape') onClose();};
    document.addEventListener('keydown', onKey);
    return () => {document.removeEventListener('keydown', onKey); previous?.focus();};
  }, [onClose]);
  return <div className="try-modal-backdrop" onClick={onClose}><section ref={box} className="try-modal" role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}>
    <header><h3>{title}</h3><button type="button" className="try-modal-x" aria-label="닫기" onClick={onClose}><X size={18}/></button></header>
    {children}
  </section></div>;
}

function useSaving(onDone: () => void) {
  const [saving, setSaving] = useState(false);
  const save = () => {if (saving) return; setSaving(true); window.setTimeout(onDone, 1100);};
  return [saving, save] as const;
}

function GiveModal({onClose, onDone}: {onClose: () => void; onDone: () => void}) {
  const draft = berryDemo.give.draft, [saving, save] = useSaving(onDone);
  const [title, setTitle] = useState(draft.title), [body, setBody] = useState(draft.body);
  return <Modal title="숙제 내기 · 베리가 만든 초안" onClose={onClose}>
    <p className="try-modal-lead">베리가 채워 둔 내용이에요. 고칠 곳만 고치고 저장하세요.</p>
    <label className="try-modal-field">제목<input value={title} maxLength={40} onChange={e => setTitle(e.target.value)}/></label>
    <label className="try-modal-field">설명<textarea rows={3} value={body} maxLength={200} onChange={e => setBody(e.target.value)}/></label>
    <dl className="try-modal-rows">
      <div><dt>마감</dt><dd>{draft.due}</dd></div>
      <div><dt>제출 방식</dt><dd>{draft.kind}</dd></div>
      <div><dt>전시관 연동</dt><dd><span className="try-on">켜짐</span>{draft.room}</dd></div>
      <div><dt>받는 학생</dt><dd>{draft.to}</dd></div>
    </dl>
    <footer><button type="button" className="button soft" onClick={onClose}>취소</button><button type="button" className="button primary" disabled={saving || !title.trim()} onClick={save}>{saving ? <><LoaderCircle className="spin" size={16}/>숙제 내는 중</> : <><Check size={16}/>저장하고 숙제 내기</>}</button></footer>
    <p className="try-note">체험에서는 실제로 저장되지 않아요.</p>
  </Modal>;
}

function CheckModal({onClose, onDone}: {onClose: () => void; onDone: () => void}) {
  const items = berryDemo.check.items.map(item => {const work = works.find(w => w.id === item.workId)!; return {...item, title: work.title, name: student(work.studentId).name, thumb: workImage(work.id, true)};});
  const [notes, setNotes] = useState(() => items.map(item => item.note)), [saving, save] = useSaving(onDone);
  return <Modal title="숙제 검사 · 내가 가 보고 싶은 우주" onClose={onClose}>
    <p className="try-modal-lead">베리가 칭찬 한마디를 미리 적어 두었어요. 고칠 곳만 고치고 한 번에 검사하세요.</p>
    <div className="try-check-grid">{items.map((item, i) => <article key={item.workId}>
      <img src={item.thumb} alt={item.title}/>
      <div><strong>{item.name}</strong><small>{item.title}</small>
        <input aria-label={`${item.name} 칭찬 한마디`} value={notes[i]} maxLength={60} onChange={e => setNotes(old => old.map((n, k) => k === i ? e.target.value : n))}/></div>
    </article>)}</div>
    <footer><button type="button" className="button soft" onClick={onClose}>취소</button><button type="button" className="button primary" disabled={saving} onClick={save}>{saving ? <><LoaderCircle className="spin" size={16}/>검사하는 중</> : <><Check size={16}/>모두 “참 잘했어요”로 검사</>}</button></footer>
    <p className="try-note">체험에서는 실제로 저장되지 않아요.</p>
  </Modal>;
}
