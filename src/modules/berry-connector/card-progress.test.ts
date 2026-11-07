import assert from 'node:assert/strict';
import {classCardProgress} from './card-progress';

const cards = [{id: 'a', front: 'apple', back: '사과'}, {id: 'b', front: 'book', back: '책'}, {id: 'c', front: 'cat', back: '고양이'}];
const label = (number: number) => `학생 ${String(number).padStart(2, '0')}`;
const summary = classCardProgress([
  {number: 7, unfinished: true, goalReached: false, bestScore: null, mistakes: {a: 3, b: 1, gone: 9}},
  {number: 2, unfinished: true, goalReached: false, bestScore: 60, mistakes: {a: 1, b: 2, c: 1}},
  {number: 11, unfinished: false, goalReached: true, bestScore: 90},
], cards, label);
assert.equal(summary.students, 3);
assert.equal(summary.finished, 1);
assert.equal(summary.unfinished, 2);
assert.deepEqual(summary.unfinished_students, ['학생 02', '학생 07'], 'students stay pseudonymous, in number order');
assert.equal(summary.goal_reached, 1);
assert.equal(summary.tested, 2);
assert.equal(summary.average_best_score, 75);
assert.deepEqual(summary.most_missed, [{word: 'apple', meaning: '사과', misses: 4, students: 2}, {word: 'book', meaning: '책', misses: 3, students: 2}, {word: 'cat', meaning: '고양이', misses: 1, students: 1}], 'most missed first; cards outside the snapshot are ignored');

const empty = classCardProgress([], cards, label);
assert.equal(empty.average_best_score, null);
assert.deepEqual(empty.most_missed, []);
const many = classCardProgress([{number: 1, unfinished: false, goalReached: false, bestScore: null, mistakes: Object.fromEntries('abcdefg'.split('').map(id => [id, 1]))}], 'abcdefg'.split('').map(id => ({id, front: id, back: id})), label);
assert.equal(many.most_missed.length, 5, 'the list stays short');
console.log('card progress tests ok');
