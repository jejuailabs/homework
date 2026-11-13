import type {PlayRoom, PublicRoomRound, RoomAnswer, RoomPlayer, RoomPlayerSummary, RoomReviewItem, RoomRoundResult, RoomTeam} from './room-types';
import {isRaceRoom, isTeacherRun, roomTeamColors, roomTeamNames} from './room-types';

export const ANSWER_GRACE_MS = 500;
export const TIE_WINDOW_MS = 150;
export function canAnswer(room: PlayRoom, player: RoomPlayer, now: number) {
  return room.status === 'question' && now >= room.roundStartsAt && now <= room.roundEndsAt + ANSWER_GRACE_MS && !player.forfeited && player.eligibleFrom <= room.round && now - player.lastSeen <= 30_000;
}
/** Connected, eligible players: the round ends early once all of them have answered. */
export function activeKeys(room: PlayRoom, players: RoomPlayer[], now: number) {
  return new Set(players.filter(player => room.playerKeys.includes(player.key) && !player.forfeited && player.eligibleFrom <= room.round && now - player.lastSeen <= 30_000).map(player => player.key));
}
/** True when a time-based transition is pending, so any participant's request may advance the room. */
export function roomDue(room: PlayRoom, now: number) {
  if (room.status === 'lobby' || room.status === 'countdown') return now >= room.statusEndsAt;
  if (room.status === 'question') return now > room.statusEndsAt;
  return room.status === 'reveal' && room.mode !== 'team' && now >= room.statusEndsAt;
}
/** A 1:1 needs two friends; every other room may start with a single student. */
export function minPlayers(room: Pick<PlayRoom, 'mode'>) {return room.mode === 'duel' ? 2 : 1;}
export function roomTransition(previous: PlayRoom, action: 'start'|'tick'|'next'|'pause'|'end', now: number, answered = 0, active = previous.playerKeys.length): PlayRoom {
  const room = structuredClone(previous);
  if (['finished', 'closed'].includes(room.status)) return room;
  const finish = (completion: 'complete'|'cancelled' = 'cancelled') => {room.status = room.round < 0 ? 'closed' : 'finished'; room.completion=completion; room.statusEndsAt = 0; room.expiresAtMs = now + 30 * 60_000;};
  const question = () => {room.status = 'question'; room.round++; room.roundStartsAt = now; room.roundEndsAt = now + room.questionMs; room.statusEndsAt = room.roundEndsAt + ANSWER_GRACE_MS;};
  if (action === 'end') finish();
  else if (action === 'pause' && isTeacherRun(room)) {
    if (room.status === 'paused' && room.pausedFrom) {
      const elapsed = now - room.pausedAt; room.status = room.pausedFrom; room.statusEndsAt += elapsed; room.roundStartsAt += elapsed; room.roundEndsAt += elapsed; room.pausedFrom = null;
    } else if (room.status === 'countdown' || room.status === 'question' || room.status === 'reveal') {room.pausedFrom = room.status; room.pausedAt = now; room.status = 'paused';}
  } else if (room.status === 'lobby') {
    if (action === 'start' && room.playerKeys.length >= minPlayers(room)) {room.status = 'countdown'; room.statusEndsAt = now + 3000;}
    else if (now >= room.statusEndsAt) {room.status = 'closed'; room.expiresAtMs = now;}
  } else if (room.status === 'countdown' && now >= room.statusEndsAt) question();
  // 개인전 is one long question: it ends when the clock runs out, when every connected student has finished, or when the teacher ends it.
  else if (isRaceRoom(room)) {if (room.status === 'question' && (now > room.roundEndsAt + ANSWER_GRACE_MS || answered > 0 && answered >= active || action === 'next')) finish('complete');}
  else if (room.status === 'question' && (now > room.roundEndsAt + ANSWER_GRACE_MS || answered > 0 && answered >= active || action === 'next')) {
    if (action === 'next') room.skippedRounds.push(room.round);
    room.status = 'reveal'; room.statusEndsAt = now + 4000;
  } else if (room.status === 'reveal' && (action === 'next' || room.mode !== 'team' && now >= room.statusEndsAt)) {
    if (room.round + 1 >= room.roundsTotal) finish('complete'); else question();
  }
  if (room.status !== previous.status || room.round !== previous.round) room.updatedAt = now;
  return room;
}
export function roundResults(room: PlayRoom, answers: RoomAnswer[]): RoomRoundResult[] {
  if (room.skippedRounds.includes(room.round)) return room.playerKeys.map(key => ({key, points: 0, rank: 0, correct: false}));
  const correct = answers.filter(answer => answer.correct).sort((a, b) => a.receivedAt - b.receivedAt || a.key.localeCompare(b.key));
  let groupAt = -Infinity, rank = 0;
  const points = new Map(correct.map((answer, index) => {
    if (answer.receivedAt - groupAt > TIE_WINDOW_MS) {groupAt = answer.receivedAt; rank = index + 1;}
    // Store active elapsed time at submission: a later pause must not boost an earlier answer.
    const remaining = Math.max(0, Math.min(1, 1 - (answer.elapsedMs ?? answer.receivedAt - room.roundStartsAt) / room.questionMs));
    return [answer.key, {key: answer.key, correct: true, rank, points: room.mode === 'speed' ? [100, 70, 50, 40][Math.min(rank - 1, 3)] : Math.round(500 + remaining * 500)}];
  }));
  return room.playerKeys.map(key => points.get(key) || {key, correct: false, rank: 0, points: 0});
}
/** 먼저 쓰기: only the first right answer scores. Everyone else gets nothing for the question, right or not. */
export function huntResults(room: PlayRoom, answers: RoomAnswer[], points = 1000): RoomRoundResult[] {
  const first = answers.find(answer => answer.first), skipped = room.skippedRounds.includes(room.round);
  return room.playerKeys.map(key => key === first?.key && !skipped ? {key, points, rank: 1, correct: true} : {key, points: 0, rank: 0, correct: false});
}
export function teamScores(players: RoomPlayer[], teamCount: number): RoomTeam[] {
  return Array.from({length: teamCount}, (_, id) => {
    const members = players.filter(player => player.team === id);
    return {id, name: roomTeamNames[id], color: roomTeamColors[id], count: members.length, score: members.length ? members.reduce((sum, player) => sum + player.score, 0) / members.length : 0};
  });
}
/** Teams of a versus room are named after their classes; other rooms keep the usual team names. */
export function namedTeams(teams: RoomTeam[], room: Pick<PlayRoom, 'classNames'>): RoomTeam[] {
  return room.classNames?.length ? teams.map(team => ({...team, name: room.classNames![team.id] ?? team.name})) : teams;
}
export function snakeTeams(players: {key: string; previousScore: number}[], count: number): Record<string, number> {
  return Object.fromEntries([...players].sort((a, b) => b.previousScore - a.previousScore || a.key.localeCompare(b.key)).map((player, i) => [player.key, Math.floor(i / count) % 2 ? count - 1 - i % count : i % count]));
}
/** The most-missed questions, from what each revealed round already counted. Skipped and unrevealed rounds have nothing to review. */
export function missedRounds(rounds: PublicRoomRound[], limit = 5): RoomReviewItem[] {
  return rounds.flatMap(round => {
    const counts = round.distribution, correctId = round.correctChoiceId;
    if (round.skipped || !counts || !correctId || !round.choices.length) return [];
    const total = round.choices.reduce((sum, choice) => sum + (counts[choice.id] || 0), 0), wrong = total - (counts[correctId] || 0);
    if (!wrong) return [];
    const common = round.choices.filter(choice => choice.id !== correctId).reduce((best, choice) => (counts[choice.id] || 0) > (counts[best.id] || 0) ? choice : best);
    return [{round: round.round, prompt: round.prompt, answer: round.choices.find(choice => choice.id === correctId)?.label || '', reveal: round.reveal || '', total, wrong, commonWrong: common.label, commonWrongCount: counts[common.id] || 0}];
  }).sort((a, b) => b.wrong - a.wrong || b.wrong / b.total - a.wrong / a.total || a.round - b.round).slice(0, limit);
}

