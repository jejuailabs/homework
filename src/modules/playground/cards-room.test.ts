import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cardHuntCapacity, cardHuntItems, cardRoomCapacity, cardRoomItems, versusClassIds} from './cards-room';
import {choicesFor, isItemAnswer, normalizeAnswer} from './engine';
import {huntResults, missedRounds, namedTeams, teamScores} from './room-machine';
import {isVersusRoom, roomHasClass} from './room-types';
import type {CardEntry} from '../../lib/cards-types';
import type {PublicRoomRound} from './room-types';

const card = (id: string, front: string, back: string, alternatives: string[] = [], example = ''): CardEntry => ({id, front, back, example, alternatives});
const words = [card('a', 'apple', '사과'), card('b', 'banana', '바나나'), card('c', 'cherry', '체리'), card('d', 'grape', '포도'), card('e', 'lemon', '레몬')];
const first = () => 0;

test('a question asks in the chosen direction and offers four choices with one correct label', () => {
  const [item] = cardRoomItems(words, 'front-back', 1, first);
  assert.equal(item.prompt, words.find(row => row.back === item.answers[0])?.front);
  assert.equal(item.choices?.length, 4);
  assert.equal(new Set(item.choices).size, 4);
  assert.equal(item.choices?.filter(label => isItemAnswer(item, label)).length, 1);
  const [reverse] = cardRoomItems(words, 'back-front', 1, first);
  assert.equal(reverse.prompt, words.find(row => row.front === reverse.answers[0])?.back);
});
test('rounds are capped by the request and never repeat a card', () => {
  const items = cardRoomItems(words, 'front-back', 3, first);
  assert.equal(items.length, 3);
  assert.equal(new Set(items.map(item => item.id)).size, 3);
  assert.equal(cardRoomItems(words, 'front-back', 30, first).length, 5);
});
test('alternatives and matching spellings of the answer are never offered as wrong choices', () => {
  const cards = [card('a', 'car', '자동차', ['차']), card('b', 'tea', '차'), card('c', 'auto', 'car'), card('d', 'dog', '  자동차 '), card('e', 'cat', '고양이')];
  const item = cardRoomItems(cards.slice(0, 1).concat(cards.slice(1)), 'front-back', 5, first).find(row => row.id === 'card_a')!;
  assert.deepEqual([...item.choices!].sort(), ['car', '고양이', '자동차'].sort());
});
test('cards sharing a prompt never appear as each other\'s wrong answer', () => {
  const cards = [card('a', 'bank', '은행'), card('b', 'bank', '둑'), card('c', 'river', '강'), card('d', 'sun', '해')];
  for (const item of cardRoomItems(cards, 'front-back', 4, first).filter(row => row.prompt === 'bank')) assert.equal(item.choices?.filter(label => ['은행', '둑'].includes(label)).length, 1);
});
test('symbols that playground normalization erases still grade as different choices', () => {
  const cards = [card('a', '더하기', '+'), card('b', '빼기', '-'), card('c', '곱하기', '×')];
  assert.equal(normalizeAnswer('+', 'vocab'), normalizeAnswer('-', 'vocab'));
  for (const item of cardRoomItems(cards, 'front-back', 3, first)) {
    assert.equal(item.choices?.length, 3);
    assert.equal(item.choices?.filter(label => isItemAnswer(item, label)).length, 1);
    const shown = choicesFor(item, 'room:0');
    assert.equal(shown.filter(choice => isItemAnswer(item, choice.label)).length, 1);
    assert.equal(new Set(shown.map(choice => choice.id)).size, 3);
    assert.ok(shown.every(choice => !/[+×-]/.test(choice.id.replace(/^c_/, '').replace(/_/g, ''))), 'choice IDs do not carry the label');
  }
});
test('playground items keep their forgiving normalized grading', () => {
  assert.equal(isItemAnswer({id: 'x', version: '1', kind: 'vocab', gradeBand: 'mid', prompt: '', answers: ['아이스 크림'], hints: [], reveal: '', source: 'bank'}, '아이스크림'), true);
});
test('a set needs two distinct answers before any question can have a wrong choice', () => {
  assert.deepEqual(cardRoomCapacity([card('a', 'one', '같음'), card('b', 'two', ' 같음'), card('c', 'three', '같음')], 'front-back'), {answers: 1, questions: 0});
  assert.deepEqual(cardRoomItems([card('a', 'one', '같음'), card('b', 'two', '같음')], 'front-back', 2, first), []);
  assert.deepEqual(cardRoomCapacity([card('a', 'one', '같음'), card('b', 'two', '같음')], 'back-front'), {answers: 2, questions: 0}, 'both cards share a prompt in this direction, so neither can be a wrong choice');
  assert.deepEqual(cardRoomCapacity(words.slice(0, 2), 'front-back'), {answers: 2, questions: 2});
  assert.deepEqual(cardRoomCapacity([], 'front-back'), {answers: 0, questions: 0});
});
test('capacity stops at the room limit of 30 questions', () => {
  const many = Array.from({length: 40}, (_, index) => card(`c${index}`, `front ${index}`, `back ${index}`));
  assert.deepEqual(cardRoomCapacity(many, 'front-back'), {answers: 40, questions: 30});
});
test('nothing in a question carries the alternatives or a marker of the right choice', () => {
  const [item] = cardRoomItems([card('z', 'car', '자동차', ['승용차'], 'I drive a car.'), ...words], 'front-back', 6, first).filter(row => row.id === 'card_z');
  assert.deepEqual(item.answers, ['자동차']);
  assert.equal(item.reveal, 'car = 자동차\nI drive a car.');
  assert.ok(!item.choices?.includes('승용차'));
});

