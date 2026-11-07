/** 교실 화면·지명 퀴즈의 순수 로직. 화면 없이 시험하고, 서버에 아무것도 쓰지 않는다. */
export type RandomInt = (max: number) => number;
const cryptoInt: RandomInt = max => {const word = new Uint32Array(1), limit = Math.floor(0x100000000 / max) * max; do globalThis.crypto.getRandomValues(word); while (word[0] >= limit); return word[0] % max;};
export const shuffled = <T>(items: readonly T[], random: RandomInt = cryptoInt): T[] => {const out = [...items]; for (let i = out.length - 1; i > 0; i--) {const j = random(i + 1); [out[i], out[j]] = [out[j], out[i]];} return out;};

/** 1부터 세는 범위를 세트 크기 안으로 맞춘다. 거꾸로 넣어도 순서를 바로잡는다. */
export function cardRange(total: number, start: number, end: number): {start: number; end: number; indices: number[]} {
  if (total < 1) return {start: 0, end: 0, indices: []};
  const clamp = (value: number, fallback: number) => Number.isFinite(value) ? Math.min(total, Math.max(1, Math.round(value))) : fallback;
  let a = clamp(start, 1), b = clamp(end, total); if (a > b) [a, b] = [b, a];
  return {start: a, end: b, indices: Array.from({length: b - a + 1}, (_, i) => a - 1 + i)};
}

export const speechLang = (text: string) => /[가-힣]/.test(text) ? 'ko-KR' : /[぀-ヿ]/.test(text) ? 'ja-JP' : /[一-鿿]/.test(text) ? 'zh-CN' : 'en-US';