/** 개인전: a fixed shuffle of the questions per student, so neighbours do not see the same question at the same time. */
export function raceOrder(total: number, seed: string): number[] {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  const next = () => {state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296;};
  const order = Array.from({length: total}, (_, index) => index);
  for (let i = total - 1; i > 0; i--) {const j = Math.floor(next() * (i + 1)); [order[i], order[j]] = [order[j], order[i]];}
  return order;
}
/** 개인전 has one shared clock; a student who reconnects carries on from where they were. */
export function canRaceAnswer(room: PlayRoom, player: RoomPlayer, now: number) {
  return isRaceRoom(room) && room.status === 'question' && now >= room.roundStartsAt && now <= room.roundEndsAt + ANSWER_GRACE_MS && !player.forfeited && player.answered < room.roundsTotal;
}
/** Connected students still in the game, and how many of them have answered every question. */
export function raceProgress(room: PlayRoom, players: RoomPlayer[], now: number) {
  const active = players.filter(player => room.playerKeys.includes(player.key) && !player.forfeited && (now - player.lastSeen <= 30_000 || player.answered >= room.roundsTotal));
  return {active: active.length, done: active.filter(player => player.answered >= room.roundsTotal).length};
}
type RaceRanked = Pick<RoomPlayerSummary, 'key' | 'score' | 'forfeited' | 'raceLastAt'>;
/** Higher score first; on the same score, whoever reached it sooner. Players who left go last. */
export function raceStandings<T extends RaceRanked>(players: T[]): (T & {place: number})[] {
  const lastAt = (player: T) => player.raceLastAt ?? Number.MAX_SAFE_INTEGER;
  const sorted = [...players].sort((a, b) => Number(a.forfeited) - Number(b.forfeited) || b.score - a.score || lastAt(a) - lastAt(b) || a.key.localeCompare(b.key));
  return sorted.map((player, index) => {
    const first = sorted.findIndex(other => other.forfeited === player.forfeited && other.score === player.score && lastAt(other) === lastAt(player));
    return {...player, place: player.forfeited ? 0 : first + 1};
  });
}
