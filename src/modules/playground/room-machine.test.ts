import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activeKeys, canAnswer, roomDue, roomTransition, roundResults, snakeTeams, teamScores} from './room-machine';
import type {PlayRoom, RoomPlayer} from './room-types';

const player = (key: string): RoomPlayer => ({key, uid: key, name: key, character: 'cat', outfit: {}, spaceOutfit: {}, team: 0, score: 0, lastSeen: 1000, forfeited: false, answered: 0, eligibleFrom: 0, joinedAt: 1000, lastReactionAt: 0, reaction: '', answeredRound: -1});
const room = (): PlayRoom => ({id: 'test', code: '1234', classId: 'c', ownerUid: 't', hostKey: 'a', mode: 'speed', status: 'lobby', kinds: ['riddle'], playerKeys: ['a', 'b'], players: [], teams: [], teamCount: 2, round: -1, roundsTotal: 2, questionMs: 10000, roundStartsAt: 0, roundEndsAt: 0, statusEndsAt: 600000, createdAt: 0, updatedAt: 0, expiresAtMs: 600000, settled: false, pausedFrom: null, pausedAt: 0, skippedRounds: []});
test('room progression waits through the entire network grace window', () => {
  const countdown = roomTransition(room(), 'start', 1000);
  assert.equal(countdown.status, 'countdown');
  const question = roomTransition(countdown, 'tick', 4000);
  assert.equal(question.round, 0);
  assert.equal(canAnswer(question, {...player('a'), lastSeen: 14000}, 14500), true);
  assert.equal(roomTransition(question, 'tick', 14300).status, 'question');
  assert.equal(roomTransition(question, 'tick', 14500).status, 'question');
  const reveal = roomTransition(question, 'tick', 14501);
  assert.equal(reveal.status, 'reveal');
  assert.equal(roomTransition(reveal, 'tick', 14502).status, 'reveal');
  assert.equal(roomTransition(reveal, 'tick', 18501).round, 1);
});
test('150ms tie groups use the first timestamp rather than chaining ties', () => {
  const r = {...room(), round: 0, playerKeys: ['a', 'b', 'c', 'd']};
  const result = roundResults(r, ['a', 'b', 'c', 'd'].map((key, i) => ({key, round: 0, choiceId: 'x', correct: true, receivedAt: [100, 250, 300, 500][i]})));
  assert.deepEqual(result.map(row => row.points), [100,100,50,40]);
  assert.deepEqual(result.map(row => row.rank), [1,1,3,4]);
});
test('pause shifts authoritative clocks and late grace answers cannot earn negative speed points', () => {
  const r = {...room(), mode: 'team' as const, status: 'question' as const, round: 0, roundStartsAt: 1000, roundEndsAt: 11000, statusEndsAt: 11500};
  const paused = roomTransition(r, 'pause', 5000);
  assert.equal(canAnswer(paused, player('a'), 6000), false);
  const resumed = roomTransition(paused, 'pause', 9000);
  assert.equal(resumed.roundEndsAt, 15000);
  assert.equal(roundResults(resumed, [{key: 'a', round: 0, choiceId: 'x', correct: true, receivedAt: 15499}])[0].points, 500);
  assert.equal(roundResults(resumed, [{key:'a',round:0,choiceId:'x',correct:true,receivedAt:4000,elapsedMs:3000}])[0].points,850);
});
test('team averages keep absent players in the denominator and snake allocation balances ranks', () => {
  const a = {...player('a'), score: 1000}, b = {...player('b'), forfeited: true}, c = {...player('c'), team: 1, score: 500};
  assert.deepEqual(teamScores([a,b,c], 2).map(team => team.score), [500,500]);
  assert.deepEqual(snakeTeams(['a','b','c','d'].map((key,i) => ({key, previousScore: 4-i})),2), {a:0,b:1,c:1,d:0});
});
test('30 simultaneous answers are individually scored and skipped questions grant no points', () => {
  const r = {...room(), mode: 'team' as const, round: 0, playerKeys: Array.from({length:30},(_,i)=>`p${i}`), roundStartsAt: 1000, roundEndsAt: 11000};
  const answers = r.playerKeys.map(key => ({key, round:0, choiceId:'x', receivedAt:2000, correct:true}));
  assert.equal(roundResults(r, answers).filter(row=>row.points===950).length,30);
  assert.equal(roundResults({...r, skippedRounds:[0]}, answers).reduce((sum,row)=>sum+row.points,0),0);
});
test('early termination is cancelled and only the final reveal completes a match', () => {
  assert.equal(roomTransition({...room(),status:'question',round:0},'end',10000).completion,'cancelled');
  assert.equal(roomTransition({...room(),status:'reveal',round:1,statusEndsAt:0},'tick',10000).completion,'complete');
});
test('a question ends early once every connected, eligible player answered', () => {
  const r = {...room(), status: 'question' as const, round: 2, playerKeys: ['a', 'b', 'c'], roundStartsAt: 1000, roundEndsAt: 16000, statusEndsAt: 16500};
  const players = [{...player('a'), lastSeen: 5000}, {...player('b'), lastSeen: 5000}, {...player('c'), lastSeen: 1000}];
  assert.deepEqual([...activeKeys(r, players, 6000)].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...activeKeys(r, players, 32000)].sort(), ['a', 'b']);
  assert.equal(activeKeys(r, players, 36000).size, 0);
  // c closed the laptop: a and b answering is enough.
  assert.equal(roomTransition(r, 'tick', 6000, 2, 2).status, 'reveal');
  assert.equal(roomTransition(r, 'tick', 6000, 2, 3).status, 'question');
  // Nobody connected never ends the question before its clock.
  assert.equal(roomTransition(r, 'tick', 6000, 0, 0).status, 'question');
  assert.equal(activeKeys(r, [{...player('a'), lastSeen: 5000, eligibleFrom: 3}, {...player('b'), lastSeen: 5000, forfeited: true}], 6000).size, 0);
});
test('roomDue matches the transitions a server tick would apply', () => {
  const r = room();
  assert.equal(roomDue(r, 599999), false); assert.equal(roomDue(r, 600000), true);
  const countdown = roomTransition(r, 'start', 1000);
  assert.equal(roomDue(countdown, 3999), false); assert.equal(roomDue(countdown, 4000), true);
  const question = roomTransition(countdown, 'tick', 4000);
  assert.equal(roomDue(question, 14500), false); assert.equal(roomDue(question, 14501), true);
  const reveal = roomTransition(question, 'tick', 14501);
  assert.equal(roomDue(reveal, 18500), false); assert.equal(roomDue(reveal, 18501), true);
  assert.equal(roomDue({...reveal, mode: 'team'}, 99999), false);
  assert.equal(roomDue({...reveal, status: 'paused'}, 99999), false);
});
