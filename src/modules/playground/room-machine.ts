import type {PlayRoom, RoomAnswer, RoomPlayer, RoomRoundResult, RoomTeam} from './room-types';
import {roomTeamColors, roomTeamNames} from './room-types';

export const ANSWER_GRACE_MS = 500;
export const TIE_WINDOW_MS = 150;
export function canAnswer(room: PlayRoom, player: RoomPlayer, now: number) {
  return room.status === 'question' && now >= room.roundStartsAt && now <= room.roundEndsAt + ANSWER_GRACE_MS && !player.forfeited && player.eligibleFrom <= room.round && now - player.lastSeen <= 30_000;
}
export function roomTransition(previous: PlayRoom, action: 'start'|'tick'|'next'|'pause'|'end', now: number, answered = 0): PlayRoom {
  const room = structuredClone(previous);
  if (['finished', 'closed'].includes(room.status)) return room;
  const finish = (completion: 'complete'|'cancelled' = 'cancelled') => {room.status = room.round < 0 ? 'closed' : 'finished'; room.completion=completion; room.statusEndsAt = 0; room.expiresAtMs = now + 30 * 60_000;};
  const question = () => {room.status = 'question'; room.round++; room.roundStartsAt = now; room.roundEndsAt = now + room.questionMs; room.statusEndsAt = room.roundEndsAt + ANSWER_GRACE_MS;};
  if (action === 'end') finish();
  else if (action === 'pause' && room.mode === 'team') {
    if (room.status === 'paused' && room.pausedFrom) {
      const elapsed = now - room.pausedAt; room.status = room.pausedFrom; room.statusEndsAt += elapsed; room.roundStartsAt += elapsed; room.roundEndsAt += elapsed; room.pausedFrom = null;
    } else if (room.status === 'countdown' || room.status === 'question' || room.status === 'reveal') {room.pausedFrom = room.status; room.pausedAt = now; room.status = 'paused';}
  } else if (room.status === 'lobby') {
    if (action === 'start' && room.playerKeys.length >= 2) {room.status = 'countdown'; room.statusEndsAt = now + 3000;}
    else if (now >= room.statusEndsAt) {room.status = 'closed'; room.expiresAtMs = now;}
  } else if (room.status === 'countdown' && now >= room.statusEndsAt) question();
  else if (room.status === 'question' && (now > room.roundEndsAt + ANSWER_GRACE_MS || answered === room.playerKeys.length || action === 'next')) {
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
export function teamScores(players: RoomPlayer[], teamCount: number): RoomTeam[] {
  return Array.from({length: teamCount}, (_, id) => {
    const members = players.filter(player => player.team === id);
    return {id, name: roomTeamNames[id], color: roomTeamColors[id], count: members.length, score: members.length ? members.reduce((sum, player) => sum + player.score, 0) / members.length : 0};
  });
}
export function snakeTeams(players: {key: string; previousScore: number}[], count: number): Record<string, number> {
  return Object.fromEntries([...players].sort((a, b) => b.previousScore - a.previousScore || a.key.localeCompare(b.key)).map((player, i) => [player.key, Math.floor(i / count) % 2 ? count - 1 - i % count : i % count]));
}
