/**
 * 교실 화면: the board a teacher leaves on the classroom display. Pure rules only:
 * the saved shape, its defaults, and "what period is it now".
 */
export type CardKind = 'clock' | 'timetable' | 'notice' | 'todo' | 'timer' | 'dday' | 'lunch' | 'picker';
export const CARD_LABELS: Record<CardKind, string> = {clock: '시계와 지금 교시', timetable: '오늘 시간표', notice: '알림 사항', todo: '오늘 낼 것', timer: '타이머', dday: 'D-day', lunch: '급식', picker: '번호 뽑기'};
export type Card = {id: string; kind: CardKind; w: 2 | 3 | 4 | 6; h: 1 | 2; text: string; date: string; endsAt: number; left: number; drawn: number[]};
export type Scene = {id: string; name: string; cards: Card[]};
export type Bell = {label: string; start: string; end: string};
export type ScreenState = {v: 1; scenes: Scene[]; active: string; bells: Bell[]; subjects: string[][]; theme: string; scale: number; students: number; alert: number; sound: boolean; locked: boolean};
export const THEMES: Record<string, {name: string; bg: string; card: string; ink: string}> = {
  paper: {name: '종이', bg: '#f6f1e6', card: '#fffdf8', ink: '#2c4439'},
  mint: {name: '민트', bg: '#dff0e6', card: '#ffffff', ink: '#234b3b'},
  sky: {name: '하늘', bg: '#dcebfa', card: '#ffffff', ink: '#223f5e'},
  night: {name: '밤', bg: '#20263d', card: '#2d3554', ink: '#f2f4ff'},
};
export const WIDTHS = [2, 3, 4, 6] as const;
const KINDS = Object.keys(CARD_LABELS) as CardKind[];

