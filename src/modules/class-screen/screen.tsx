'use client';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, Bell as BellIcon, BellOff, ExternalLink, Lock, LockOpen, Maximize2, Pause, Play, Plus, RotateCcw, Settings2, Shuffle, Trash2, X} from 'lucide-react';
import {CARD_LABELS, THEMES, WIDTHS, clockLabel, dday, defaultState, draw, newCard, nowIn, parseState, periodNumber, type Card, type CardKind, type ScreenState} from './policy';
import './styles.css';

/**
 * 교실 화면. Everything lives in this browser: the layout is saved under one localStorage key and
 * mirrored to a second window (the classroom display) through a BroadcastChannel. No server is used,
 * except an optional one-time read of the teacher's own timetable.
 */
const KEY = 'class-screen:v1', CHANNEL = 'class-screen';
const DAYS = ['월', '화', '수', '목', '금'];
const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function read(): ScreenState {
  try {return parseState(JSON.parse(localStorage.getItem(KEY) || 'null'));} catch {return defaultState();}
}
function beep() {
  try {
    const Audio = window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext, ctx = new Audio(), osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.value = 880; gain.gain.setValueAtTime(.18, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .7);
    osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .7); osc.onended = () => void ctx.close();
  } catch {}
}

export default function ClassScreen({view}: {view: boolean}) {
  const [state, setState] = useState<ScreenState | null>(null), [now, setNow] = useState(() => new Date()), [settings, setSettings] = useState(false), [adding, setAdding] = useState(false), [note, setNote] = useState('');
  const channel = useRef<BroadcastChannel | null>(null), alerted = useRef(''), root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setState(read());
    const sync = () => setState(read());
    window.addEventListener('storage', sync);
    try {channel.current = new BroadcastChannel(CHANNEL); channel.current.onmessage = sync;} catch {}
    const tick = window.setInterval(() => setNow(new Date()), 1000);
    return () => {window.removeEventListener('storage', sync); channel.current?.close(); window.clearInterval(tick);};
  }, []);
  const update = useCallback((change: (old: ScreenState) => ScreenState) => setState(old => {
    if (!old) return old;
    const next = change(old);
    try {localStorage.setItem(KEY, JSON.stringify(next)); channel.current?.postMessage(1);} catch {}
    return next;
  }), []);
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`, today = localDay(now), weekday = now.getDay() - 1;
  const moment = useMemo(() => state ? nowIn(state.bells, hhmm, state.alert) : null, [state, hhmm]);
  // One chime per heads-up, not one per second.
  useEffect(() => {
    if (!state?.sound || !moment?.alert || !moment.next) return;
    const key = today + moment.next.start;
    if (alerted.current !== key) {alerted.current = key; beep();}
  }, [state?.sound, moment, today]);
  if (!state || !moment) return <div className="csc csc-loading">교실 화면을 불러오는 중이에요…</div>;

  const theme = THEMES[state.theme] ?? THEMES.paper, scene = state.scenes.find(s => s.id === state.active) ?? state.scenes[0], editing = !view && !state.locked;
  const todaySubjects = weekday >= 0 && weekday < 5 ? state.subjects[weekday] : [];
  const period = periodNumber(state.bells, moment.index), subjectNow = period ? todaySubjects[period - 1] : '';
  const nextPeriod = moment.next ? periodNumber(state.bells, state.bells.indexOf(moment.next)) : 0, subjectNext = nextPeriod ? todaySubjects[nextPeriod - 1] : '';
  const setCards = (change: (cards: Card[]) => Card[]) => update(old => ({...old, scenes: old.scenes.map(s => s.id === scene.id ? {...s, cards: change(s.cards)} : s)}));
  const patch = (id: string, values: Partial<Card>) => setCards(cards => cards.map(c => c.id === id ? {...c, ...values} : c));
  const move = (id: string, step: number) => setCards(cards => {const i = cards.findIndex(c => c.id === id), j = i + step; if (i < 0 || j < 0 || j >= cards.length) return cards; const next = [...cards]; [next[i], next[j]] = [next[j], next[i]]; return next;});
  const fullscreen = () => {const el = root.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.().catch(() => setNote('이 브라우저에서는 F11 키로 전체 화면을 켜 주세요.'));};
  const popOut = () => {const opened = window.open(`${location.pathname}?view=1`, 'class-screen-view', 'popup,width=1280,height=760'); if (!opened) setNote('새 창이 막혔어요. 브라우저의 팝업 차단을 풀어 주세요.');};
  async function importTimetable() {
    try {
      const {call} = await import('@/modules/teacher-workspace/api'), {weekKeyOf} = await import('@/modules/teacher-workspace/shared');
      const table = await call<{slots: {day: number; period: number; subject: string}[]}>(`timetable/${weekKeyOf(today)}`);
      if (!table.slots.length) {setNote('업무 공간에 이번 주 시간표가 아직 없어요.'); return;}
      update(old => ({...old, subjects: old.subjects.map((_, day) => {const row: string[] = []; for (const slot of table.slots) if (slot.day === day + 1 && slot.period >= 1 && slot.period <= 12) row[slot.period - 1] = slot.subject; return Array.from(row, v => v ?? '');})}));
      setNote('업무 공간의 이번 주 시간표를 가져왔어요.');
    } catch {setNote('시간표를 가져오지 못했어요. 아래 표에 직접 적어 주세요.');}
  }

  function body(card: Card) {
    if (card.kind === 'clock') return <div className="csc-clock"><time>{hhmm}<small>:{pad(now.getSeconds())}</small></time>
      <p>{now.getMonth() + 1}월 {now.getDate()}일 {'일월화수목금토'[now.getDay()]}요일</p>
      <strong>{moment!.index >= 0 ? `지금 ${moment!.label}${subjectNow ? ` · ${subjectNow}` : ''}` : moment!.label}</strong>
      <span>{moment!.index >= 0 ? `${moment!.until}분 남았어요` : moment!.next ? `${moment!.next.label}${subjectNext ? ` ${subjectNext}` : ''}까지 ${moment!.toNext}분` : '오늘도 수고했어요'}</span></div>;
    if (card.kind === 'timetable') {
      const rows = state!.bells.map((bell, index) => ({bell, index, n: periodNumber(state!.bells, index)}));
      return <ol className="csc-table">{rows.map(({bell, index, n}) => <li key={index} className={index === moment!.index ? 'now' : ''}><b>{bell.label}</b><span>{n ? todaySubjects[n - 1] || '' : ''}</span><small>{bell.start}</small></li>)}</ol>;
    }
    if (card.kind === 'timer') {
      const running = card.endsAt > 0, left = running ? Math.max(0, Math.ceil((card.endsAt - now.getTime()) / 1000)) : card.left;
      const set = (seconds: number) => patch(card.id, {endsAt: 0, left: seconds});
      return <div className={`csc-timer${running && left === 0 ? ' done' : ''}`}><time>{clockLabel(left)}</time>
        {!view && <div className="csc-row">{[1, 3, 5, 10].map(m => <button key={m} type="button" onClick={() => set(m * 60)}>{m}분</button>)}
          <button type="button" aria-label={running ? '멈춤' : '시작'} disabled={!left} onClick={() => patch(card.id, running ? {endsAt: 0, left} : {endsAt: Date.now() + left * 1000})}>{running ? <Pause size={18}/> : <Play size={18}/>}</button>
          <button type="button" aria-label="처음으로" onClick={() => set(0)}><RotateCcw size={18}/></button></div>}</div>;
    }
    if (card.kind === 'picker') {
      const last = card.drawn.at(-1);
      return <div className="csc-picker"><time>{last ?? '?'}</time><span>{last ? `${last}번` : '누가 뽑힐까요'} · {card.drawn.length}/{state!.students}</span>
        {!view && <div className="csc-row"><button type="button" onClick={() => patch(card.id, {drawn: draw(state!.students, card.drawn).drawn})}><Shuffle size={18}/>뽑기</button><button type="button" aria-label="처음부터" onClick={() => patch(card.id, {drawn: []})}><RotateCcw size={18}/></button></div>}</div>;
    }
    if (card.kind === 'dday') return editing
      ? <div className="csc-edit"><input value={card.text} maxLength={30} placeholder="무슨 날인가요" aria-label="D-day 이름" onChange={e => patch(card.id, {text: e.target.value})}/><input type="date" value={card.date} aria-label="날짜" onChange={e => patch(card.id, {date: e.target.value})}/></div>
      : <div className="csc-dday"><time>{dday(card.date, today) || 'D-?'}</time><span>{card.text || '날짜를 정해 주세요'}</span></div>;
    const lines = card.text.split('\n').map(l => l.trim()).filter(Boolean);
    if (editing) return <textarea className="csc-area" value={card.text} maxLength={600} rows={card.h === 2 ? 8 : 4} aria-label={CARD_LABELS[card.kind]} placeholder={card.kind === 'todo' ? '한 줄에 하나씩 적어요' : card.kind === 'lunch' ? '오늘 급식을 적어요' : '아이들에게 알릴 말을 적어요'} onChange={e => patch(card.id, {text: e.target.value})}/>;
    if (!lines.length) return <p className="csc-empty">{view ? '' : '잠금을 풀고 내용을 적어 주세요'}</p>;
    return card.kind === 'todo' ? <ul className="csc-list">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : <div className="csc-text">{lines.map((l, i) => <p key={i}>{l}</p>)}</div>;
  }

  return <div ref={root} className={`csc${view ? ' view' : ''}`} style={{background: theme.bg, color: theme.ink, '--csc-card': theme.card, '--csc-scale': state.scale} as React.CSSProperties}>
    {!view && <header className="csc-bar">
      <div className="csc-scenes" role="tablist" aria-label="장면">{state.scenes.map(s => <button key={s.id} type="button" role="tab" aria-selected={s.id === scene.id} className={s.id === scene.id ? 'on' : ''} onClick={() => update(old => ({...old, active: s.id}))}>{s.name}</button>)}</div>
      <div className="csc-tools">
        <button type="button" aria-pressed={!state.locked} onClick={() => update(old => ({...old, locked: !old.locked}))}>{state.locked ? <><Lock size={16}/>배치 바꾸기</> : <><LockOpen size={16}/>배치 잠그기</>}</button>
        {editing && <button type="button" aria-expanded={adding} onClick={() => setAdding(v => !v)}><Plus size={16}/>카드</button>}
        <button type="button" onClick={() => setSettings(true)}><Settings2 size={16}/>시정표·설정</button>
        <button type="button" aria-pressed={state.sound} aria-label={state.sound ? '알림 소리 끄기' : '알림 소리 켜기'} onClick={() => {if (!state.sound) beep(); update(old => ({...old, sound: !old.sound}));}}>{state.sound ? <BellIcon size={16}/> : <BellOff size={16}/>}</button>
        <button type="button" onClick={popOut}><ExternalLink size={16}/>전자칠판 창</button>
        <button type="button" onClick={fullscreen}><Maximize2 size={16}/>전체 화면</button>
        <button type="button" aria-label="교실 화면 나가기" onClick={() => location.assign('/teacher/tools')}><X size={16}/>나가기</button>
      </div>
      {editing && adding && <div className="csc-add">{(Object.keys(CARD_LABELS) as CardKind[]).map(kind => <button key={kind} type="button" disabled={scene.cards.length >= 12} onClick={() => {setCards(cards => [...cards, newCard(kind)]); setAdding(false);}}>{CARD_LABELS[kind]}</button>)}</div>}
      {note && <p className="csc-note" role="status">{note}<button type="button" aria-label="닫기" onClick={() => setNote('')}><X size={14}/></button></p>}
    </header>}
    {moment.alert && moment.next && <p className="csc-alert" role="status">곧 {moment.next.label}{subjectNext ? ` ${subjectNext}` : ''} 시작! {moment.toNext}분 남았어요. 자리에 앉아 준비해요.</p>}
    <main className="csc-grid">{scene.cards.map((card, i) => <section key={card.id} className={`csc-card kind-${card.kind}`} style={{gridColumn: `span ${card.w}`, gridRow: `span ${card.h}`}} aria-label={CARD_LABELS[card.kind]}>
      <h2>{CARD_LABELS[card.kind]}</h2>
      {body(card)}
      {editing && <div className="csc-handle">
        <button type="button" aria-label="앞으로" disabled={!i} onClick={() => move(card.id, -1)}><ArrowLeft size={15}/></button>
        <button type="button" aria-label="뒤로" disabled={i === scene.cards.length - 1} onClick={() => move(card.id, 1)}><ArrowRight size={15}/></button>
        <button type="button" onClick={() => patch(card.id, {w: WIDTHS[(WIDTHS.indexOf(card.w) + 1) % WIDTHS.length]})}>너비 {card.w}/6</button>
        <button type="button" onClick={() => patch(card.id, {h: card.h === 1 ? 2 : 1})}>높이 {card.h}</button>
        <button type="button" aria-label="카드 지우기" onClick={() => setCards(cards => cards.filter(c => c.id !== card.id))}><Trash2 size={15}/></button>
      </div>}
    </section>)}
      {!scene.cards.length && <p className="csc-empty wide">{view ? '' : '"배치 바꾸기"를 누르고 카드를 더해 보세요.'}</p>}
    </main>

    {settings && !view && <div className="csc-backdrop" onClick={() => setSettings(false)}><section className="csc-dialog" role="dialog" aria-modal="true" aria-label="시정표와 설정" onClick={e => e.stopPropagation()}>
      <header><h2>시정표와 설정</h2><button type="button" aria-label="닫기" onClick={() => setSettings(false)}><X size={18}/></button></header>
      <h3>시정표 (교시 시작·끝 시각)</h3>
      <div className="csc-bells">{state.bells.map((bell, i) => <div key={i}>
        <input value={bell.label} maxLength={10} aria-label="이름" onChange={e => update(old => ({...old, bells: old.bells.map((b, n) => n === i ? {...b, label: e.target.value} : b)}))}/>
        <input type="time" value={bell.start} aria-label={`${bell.label} 시작`} onChange={e => e.target.value && update(old => ({...old, bells: old.bells.map((b, n) => n === i ? {...b, start: e.target.value} : b)}))}/>
        <input type="time" value={bell.end} aria-label={`${bell.label} 끝`} onChange={e => e.target.value && update(old => ({...old, bells: old.bells.map((b, n) => n === i ? {...b, end: e.target.value} : b)}))}/>
        <button type="button" aria-label={`${bell.label} 지우기`} disabled={state.bells.length <= 1} onClick={() => update(old => ({...old, bells: old.bells.filter((_, n) => n !== i)}))}><Trash2 size={15}/></button></div>)}
        <button type="button" disabled={state.bells.length >= 12} onClick={() => update(old => ({...old, bells: [...old.bells, {label: `${old.bells.filter(b => b.label.includes('교시')).length + 1}교시`, start: '14:40', end: '15:20'}]}))}><Plus size={15}/>줄 더하기</button></div>
      <p className="csc-hint">이름에 &quot;교시&quot;가 들어간 줄만 수업으로 세요. 점심이나 쉬는 시간은 다른 이름으로 적어 주세요.</p>
      <h3>시간표 (과목)</h3>
      <button type="button" className="csc-import" onClick={() => void importTimetable()}>업무 공간의 이번 주 시간표 가져오기</button>
      <table className="csc-subjects"><thead><tr><th/>{DAYS.map(d => <th key={d}>{d}</th>)}</tr></thead><tbody>
        {state.bells.filter(b => b.label.includes('교시')).map((bell, p) => <tr key={p}><th>{p + 1}</th>{DAYS.map((d, day) => <td key={d}><input value={state.subjects[day][p] ?? ''} maxLength={12} aria-label={`${d}요일 ${p + 1}교시`} onChange={e => update(old => ({...old, subjects: old.subjects.map((row, n) => {if (n !== day) return row; const next = [...row]; next[p] = e.target.value; return Array.from(next, v => v ?? '');})}))}/></td>)}</tr>)}
      </tbody></table>
      <h3>화면</h3>
      <div className="csc-options">
        <label>배경<select value={state.theme} onChange={e => update(old => ({...old, theme: e.target.value}))}>{Object.entries(THEMES).map(([key, t]) => <option key={key} value={key}>{t.name}</option>)}</select></label>
        <label>글자 크기<select value={state.scale} onChange={e => update(old => ({...old, scale: Number(e.target.value)}))}><option value={0.85}>작게</option><option value={1}>보통</option><option value={1.2}>크게</option><option value={1.4}>아주 크게</option></select></label>
        <label>학생 수<input type="number" min={1} max={60} value={state.students} onChange={e => update(old => ({...old, students: Math.min(60, Math.max(1, Number(e.target.value) || 1))}))}/></label>
        <label>수업 몇 분 전에 알릴까요<select value={state.alert} onChange={e => update(old => ({...old, alert: Number(e.target.value)}))}>{[0, 1, 2, 3, 5].map(m => <option key={m} value={m}>{m ? `${m}분 전` : '알리지 않기'}</option>)}</select></label>
      </div>
      <p className="csc-hint">배치와 내용은 이 컴퓨터의 이 브라우저에만 저장돼요. 번호 뽑기는 이름 대신 번호만 보여 줘요.</p>
      <button type="button" className="csc-reset" onClick={() => {if (confirm('교실 화면을 처음 상태로 되돌릴까요? 적어 둔 내용이 모두 지워져요.')) {update(() => defaultState()); setSettings(false);}}}>처음 상태로 되돌리기</button>
    </section></div>}
  </div>;
}