const round = (index: number, counts: Record<string, number>, patch: Partial<PublicRoomRound> = {}): PublicRoomRound => ({round: index, kind: 'vocab', prompt: `p${index}`, choices: [{id: 'r', label: '정답'}, {id: 'x', label: '오답1'}, {id: 'y', label: '오답2'}], correctChoiceId: 'r', reveal: 'why', distribution: counts, ...patch});
test('the review ranks the most-missed rounds from their answer counts', () => {
  const review = missedRounds([round(0, {r: 9, x: 1}), round(1, {r: 2, x: 3, y: 5}), round(2, {r: 10}), round(3, {r: 6, x: 2, y: 2})]);
  assert.deepEqual(review.map(item => [item.round, item.wrong, item.total]), [[1, 8, 10], [3, 4, 10], [0, 1, 10]]);
  assert.deepEqual([review[0].answer, review[0].commonWrong, review[0].commonWrongCount], ['정답', '오답2', 5]);
});
test('ties prefer the higher wrong share, then the earlier round', () => {
  assert.deepEqual(missedRounds([round(0, {r: 8, x: 2}), round(1, {r: 1, x: 2}), round(2, {r: 1, y: 2})]).map(item => item.round), [1, 2, 0]);
});
test('skipped and unrevealed rounds stay out of the review and the limit holds', () => {
  assert.deepEqual(missedRounds([round(0, {x: 3}, {skipped: true}), round(1, {x: 3}, {correctChoiceId: undefined}), round(2, {}, {distribution: undefined}), round(3, {r: 0})]), []);
  assert.equal(missedRounds(Array.from({length: 9}, (_, index) => round(index, {x: 1 + index}))).length, 5);
});

test('반대항전: two to six classes, the host first; teams carry class names and class averages', () => {
  assert.equal(versusClassIds('a', undefined), null, 'no list, no versus room');
  assert.deepEqual(versusClassIds('a', ['b', 'a', 'b']), ['a', 'b']);
  assert.deepEqual(versusClassIds('a', []), [], 'one class alone is not a versus room');
  assert.deepEqual(versusClassIds('a', ['b', 'c', 'd', 'e', 'f', 'g']), [], 'seven classes is too many');
  assert.deepEqual(versusClassIds('a', [3]), []);
  const room = {classId: 'a', classIds: ['a', 'b'], classNames: ['3-1', '3-2']};
  assert.equal(roomHasClass(room, 'b'), true); assert.equal(roomHasClass(room, 'c'), false); assert.equal(roomHasClass({classId: 'a'}, 'b'), false);
  assert.equal(isVersusRoom(room), true); assert.equal(isVersusRoom({classIds: undefined}), false);
  const player = (team: number, score: number) => ({team, score}) as Parameters<typeof teamScores>[0][number];
  const teams = namedTeams(teamScores([player(0, 900), player(0, 300), player(1, 500)], 2), room);
  assert.deepEqual(teams.map(team => [team.name, team.score, team.count]), [['3-1', 600, 2], ['3-2', 500, 1]], 'a class of two and a class of one compare by average');
  assert.equal(namedTeams(teamScores([player(0, 1)], 2), {})[0].name, '햇살', 'other rooms keep the usual names');
});

test('먼저 쓰기: any card with an answer can be asked; the secret keeps the card for the study grading rule', () => {
  const deck = [{id: 'a', front: 'big', back: '크다', example: '', alternatives: ['커다랗다']}, {id: 'b', front: 'large', back: '크다', example: '', alternatives: []}, {id: 'c', front: 'blank', back: ' ', example: '', alternatives: []}] as CardEntry[];
  assert.equal(cardHuntCapacity(deck, 'front-back'), 2, 'two cards sharing an answer still run; a blank answer does not');
  const items = cardHuntItems(deck, 'front-back', 5, () => 0);
  assert.equal(items.length, 2);
  const big = items.find(row => row.card.id === 'a')!;
  assert.deepEqual([big.item.prompt, big.item.answers, big.item.choices], ['big', ['크다', '커다랗다'], []]);
  assert.equal(cardHuntItems(deck, 'back-front', 1, () => 0)[0].item.answers.length, 1, 'back to front asks for the front only');
});
test('먼저 쓰기: only the first right answer scores, and a skipped question scores nothing', () => {
  const room = {playerKeys: ['s1', 's2', 's3'], skippedRounds: [] as number[], round: 0} as unknown as Parameters<typeof huntResults>[0];
  const answers = [{key: 's2', round: 0, choiceId: '', receivedAt: 2, correct: true, first: true}, {key: 's2', round: 0, choiceId: '', receivedAt: 2, correct: true, tries: 2}, {key: 's1', round: 0, choiceId: '', receivedAt: 1, correct: false, tries: 1}];
  assert.deepEqual(huntResults(room, answers, 1000), [{key: 's1', points: 0, rank: 0, correct: false}, {key: 's2', points: 1000, rank: 1, correct: true}, {key: 's3', points: 0, rank: 0, correct: false}]);
  assert.ok(huntResults({...room, skippedRounds: [0]}, answers, 1000).every(row => row.points === 0));
  assert.deepEqual(missedRounds([{round: 0, kind: 'vocab', prompt: 'p', choices: [], correctChoiceId: 'x', distribution: {}}]), [], 'typed rounds stay out of the choice review');
});
