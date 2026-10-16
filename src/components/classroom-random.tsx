'use client';

import {useEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import {bracketSlots, ladderDestination, ladderPath, makeGroups, makeLadder, parseParticipants, randomInteger, shuffle, type Ladder} from '@/lib/classroom-tools';
import {Participants, ToolActions, ToolButton, ToolField, ToolHint, useClassroomAudio, useClassroomSaved, useWords} from './classroom-shared';

const numberList = Array.from({length: 24}, (_, i) => `${i + 1}`).join('\n');
const colors = ['#f1b8ab', '#bddac0', '#b5d2e8', '#d7c3ec', '#f1d29f', '#edbfd1'];

export function ClassroomDraw() {
  const w = useWords(); const [mode, setMode] = useClassroomSaved('draw-mode', 'random');
  const modes = [['random', '발표 도우미', 'Pick a speaker'], ['lottery', '발표 복권', 'Scratch cards'], ['souvenir', '추억의 뽑기', 'Lucky cards'], ['ladder', '사다리타기', 'Ladder'], ['lots', '제비뽑기', 'Draw lots'], ['teams', '모둠 만들기', 'Make groups']];
  return <div className="classroom-tool"><div className="classroom-tabs">{modes.map(([id, ko, en]) => <button type="button" key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>{w(ko, en)}</button>)}</div>{mode === 'teams' ? <ClassroomArrange/> : mode === 'ladder' ? <LadderTool/> : <PickTool key={mode} mode={mode}/>}</div>;
}

function PickTool({mode}: {mode: string}) {
  const w = useWords(); const audio = useClassroomAudio(); const [names, setNames] = useClassroomSaved('draw-participants', numberList); const people = parseParticipants(names);
  const [used, setUsed] = useState<number[]>([]); const [result, setResult] = useState<number | null>(null); const [cards, setCards] = useState<number[]>([]); const [replacement, setReplacement] = useClassroomSaved('draw-replacement', false);
  const available = people.map((_, index) => index).filter(index => replacement || !used.includes(index));
  function reset(value?: string) { if (value !== undefined) setNames(value); setUsed([]); setResult(null); setCards([]); }
  function reveal(index: number) {setResult(index); setUsed(previous => [...previous, index]); void audio.play('sparkle');}
  function pick() { if (available.length) reveal(available[randomInteger(available.length)]); }
  const cardMode = mode !== 'random';
  return <><div className="classroom-display" aria-live="polite"><span>{w('이번 주인공은', 'The chosen one is')}</span><strong className="classroom-big classroom-result-name">{result === null ? '?' : people[result]}</strong></div>
    {cardMode && cards.length > 0 && <div className={'classroom-lottery-grid ' + mode}>{cards.map((person, index) => <button type="button" key={index} disabled={used.includes(person)} aria-label={`${w('뽑기', 'Draw')} ${index + 1}`} onClick={() => reveal(person)}><span>{used.includes(person) ? people[person] : mode === 'lots' ? '🎟️' : mode === 'souvenir' ? '🌼' : '✦'}</span><small>{index + 1}</small></button>)}</div>}
    <ToolActions>{cardMode ? <ToolButton primary disabled={!people.length} onClick={() => {setCards(shuffle(people.map((_, i) => i))); setUsed([]); setResult(null);}}>{w('카드 섞기', 'Shuffle cards')}</ToolButton> : <ToolButton primary disabled={!available.length} onClick={pick}>{w('한 명 뽑기', 'Pick one')}</ToolButton>}<ToolButton onClick={() => reset()}>{w('처음부터', 'Start over')}</ToolButton></ToolActions>
    <ToolHint>{w(`${people.length}명 중 ${new Set(used).size}명 뽑았어요.`, `${new Set(used).size} of ${people.length} participants drawn.`)}</ToolHint>
    {!cardMode && <label className="classroom-check"><input type="checkbox" checked={replacement} onChange={e => {setReplacement(e.target.checked); reset();}}/>{w('이미 뽑은 사람도 다시 포함', 'Allow repeat picks')}</label>}
    {!!used.length && <div className="classroom-history" aria-label={w('뽑기 기록', 'Draw history')}>{used.slice(-40).map((index, i) => <span key={i}>{people[index]}</span>)}</div>}
    <Participants value={names} onChange={reset}/>
  </>;
}

function LadderTool() {
  const w = useWords(); const [names, setNames] = useClassroomSaved('ladder-participants', '1\n2\n3\n4\n5\n6'); const [outcomes, setOutcomes] = useClassroomSaved('ladder-outcomes', 'A\nB\nC\nD\nE\nF');
  const people = parseParticipants(names).slice(0, 30); const results = parseParticipants(outcomes); const [ladder, setLadder] = useState<Ladder | null>(null); const [selected, setSelected] = useState<number | null>(null);
  const width = Math.max(460, people.length * 76); const x = (column: number) => 38 + column * (width - 76) / Math.max(1, people.length - 1); const y = (row: number) => 30 + row * 17;
  return <><div className="classroom-two-columns"><Participants value={names} max={30} onChange={value => {setNames(value); setLadder(null); setSelected(null);}}/><ToolField title={w('결과 · 참여자 수만큼 한 줄씩', 'Outcomes · one per participant')}><textarea rows={5} value={outcomes} maxLength={4000} onChange={e => {setOutcomes(e.target.value); setSelected(null);}}/></ToolField></div><ToolActions><ToolButton primary disabled={people.length < 2 || results.length !== people.length} onClick={() => {setLadder(makeLadder(people.length, Math.max(20, people.length * 3))); setSelected(null);}}>{w('사다리 만들기', 'Create ladder')}</ToolButton></ToolActions><ToolHint>{w('2~30명, 참여자와 결과 수가 같아야 해요. 사다리 위의 이름을 누르면 경로를 볼 수 있어요.', 'Use 2–30 participants and the same number of outcomes. Select a name to trace the path.')}</ToolHint>
    {ladder && <div className="classroom-ladder-scroll"><div style={{minWidth: width}}><div className="classroom-ladder-labels" style={{gridTemplateColumns: `repeat(${people.length}, 1fr)`}}>{people.map((name, i) => <button key={i} type="button" aria-pressed={selected === i} onClick={() => setSelected(i)}>{name}</button>)}</div><svg role="img" aria-label={w('사다리 경로', 'Ladder paths')} width="100%" viewBox={`0 0 ${width} ${y(ladder.bars.length + 1) + 30}`}>{people.map((_, i) => <line key={i} x1={x(i)} x2={x(i)} y1={y(0)} y2={y(ladder.bars.length + 1)} stroke="var(--border)" strokeWidth="4"/>)}{ladder.bars.map((bar, row) => <line key={row} x1={x(bar)} x2={x(bar + 1)} y1={y(row + 1)} y2={y(row + 1)} stroke="var(--muted)" strokeWidth="3"/>)}{selected !== null && <polyline points={ladderPath(ladder, selected).map(([column, row]) => `${x(column)},${y(row)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinejoin="round"/>}</svg><div className="classroom-ladder-labels" style={{gridTemplateColumns: `repeat(${people.length}, 1fr)`}}>{results.map((outcome, i) => <span key={i} className={selected !== null && ladderDestination(ladder, selected) === i ? 'selected' : ''}>{outcome}</span>)}</div></div></div>}
    {ladder && selected !== null && <p className="classroom-status" role="status">{people[selected]} → {results[ladderDestination(ladder, selected)]}</p>}
  </>;
}

export function ClassroomWheel() {
  const w = useWords(); const audio = useClassroomAudio(); const [names, setNames] = useClassroomSaved('wheel-participants', '1\n2\n3\n4\n5\n6'); const people = parseParticipants(names).slice(0, 30);
  const [used, setUsed] = useState<number[]>([]); const [replace, setReplace] = useClassroomSaved('wheel-replacement', false); const [rotation, setRotation] = useState(0); const [result, setResult] = useState<number | null>(null); const [busy, setBusy] = useState(false); const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {if (timeout.current) clearTimeout(timeout.current);}, []);
  const available = people.map((_, i) => i).filter(i => replace || !used.includes(i));
  function spin() {if (busy || !available.length) return; const index = available[randomInteger(available.length)]; setResult(null); setBusy(true); const segment = 360 / people.length; const desired = (360 - (index + .5) * segment) % 360; setRotation(old => old + 1800 + (desired - old % 360 + 360) % 360); timeout.current = setTimeout(() => {setResult(index); setUsed(old => [...old, index]); setBusy(false); void audio.play('success');}, 2300);}
  return <div className="classroom-tool"><div className="classroom-wheel-wrap"><span className="classroom-wheel-pointer" aria-hidden="true">▼</span><div className="classroom-wheel" style={{transform: `rotate(${rotation}deg)`, background: people.length ? `conic-gradient(${people.map((_, i) => `${colors[i % colors.length]} ${i * 100 / people.length}% ${(i + 1) * 100 / people.length}%`).join(',')})` : 'var(--surface-alt)'}} aria-hidden="true">{people.map((name, i) => <span key={i} style={{transform: `translate(-50%, -50%) rotate(${(i + .5) * 360 / people.length}deg) translateY(-110px) rotate(${-90}deg)`, opacity: !replace && used.includes(i) ? .35 : 1}}>{name.slice(0, 10)}</span>)}</div><span className="classroom-wheel-center" aria-hidden="true">✦</span></div><p className="classroom-status" aria-live="polite">{busy ? w('두근두근…', 'Spinning…') : result === null ? w('누가 뽑힐까요?', 'Who will it be?') : people[result]}</p><ToolActions><ToolButton primary disabled={busy || !available.length} onClick={spin}>{w('돌리기', 'Spin')}</ToolButton><ToolButton disabled={busy} onClick={() => {setUsed([]); setResult(null);}}>{w('뽑기 기록 초기화', 'Reset picks')}</ToolButton></ToolActions><fieldset disabled={busy}><label className="classroom-check"><input type="checkbox" checked={replace} onChange={e => {setReplace(e.target.checked); setUsed([]);}}/>{w('중복 허용', 'Allow repeat picks')}</label><Participants max={30} value={names} onChange={value => {setNames(value); setUsed([]); setResult(null);}}/></fieldset></div>;
}

export function ClassroomDice({coin = false}: {coin?: boolean}) {
  const w = useWords(); const audio = useClassroomAudio(); const [count, setCount] = useClassroomSaved(coin ? 'coin-count' : 'dice-count', 1, (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 6); const [values, setValues] = useState<number[]>([]); const [revision, setRevision] = useState(0);
  return <div className="classroom-tool"><div className="classroom-dice-row" key={revision}>{(values.length ? values : [0]).map((value, i) => <div key={i} className={coin ? 'classroom-coin' : 'classroom-die'} aria-label={coin ? value === 1 ? w('앞면', 'Heads') : value === 2 ? w('뒷면', 'Tails') : '?' : `${value || '?'}`}>{coin ? value === 1 ? '🌞' : value === 2 ? '🌙' : '?' : value ? '⚀⚁⚂⚃⚄⚅'[value - 1] : '?'}</div>)}</div>{!!values.length && <p className="classroom-status" role="status">{coin ? values.map(v => v === 1 ? w('앞면', 'Heads') : w('뒷면', 'Tails')).join(' · ') : `${w('합계', 'Total')} ${values.reduce((sum, value) => sum + value, 0)}`}</p>}<ToolActions><ToolButton primary onClick={() => {setValues(Array.from({length: count}, () => randomInteger(coin ? 2 : 6) + 1)); setRevision(old => old + 1); void audio.play('drum');}}>{w(coin ? '동전 던지기' : '주사위 던지기', coin ? 'Flip coins' : 'Roll dice')}</ToolButton></ToolActions><ToolField title={w('개수', 'Count')}><select value={count} onChange={e => {setCount(Number(e.target.value)); setValues([]);}}>{[1, 2, 3, 4, 5, 6].map(v => <option key={v} value={v}>{v}</option>)}</select></ToolField></div>;
}

export function ClassroomRace() {
  const w = useWords(); const [names, setNames] = useClassroomSaved('race-participants', '1\n2\n3\n4\n5\n6'); const people = parseParticipants(names).slice(0, 20); const [durations, setDurations] = useState<number[]>([]); const [elapsed, setElapsed] = useState(0); const [running, setRunning] = useState(false); const [finish, setFinish] = useState<number[]>([]); const startTime = useRef(0);
  useEffect(() => { if (!running) return; const id = setInterval(() => {const now = performance.now() - startTime.current; setElapsed(now); if (now >= Math.max(...durations)) {setRunning(false); setFinish(durations.map((duration, i) => ({duration, i})).sort((a, b) => a.duration - b.duration).map(v => v.i));}}, 50); return () => clearInterval(id); }, [running, durations]);
  function start() {const order = shuffle(people.map((_, i) => i)); const times = people.map(() => 0); order.forEach((index, rank) => {times[index] = 3000 + rank * 150 + randomInteger(100);}); setDurations(times); setFinish([]); setElapsed(0); startTime.current = performance.now(); setRunning(true);}
  return <div className="classroom-tool"><div className="classroom-race">{people.map((name, i) => <div className="classroom-race-row" key={i}><span>{name}</span><div><i style={{width: `${durations[i] ? Math.min(100, elapsed / durations[i] * 100) : 0}%`, background: colors[i % colors.length]}}/><b style={{left: `${durations[i] ? Math.min(94, elapsed / durations[i] * 94) : 0}%`}}>🐾</b></div></div>)}</div><p className="classroom-status" role="status">{finish.length ? `🏆 ${people[finish[0]]}` : running ? w('달려요!', 'Go, go, go!') : w('모두 같은 확률로 출발해요', 'Every participant has an equal chance')}</p>{finish.length > 0 && <ol className="classroom-history">{finish.map(index => <li key={index}>{people[index]}</li>)}</ol>}<ToolActions><ToolButton primary disabled={running || people.length < 2} onClick={start}>{w('레이스 시작', 'Start race')}</ToolButton></ToolActions><fieldset disabled={running}><Participants max={20} value={names} onChange={value => {setNames(value); setDurations([]); setFinish([]); setElapsed(0);}}/></fieldset></div>;
}

export function ClassroomArrange({seats = false}: {seats?: boolean}) {
  const w = useWords(); const [names, setNames] = useClassroomSaved(seats ? 'seats-participants' : 'groups-participants', numberList); const people = parseParticipants(names); const [count, setCount] = useClassroomSaved(seats ? 'seats-columns' : 'groups-count', 4, (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 12); const [groups, setGroups] = useState<string[][]>([]); const [assigned, setAssigned] = useState<number[]>([]); const [locked, setLocked] = useState<number[]>([]);
  function arrange() {if (seats) {const current = assigned.length === people.length ? assigned : people.map((_, i) => i); const fixed = new Set(locked.map(index => current[index])); const pool = shuffle(people.map((_, i) => i).filter(i => !fixed.has(i))); let next = 0; setAssigned(current.map((person, index) => locked.includes(index) ? person : pool[next++]));} else setGroups(makeGroups(people, count));}
  return <div className="classroom-tool"><div className="classroom-two-columns"><Participants value={names} onChange={value => {setNames(value); setAssigned([]); setGroups([]); setLocked([]);}}/><ToolField title={w(seats ? '가로 자리 수' : '모둠 수', seats ? 'Seats per row' : 'Number of groups')}><input type="number" min="1" max="12" value={count} onChange={e => {setCount(Math.max(1, Math.min(12, Math.floor(Number(e.target.value)) || 1))); setGroups([]); setLocked([]);}}/></ToolField></div><ToolActions><ToolButton primary disabled={!people.length} onClick={arrange}>{w(seats ? '자리 배치하기' : '모둠 만들기', seats ? 'Arrange seats' : 'Make groups')}</ToolButton>{seats && <ToolButton onClick={() => setLocked([])}>{w('고정 해제', 'Unlock all seats')}</ToolButton>}</ToolActions>{seats && <><ToolHint>{w('자리를 누르면 고정할 수 있어요. 다음 배치에서도 그 자리를 유지합니다.', 'Click a seat to lock it in place for the next shuffle.')}</ToolHint><div className="classroom-front">{w('칠판 · 교실 앞', 'Board · front of classroom')}</div><div className="classroom-seats" style={{gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`}}>{assigned.map((person, i) => <button key={i} type="button" aria-pressed={locked.includes(i)} onClick={() => setLocked(old => old.includes(i) ? old.filter(index => index !== i) : [...old, i])}><small>{i + 1}{locked.includes(i) ? ' 🔒' : ''}</small><strong>{people[person]}</strong></button>)}</div></>}{!seats && <div className="classroom-group-grid">{groups.map((members, index) => <div key={index}><h3>{w('모둠', 'Group')} {index + 1}</h3>{members.map((name, i) => <span key={i}>{name}</span>)}</div>)}</div>}</div>;
}

type Entry = {id: number; name: string};
type Match = {key: string; a: Entry | null; b: Entry | null; winner: Entry | null; ready: boolean};
export function ClassroomBracket() {
  const w = useWords(); const [names, setNames] = useClassroomSaved('bracket-participants', '1\n2\n3\n4\n5\n6\n7\n8'); const people = parseParticipants(names).slice(0, 64); const [slots, setSlots] = useState<Array<Entry | null>>([]); const [picked, setPicked] = useState<Record<string, number>>({});
  const rounds = useMemo(() => {
    const result: Match[][] = []; if (!slots.length) return result;
    let entrants = slots; let previous: Match[] | null = null;
    for (let round = 0; entrants.length > 1; round++) {
      const matches: Match[] = [];
      for (let i = 0; i < entrants.length; i += 2) {
        const a = entrants[i], b = entrants[i + 1], key = `${round}-${i / 2}`;
        const ready: boolean = round === 0 || !!(previous?.[i].winner && previous?.[i + 1].winner);
        const winner = ready ? !a ? b : !b ? a : picked[key] === a.id ? a : picked[key] === b.id ? b : null : null;
        matches.push({key, a, b, winner, ready});
      }
      result.push(matches); previous = matches; entrants = matches.map(match => match.winner);
    }
    return result;
  }, [slots, picked]);
  function choose(match: Match, id: number) {const round = Number(match.key.split('-')[0]); setPicked(old => ({...Object.fromEntries(Object.entries(old).filter(([key]) => Number(key.split('-')[0]) <= round)), [match.key]: id}));}
  const champion = rounds.at(-1)?.[0]?.winner;
  return <div className="classroom-tool"><Participants max={64} value={names} onChange={value => {setNames(value); setSlots([]); setPicked({});}}/><ToolActions><ToolButton primary disabled={people.length < 2} onClick={() => {setSlots(bracketSlots(people.map((name, id) => ({id, name})))); setPicked({});}}>{w('대진표 만들기', 'Create bracket')}</ToolButton></ToolActions><ToolHint>{w('이긴 사람을 누르면 다음 라운드로 진출합니다. 홀수 인원은 부전승으로 처리해요.', 'Select the winner of each match. Byes advance automatically.')}</ToolHint>{champion && <p className="classroom-status" role="status">🏆 {champion.name}</p>}<div className="classroom-bracket">{rounds.map((matches, r) => <div key={r}><h3>{r === rounds.length - 1 ? w('결승', 'Final') : `${w('라운드', 'Round')} ${r + 1}`}</h3>{matches.map(match => <div className="classroom-match" key={match.key}>{[match.a, match.b].map((entry, index) => <button key={index} type="button" disabled={!entry || !match.ready || !match.a || !match.b} aria-pressed={!!entry && entry.id === match.winner?.id} onClick={() => entry && choose(match, entry.id)}>{entry?.name || (r === 0 ? w('부전승', 'Bye') : w('경기 대기', 'Awaiting result'))}{entry?.id === match.winner?.id && ' ✓'}</button>)}</div>)}</div>)}</div></div>;
}
