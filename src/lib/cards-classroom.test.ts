import assert from 'node:assert/strict';
import {alive, assignTeams, cardRange, fitFontSize, missedCards, newTally, pickNext, recordTurn, shuffled, speechLang, spotlightDone, spotlightLabel, spotlightRanking, undoTurn, wrapLines} from './cards-classroom';

// 범위
assert.deepEqual(cardRange(10, 3, 5).indices, [2, 3, 4], '1부터 센 범위를 배열 위치로 바꾼다');
assert.deepEqual(cardRange(10, 8, 2), {start: 2, end: 8, indices: [1, 2, 3, 4, 5, 6, 7]}, '거꾸로 넣은 범위도 바로잡는다');
assert.deepEqual(cardRange(4, -3, 99).indices, [0, 1, 2, 3], '세트 밖 값은 끝으로 맞춘다');
assert.deepEqual(cardRange(4, NaN, NaN).indices, [0, 1, 2, 3], '빈 칸이면 전체');
assert.deepEqual(cardRange(0, 1, 5).indices, [], '빈 세트');
assert.equal(speechLang('apple'), 'en-US'); assert.equal(speechLang('사과'), 'ko-KR'); assert.equal(speechLang('りんご'), 'ja-JP');
assert.deepEqual(shuffled([1, 2, 3], () => 0), [2, 3, 1], '정해진 난수로 섞는 결과가 같다');

// 글자 맞추기
assert.equal(wrapLines('apple', 100, 1000), 1);
assert.equal(wrapLines('one two\nthree', 40, 1000), 2, '줄바꿈은 새 줄');
assert.ok(wrapLines('The quick brown fox jumps over the lazy dog near the riverbank today', 60, 600) >= 3, '긴 문장은 여러 줄로 감싼다');
assert.equal(wrapLines('가나다라마바사', 100, 300), 3, '한글은 글자 하나가 한 칸, 긴 낱말은 중간에서 끊는다');
const box = {width: 1200, height: 500};
const word = fitFontSize('apple', box), sentence = fitFontSize('I would like to borrow a book about the history of our town from the library.', box);
assert.ok(word > sentence, '짧은 단어가 긴 문장보다 크게 나온다');
assert.ok(word <= 220 && sentence >= 18, '크기는 한계 안');
assert.ok(wrapLines('I would like to borrow a book about the history of our town from the library.', sentence, box.width) * sentence * 1.3 <= box.height, '고른 크기는 상자에 들어간다');
assert.equal(fitFontSize('x'.repeat(5000), {width: 100, height: 40}), 18, '아무리 줄여도 안 들어가면 최솟값');
assert.equal(fitFontSize('apple', {width: 0, height: 100}), 18, '아직 크기가 없으면 최솟값');
{const size = fitFontSize('beautiful', {width: 305, height: 600}); assert.equal(wrapLines('beautiful', size, 305), 1, '긴 낱말도 중간에서 끊기지 않을 크기'); assert.ok(size > 40);}
assert.ok(fitFontSize('apple', {width: 1920, height: 900}) > fitFontSize('apple', {width: 375, height: 300}), '큰 화면이 더 크다');

// 다시 뽑지 않기
const ids = ['a', 'b', 'c'];
let used: string[] = [], seen: string[] = [], last: string | null = null;
for (let i = 0; i < 3; i++) {const next = pickNext(ids, used, {noRepeat: true, last, random: max => max - 1}); assert.equal(next.newRound, false); seen.push(next.id!); used = next.used; last = next.id;}
assert.deepEqual([...seen].sort(), ids, '한 바퀴 안에서는 모두 한 번씩');
const round = pickNext(ids, used, {noRepeat: true, last, random: () => 0});
assert.equal(round.newRound, true, '모두 뽑히면 새 바퀴'); assert.notEqual(round.id, last, '새 바퀴 첫 사람은 직전 사람이 아니다'); assert.deepEqual(round.used, [round.id]);
assert.deepEqual(pickNext(['a', 'b'], ['a', 'gone'], {noRepeat: true, random: () => 0}).id, 'b', '명단에서 빠진 학생의 기록은 무시한다');
assert.notEqual(pickNext(ids, [], {noRepeat: false, last: 'a', random: () => 0}).id, 'a', '중복 허용이어도 같은 학생이 연달아 나오지 않는다');
assert.equal(pickNext(['solo'], ['solo'], {noRepeat: true, last: 'solo', random: () => 0}).id, 'solo', '한 명뿐이면 그 학생');
assert.equal(pickNext([], [], {noRepeat: true}).id, null);
for (let trial = 0; trial < 20; trial++) {let u: string[] = []; const got = new Set<string>(); for (let i = 0; i < 5; i++) {const n = pickNext(['1', '2', '3', '4', '5'], u, {noRepeat: true}); u = n.used; got.add(n.id!);} assert.equal(got.size, 5, '실제 난수로도 다섯 번에 다섯 명');}