/** 글자 너비 추정(em). 한글·한자·가나는 정사각형에 가깝고, 라틴 글자는 절반쯤이다. */
const charWidth = (char: string) => /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(char) ? 1 : /[MW@%]/.test(char) ? .9 : /[il.,'!|:; ]/.test(char) ? .3 : .58;
/** 주어진 글자 크기에서 단어 단위로 줄을 나눴을 때 몇 줄이 되는지. 긴 단어는 중간에서 끊는다. */
export function wrapLines(text: string, size: number, width: number): number {
  const limit = width / size; let lines = 0;
  for (const paragraph of text.split(/\r?\n/)) {
    let line = 0; lines++;
    for (const word of paragraph.split(/(\s+)/).filter(Boolean)) {
      const w = [...word].reduce((sum, char) => sum + charWidth(char), 0);
      if (line + w <= limit || (!line && /^\s+$/.test(word))) {line += w; continue;}
      if (/^\s+$/.test(word)) continue;
      if (w <= limit) {lines++; line = w; continue;}
      for (const char of word) {const c = charWidth(char); if (line + c > limit && line > 0) {lines++; line = 0;} line += c;}
    }
  }
  return lines;
}
/** 상자 안에 다 들어가는 가장 큰 글자 크기(px). 첫 값이고 화면에서 실제 높이로 한 번 더 줄인다. */
export function fitFontSize(text: string, box: {width: number; height: number}, limits: {min?: number; max?: number; lineHeight?: number} = {}): number {
  const {min = 18, max = 220, lineHeight = 1.3} = limits, value = text.trim() || ' ';
  if (box.width <= 0 || box.height <= 0) return min;
  let lo = min, hi = max;
  // 낱말 하나가 한 줄보다 넓으면 중간에서 끊겨 읽기 어렵다. 가장 긴 낱말이 한 줄에 들어갈 때까지 줄인다.
  const longest = Math.max(...value.split(/\s+/).map(word => [...word].reduce((sum, char) => sum + charWidth(char), 0)));
  const fits = (size: number) => longest * size <= box.width && wrapLines(value, size, box.width) * size * lineHeight <= box.height;
  if (!fits(lo)) return min;
  while (hi - lo > 1) {const mid = Math.floor((lo + hi) / 2); if (fits(mid)) lo = mid; else hi = mid;}
  return fits(hi) ? hi : lo;
}

/** 다시 뽑지 않기: 아직 안 뽑힌 사람에서만 고르고, 모두 뽑히면 새 바퀴를 시작한다. 새 바퀴의 첫 사람은 직전 사람과 겹치지 않게 한다. */
export function pickNext(ids: readonly string[], used: readonly string[], options: {noRepeat: boolean; last?: string | null; random?: RandomInt}): {id: string | null; used: string[]; newRound: boolean} {
  const random = options.random || cryptoInt, unique = [...new Set(ids)];
  if (!unique.length) return {id: null, used: [], newRound: false};
  const seen = used.filter(id => unique.includes(id));
  let pool = options.noRepeat ? unique.filter(id => !seen.includes(id)) : unique, newRound = false, base = seen;
  if (!pool.length) {pool = unique; newRound = true; base = [];}
  if ((newRound || !options.noRepeat) && pool.length > 1 && options.last) pool = pool.filter(id => id !== options.last);
  const id = pool[random(pool.length)];
  return {id, used: [...base, id], newRound};
}

/** 팀은 번호 순서대로 돌아가며 나눈다. 화면에 팀 명단을 보여 줘서 학생도 알 수 있다. */
export function assignTeams(ids: readonly string[], teamCount: number): Record<string, number> {
  const count = Math.max(2, Math.min(6, Math.round(teamCount) || 2));
  return Object.fromEntries(ids.map((id, index) => [id, index % count]));
}

export type SpotlightMode = 'score' | 'survival';
export type SpotlightTurn = {studentId: string; cardId: string; correct: boolean};
export type SpotlightTally = {mode: SpotlightMode; teams: Record<string, number> | null; teamCount: number; scores: Record<string, number>; teamScores: number[]; out: string[]; turns: SpotlightTurn[]};
export function newTally(mode: SpotlightMode, ids: readonly string[], teamCount = 0): SpotlightTally {
  const teams = mode === 'score' && teamCount >= 2 ? assignTeams(ids, teamCount) : null, count = teams ? Math.max(...Object.values(teams), 0) + 1 : 0;
  return {mode, teams, teamCount: count, scores: Object.fromEntries(ids.map(id => [id, 0])), teamScores: Array(count).fill(0), out: [], turns: []};
}
/** 득점: 맞으면 1점(팀전이면 팀에도 1점). 서바이벌: 틀리면 탈락. 이미 탈락한 학생의 기록은 받지 않는다. */
export function recordTurn(tally: SpotlightTally, turn: SpotlightTurn): SpotlightTally {
  if (tally.out.includes(turn.studentId) || !(turn.studentId in tally.scores)) return tally;
  const scores = {...tally.scores, [turn.studentId]: tally.scores[turn.studentId] + (turn.correct ? 1 : 0)}, teamScores = [...tally.teamScores], team = tally.teams?.[turn.studentId];
  if (turn.correct && team !== undefined) teamScores[team]++;
  return {...tally, scores, teamScores, out: tally.mode === 'survival' && !turn.correct ? [...tally.out, turn.studentId] : tally.out, turns: [...tally.turns, turn]};
}
/** 마지막 기록 하나를 되돌린다(잘못 누른 경우). */
export function undoTurn(tally: SpotlightTally): SpotlightTally {
  if (!tally.turns.length) return tally;
  const start: SpotlightTally = {...tally, scores: Object.fromEntries(Object.keys(tally.scores).map(id => [id, 0])), teamScores: tally.teamScores.map(() => 0), out: [], turns: []};
  return tally.turns.slice(0, -1).reduce(recordTurn, start);
}
export const alive = (tally: SpotlightTally) => Object.keys(tally.scores).filter(id => !tally.out.includes(id));
/** 끝나는 조건: 득점은 정한 문제 수를 다 냈을 때, 서바이벌은 한 명 이하가 남았을 때. */
export function spotlightDone(tally: SpotlightTally, rounds: number): boolean {
  return tally.mode === 'survival' ? alive(tally).length <= 1 : tally.turns.length >= rounds;
}
export type SpotlightRank = {id: string; score: number; correct: number; asked: number; rank: number; out: boolean; outAt: number | null};
/** 결과 순위: 득점은 점수, 서바이벌은 남은 사람이 먼저이고 늦게 탈락할수록 위다. 같은 값은 같은 등수. 지명되지 않은 학생도 넣는다. */
export function spotlightRanking(tally: SpotlightTally): SpotlightRank[] {
  const rows = Object.keys(tally.scores).map(id => {const mine = tally.turns.filter(turn => turn.studentId === id), outAt = tally.out.indexOf(id); return {id, score: tally.scores[id], correct: mine.filter(turn => turn.correct).length, asked: mine.length, rank: 0, out: outAt >= 0, outAt: outAt >= 0 ? outAt : null};});
  const key = (row: SpotlightRank) => tally.mode === 'survival' ? (row.out ? row.outAt! : 1e6) : row.score;
  rows.sort((a, b) => key(b) - key(a));
  rows.forEach((row, index) => {row.rank = index && key(rows[index - 1]) === key(row) ? rows[index - 1].rank : index + 1;});
  return rows;
}
/** 결과 화면의 "다시 볼 카드": 틀린 횟수가 많은 순서. */
export function missedCards(tally: SpotlightTally): {cardId: string; wrong: number; asked: number}[] {
  const map = new Map<string, {cardId: string; wrong: number; asked: number}>();
  for (const turn of tally.turns) {const row = map.get(turn.cardId) || {cardId: turn.cardId, wrong: 0, asked: 0}; row.asked++; if (!turn.correct) row.wrong++; map.set(turn.cardId, row);}
  return [...map.values()].filter(row => row.wrong).sort((a, b) => b.wrong - a.wrong || b.asked - a.asked);
}
/** 화면 이름표: 기본은 번호만 보여 준다. */
export const spotlightLabel = (student: {number: number; name: string}, showName: boolean, locale: string) => {const number = locale === 'ko' ? `${student.number}번` : `No. ${student.number}`; return showName ? `${number} ${student.name}` : number;};
