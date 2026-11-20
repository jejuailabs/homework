'use client';
import {useState} from 'react';
import {Columns3, Heart, LayoutGrid, Plus} from 'lucide-react';
import {boardColors, boardColumns, boardNotes, type BoardNote} from '../data';

// A sticky-note board like the real 참여보드. Notes added here live in this screen only.
export default function BoardCorner() {
  const [notes, setNotes] = useState<BoardNote[]>(boardNotes), [layout, setLayout] = useState<'wall' | 'columns'>('columns');
  const [text, setText] = useState(''), [column, setColumn] = useState(0), [color, setColor] = useState(boardColors[0]), [liked, setLiked] = useState<string[]>([]);
  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const value = text.trim().slice(0, 80);
    if (!value) return;
    setNotes(old => [{id: 'mine-' + old.length, column, from: '나', text: value, color, hearts: 0}, ...old]);
    setText('');
  };
  const heart = (id: string) => setLiked(old => old.includes(id) ? old.filter(v => v !== id) : [...old, id]);
  const note = (n: BoardNote) => <article key={n.id} className={`try-postit${n.from === '나' ? ' new' : ''}`} style={{background: n.color}}>
    <p>{n.text}</p><footer><small>{n.from}</small><button type="button" aria-pressed={liked.includes(n.id)} aria-label={`${n.from}의 글에 하트`} onClick={() => heart(n.id)}><Heart size={14} fill={liked.includes(n.id) ? 'currentColor' : 'none'}/>{n.hearts + (liked.includes(n.id) ? 1 : 0)}</button></footer>
  </article>;
  return <div className="try-board">
    <section className="try-card">
      <div className="try-wallet"><div><p className="try-role">참여보드</p><h2>바닷속 친구들 · 오늘 배운 점</h2></div>
        <div className="try-seg" role="group" aria-label="보드 배치"><button type="button" aria-pressed={layout === 'columns'} className={layout === 'columns' ? 'on' : ''} onClick={() => setLayout('columns')}><Columns3 size={15}/>열</button><button type="button" aria-pressed={layout === 'wall'} className={layout === 'wall' ? 'on' : ''} onClick={() => setLayout('wall')}><LayoutGrid size={15}/>벽</button></div></div>
      <form className="try-board-form" onSubmit={add}>
        <input value={text} maxLength={80} placeholder="내 생각을 한 장 붙여 보세요 (체험에서는 저장되지 않아요)" aria-label="붙일 내용" onChange={e => setText(e.target.value)}/>
        <select value={column} aria-label="붙일 칸" onChange={e => setColumn(Number(e.target.value))}>{boardColumns.map((c, i) => <option key={c} value={i}>{c}</option>)}</select>
        <span className="try-colors" role="group" aria-label="쪽지 색">{boardColors.map(c => <button key={c} type="button" aria-pressed={color === c} aria-label="쪽지 색 고르기" className={color === c ? 'on' : ''} style={{background: c}} onClick={() => setColor(c)}/>)}</span>
        <button className="button primary" disabled={!text.trim()}><Plus size={16}/>붙이기</button>
      </form>
      {layout === 'columns'
        ? <div className="try-columns">{boardColumns.map((c, i) => <div key={c}><h3>{c}<small>{notes.filter(n => n.column === i).length}</small></h3>{notes.filter(n => n.column === i).map(note)}</div>)}</div>
        : <div className="try-wall-notes">{notes.map(note)}</div>}
      <p className="try-note">실제 보드는 벽·열·격자·표·타임라인·지도 등 9가지 배치가 있고, 글·사진·영상·음성·그림을 올릴 수 있어요. 선생님이 확인한 글만 보이게 할 수도 있어요.</p>
    </section>
  </div>;
}