let seq = 0;
const uid = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;
export const newCard = (kind: CardKind, w: Card['w'] = 3, h: Card['h'] = 1, text = ''): Card => ({id: uid(), kind, w, h, text, date: '', endsAt: 0, left: 0, drawn: []});
export const defaultBells = (): Bell[] => [
  {label: '1교시', start: '09:00', end: '09:40'}, {label: '2교시', start: '09:50', end: '10:30'}, {label: '3교시', start: '10:40', end: '11:20'},
  {label: '4교시', start: '11:30', end: '12:10'}, {label: '점심', start: '12:10', end: '13:00'}, {label: '5교시', start: '13:00', end: '13:40'}, {label: '6교시', start: '13:50', end: '14:30'},
];
export function defaultState(): ScreenState {
  return {
    v: 1, active: 'morning', bells: defaultBells(), subjects: [[], [], [], [], []], theme: 'paper', scale: 1, students: 24, alert: 2, sound: false, locked: true,
    scenes: [
      {id: 'morning', name: '아침', cards: [newCard('clock', 4, 1), newCard('notice', 2, 2, '안녕! 오늘도 반가워요.\n가방 정리 후 독서 10분'), newCard('todo', 2, 1, '알림장\n독서 기록장'), newCard('lunch', 2, 1)]},
      {id: 'lesson', name: '수업', cards: [newCard('clock', 3, 1), newCard('timer', 3, 1), newCard('timetable', 3, 2), newCard('notice', 3, 1, '오늘 배울 것')]},
      {id: 'break', name: '쉬는 시간', cards: [newCard('clock', 6, 1), newCard('timer', 3, 1), newCard('todo', 3, 1, '다음 시간 준비물 꺼내기\n물 마시기')]},
      {id: 'home', name: '하교', cards: [newCard('clock', 3, 1), newCard('todo', 3, 2, '알림장 확인\n책상 정리\n의자 넣기'), newCard('dday', 3, 1, '현장체험학습')]},
    ],
  };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const text = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : '';
const int = (value: unknown, min: number, max: number, fallback: number) => Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value as number))) : fallback;
/** Anything read back from the browser is checked: a damaged or older save falls back to defaults instead of breaking the screen. */
export function parseState(raw: unknown): ScreenState {
  const base = defaultState();
  if (!raw || typeof raw !== 'object' || (raw as ScreenState).v !== 1) return base;
  const r = raw as Record<string, unknown>;
  const scenes = (Array.isArray(r.scenes) ? r.scenes : []).slice(0, 8).map((s: Record<string, unknown>, n) => ({
    id: text(s?.id, 40) || 's' + n, name: text(s?.name, 12) || '장면',
    cards: (Array.isArray(s?.cards) ? s.cards : []).slice(0, 12).filter((c: Record<string, unknown>) => KINDS.includes(c?.kind as CardKind)).map((c: Record<string, unknown>) => ({
      id: text(c.id, 40) || uid(), kind: c.kind as CardKind, w: (WIDTHS as readonly number[]).includes(c.w as number) ? c.w as Card['w'] : 3, h: c.h === 2 ? 2 as const : 1 as const,
      text: text(c.text, 600), date: /^\d{4}-\d{2}-\d{2}$/.test(String(c.date)) ? String(c.date) : '', endsAt: int(c.endsAt, 0, 9e15, 0), left: int(c.left, 0, 86_400, 0),
      drawn: (Array.isArray(c.drawn) ? c.drawn : []).filter((v: unknown) => Number.isInteger(v)).slice(0, 60) as number[],
    })),
  }));
  if (!scenes.length) return base;
  const bells = (Array.isArray(r.bells) ? r.bells : []).slice(0, 12).map((b: Record<string, unknown>) => ({label: text(b?.label, 10) || '교시', start: String(b?.start), end: String(b?.end)})).filter(b => TIME.test(b.start) && TIME.test(b.end) && b.start < b.end);
  const subjects = Array.from({length: 5}, (_, day) => (Array.isArray((r.subjects as unknown[])?.[day]) ? (r.subjects as unknown[][])[day] : []).slice(0, 12).map(v => text(v, 12)));
  return {
    v: 1, scenes, active: scenes.some(s => s.id === r.active) ? r.active as string : scenes[0].id, bells: bells.length ? bells.sort((a, b) => a.start.localeCompare(b.start)) : base.bells, subjects,
    theme: text(r.theme, 12) in THEMES ? r.theme as string : 'paper', scale: [0.85, 1, 1.2, 1.4].includes(r.scale as number) ? r.scale as number : 1,
    students: int(r.students, 1, 60, 24), alert: int(r.alert, 0, 10, 2), sound: r.sound === true, locked: r.locked !== false,
  };
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export type Now = {index: number; label: string; until: number; next: Bell | null; toNext: number; alert: boolean};
/**
 * Where a clock time falls in the bell schedule. `index` is the running period (-1 between periods),
 * `toNext` the minutes until the next period begins, `alert` true inside the heads-up window.
 */
export function nowIn(bells: Bell[], hhmm: string, alertMinutes: number): Now {
  const at = minutes(hhmm), index = bells.findIndex(b => at >= minutes(b.start) && at < minutes(b.end)), next = bells.find(b => minutes(b.start) > at) ?? null;
  const toNext = next ? minutes(next.start) - at : -1;
  return {
    index, label: index >= 0 ? bells[index].label : !bells.length || at < minutes(bells[0].start) ? '수업 전' : next ? '쉬는 시간' : '수업 끝',
    until: index >= 0 ? minutes(bells[index].end) - at : toNext, next, toNext, alert: index < 0 && !!next && alertMinutes > 0 && toNext <= alertMinutes,
  };
}
/** The n-th teaching period of the day for a bell row: lunch and other rows without "교시" do not count. */
export const periodNumber = (bells: Bell[], index: number) => index >= 0 && bells[index]?.label.includes('교시') ? bells.slice(0, index + 1).filter(b => b.label.includes('교시')).length : 0;
export function dday(date: string, today: string) {
  if (!date) return '';
  const days = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000);
  return days === 0 ? 'D-DAY' : days > 0 ? `D-${days}` : `D+${-days}`;
}
/** A number nobody has drawn yet in this round; a finished round starts over. */
export function draw(students: number, drawn: number[], random = Math.random) {
  const used = drawn.filter(n => n >= 1 && n <= students), rest = Array.from({length: students}, (_, i) => i + 1).filter(n => !used.includes(n));
  const pool = rest.length ? rest : Array.from({length: students}, (_, i) => i + 1);
  const picked = pool[Math.floor(random() * pool.length)];
  return {picked, drawn: rest.length ? [...used, picked] : [picked]};
}
export const clockLabel = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