// 팀·득점
assert.deepEqual(assignTeams(['a', 'b', 'c', 'd', 'e'], 2), {a: 0, b: 1, c: 0, d: 1, e: 0});
assert.deepEqual(Object.values(assignTeams(['a', 'b', 'c'], 9)), [0, 1, 2], '팀 수는 6을 넘지 않고 차례로 나눈다');
let tally = newTally('score', ['a', 'b', 'c', 'd'], 2);
tally = recordTurn(tally, {studentId: 'a', cardId: 'x', correct: true});
tally = recordTurn(tally, {studentId: 'b', cardId: 'y', correct: false});
tally = recordTurn(tally, {studentId: 'c', cardId: 'y', correct: true});
assert.deepEqual(tally.teamScores, [2, 0], 'a·c는 같은 팀'); assert.equal(tally.scores.a, 1); assert.equal(tally.scores.b, 0);
assert.equal(spotlightDone(tally, 3), true, '정한 문제 수를 내면 끝'); assert.equal(spotlightDone(tally, 4), false);
assert.deepEqual(missedCards(tally), [{cardId: 'y', wrong: 1, asked: 2}]);
const undone = undoTurn(tally); assert.deepEqual(undone.teamScores, [1, 0], '되돌리면 점수도 빠진다'); assert.equal(undone.turns.length, 2);
assert.equal(recordTurn(tally, {studentId: 'stranger', cardId: 'x', correct: true}), tally, '명단 밖 학생은 무시');
const ranked = spotlightRanking(tally);
assert.deepEqual(ranked.map(row => [row.id, row.rank]), [['a', 1], ['c', 1], ['b', 3], ['d', 3]], '같은 점수는 같은 등수, 지명 안 된 학생도 결과에 있다');
assert.equal(ranked.find(row => row.id === 'd')!.asked, 0);
const solo = newTally('score', ['a', 'b']); assert.equal(solo.teams, null, '개인전은 팀이 없다'); assert.deepEqual(recordTurn(solo, {studentId: 'a', cardId: 'x', correct: true}).teamScores, []);

// 서바이벌
let survival = newTally('survival', ['a', 'b', 'c'], 3);
assert.equal(survival.teams, null, '서바이벌은 개인');
survival = recordTurn(survival, {studentId: 'b', cardId: 'x', correct: false});
assert.deepEqual(alive(survival), ['a', 'c'], '틀리면 탈락');
assert.equal(recordTurn(survival, {studentId: 'b', cardId: 'x', correct: true}), survival, '탈락한 학생 기록은 받지 않는다');
survival = recordTurn(survival, {studentId: 'a', cardId: 'y', correct: true});
assert.equal(spotlightDone(survival, 0), false);
survival = recordTurn(survival, {studentId: 'c', cardId: 'y', correct: false});
assert.equal(spotlightDone(survival, 0), true, '한 명 남으면 끝');
assert.deepEqual(spotlightRanking(survival).map(row => [row.id, row.rank, row.out]), [['a', 1, false], ['c', 2, true], ['b', 3, true]], '남은 사람, 늦게 탈락한 사람 순서');
assert.deepEqual(alive(undoTurn(survival)), ['a', 'c'], '되돌리면 다시 살아난다');

// 이름표
assert.equal(spotlightLabel({number: 7, name: '김하늘'}, false, 'ko'), '7번', '기본은 번호만');
assert.equal(spotlightLabel({number: 7, name: '김하늘'}, true, 'ko'), '7번 김하늘');
assert.equal(spotlightLabel({number: 7, name: 'Sky'}, false, 'en'), 'No. 7');
console.log('cards classroom tests passed');
