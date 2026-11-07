import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cardRoomCapacity, cardRoomItems} from './cards-room';
import {choicesFor, isItemAnswer, normalizeAnswer} from './engine';
import {missedRounds} from './room-machine';
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
