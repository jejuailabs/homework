'use client';
import {useCallback, useEffect, useState} from 'react';
import {ListTodo, LoaderCircle, Pencil, Plus, Trash2} from 'lucide-react';
import type {NotebookTodo} from './types';
import './styles.css';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const seoulDate = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul'}).format(new Date());
const longDate = (date: string) => {const d = new Date(`${date}T00:00:00Z`); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;};
async function call<T>(path: string, init?: {method?: string; body?: object}): Promise<T> {
  const response = await fetch(`/api/teacher-notebook/${path}`, {cache: 'no-store', method: init?.method ?? (init?.body ? 'POST' : 'GET'), ...(init?.body ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(init.body)} : {})});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '처리하지 못했어요.');
  return data as T;
}

/**
 * To-dos on the workspace home: unfinished first (earliest due date first), finished ones folded at the bottom.
 * `date` is the day picked on the calendar beside it; `onChanged` hands the fresh list back so the calendar can mark due days.
 */
export default function Todos({date, onChanged}: {date: string; onChanged?: (todos: NotebookTodo[]) => void}) {
  const [list, setList] = useState<NotebookTodo[] | null>(null), [text, setText] = useState(''), [due, setDue] = useState(''), [error, setError] = useState('');
  const [editing, setEditing] = useState<{id: string; text: string; due: string} | null>(null), [busy, setBusy] = useState(false);
  const load = useCallback(() => call<{todos: NotebookTodo[]}>('todos').then(d => {setList(d.todos); onChanged?.(d.todos);}).catch(e => setError((e as Error).message)), [onChanged]);
  useEffect(() => {void load();}, [load]);
  async function save(id: string | null, body: {text: string; due: string | null; done: boolean}) {
    setBusy(true); setError('');
    try {await call(id ? `todos/${id}` : 'todos', {body}); await load(); return true;} catch (e) {setError((e as Error).message); return false;} finally {setBusy(false);}
  }
  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (text.trim() && await save(null, {text, due: due || null, done: false})) {setText(''); setDue('');}
  }
  async function remove(todo: NotebookTodo) {
    if (!confirm('이 할 일을 지울까요?')) return;
    try {await call(`todos/${todo.id}`, {method: 'DELETE'}); await load();} catch (e) {setError((e as Error).message);}
  }
  const today = seoulDate();
  const open = (list ?? []).filter(t => !t.done).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || b.createdAt.localeCompare(a.createdAt));
  const done = (list ?? []).filter(t => t.done);
  const row = (todo: NotebookTodo) => editing?.id === todo.id ? <li key={todo.id} className="nb-todo is-editing">
    <input aria-label="할 일 고치기" value={editing.text} maxLength={200} onChange={e => setEditing({...editing, text: e.target.value})}/>
    <input type="date" aria-label="기한" value={editing.due} onChange={e => setEditing({...editing, due: e.target.value})}/>
    <button type="button" className="button soft" onClick={() => setEditing(null)}>취소</button>
    <button type="button" className="button primary" disabled={busy || !editing.text.trim()} onClick={async () => {if (await save(todo.id, {text: editing.text, due: editing.due || null, done: todo.done})) setEditing(null);}}>저장</button>
  </li> : <li key={todo.id} className={`nb-todo${todo.done ? ' is-done' : ''}`}>
    <label><input type="checkbox" checked={todo.done} disabled={busy} onChange={() => save(todo.id, {text: todo.text, due: todo.due, done: !todo.done})}/><span>{todo.text}</span></label>
    {todo.due && <time className={!todo.done && todo.due < today ? 'is-late' : todo.due === today ? 'is-today' : ''}>{todo.due === today ? '오늘' : longDate(todo.due)}</time>}
    <button type="button" className="icon-button" aria-label="고치기" onClick={() => setEditing({id: todo.id, text: todo.text, due: todo.due ?? ''})}><Pencil size={14}/></button>
    <button type="button" className="icon-button" aria-label="삭제" onClick={() => remove(todo)}><Trash2 size={14}/></button>
  </li>;
  return <section className="nb-card nb-todos" aria-label="할 일">
    <h3><ListTodo size={18}/>할 일{open.length > 0 && <small>{open.length}개 남음</small>}</h3>
    <form className="nb-todo-add" onSubmit={add}>
      <input aria-label="새 할 일" placeholder="할 일을 적어 주세요" value={text} maxLength={200} onChange={e => setText(e.target.value)}/>
      <input type="date" aria-label="기한(선택)" value={due} onChange={e => setDue(e.target.value)}/>
      <button className="button primary" disabled={busy || !text.trim()}><Plus size={16}/>추가</button>
    </form>
    <button type="button" className="nb-link" onClick={() => setDue(date)}>기한을 {longDate(date)}로</button>
    {error && <p className="nb-error" role="alert">{error}</p>}
    {!list ? !error && <p className="nb-muted"><LoaderCircle className="spin" size={16}/> 불러오는 중…</p> : open.length === 0 ? <p className="nb-muted">남은 할 일이 없어요.</p> : <ul className="nb-todo-list">{open.map(row)}</ul>}
    {done.length > 0 && <details className="nb-todo-done"><summary>끝낸 일 {done.length}개</summary><ul className="nb-todo-list">{done.slice(0, 50).map(row)}</ul></details>}
  </section>;
}
