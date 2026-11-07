import assert from 'node:assert/strict';
import {blankAnswer, drillAnswerText, drillQuestion, gradeDrill, maskPassage, parseDrill, passageBlanks} from './cards-drill';
import {buildTestQuestions, cardAnswer, isCorrectCardAnswer} from './cards-logic';

const base = {front: '알맞은 말을 고르세요.', back: '', example: '', alternatives: [] as string[]};
assert.deepEqual(passageBlanks('I [have] a dog and [two / 2 ] cats. [ ]'), [['have'], ['two', '2']], 'blank answers split on slashes; empty blanks ignored');
assert.equal(maskPassage('I [have] a dog and [two/2] cats.'), 'I ( 1 ) a dog and ( 2 ) cats.');

// Parsing each kind, with the back worked out on the server.
const choice = parseDrill({kind: 'choice', choices: [' apple ', 'banana', 'cherry', ''], answer: 1}, base);
assert.deepEqual(choice, {drill: {kind: 'choice', choices: ['apple', 'banana', 'cherry'], answer: 1}, back: 'banana'});
assert.ok('error' in parseDrill({kind: 'choice', choices: ['a'], answer: 0}, base), 'two options at least');
assert.ok('error' in parseDrill({kind: 'choice', choices: ['a', 'A '], answer: 0}, base), 'no option twice');
assert.ok('error' in parseDrill({kind: 'choice', choices: ['a', 'b'], answer: 2}, base), 'the answer must be one of the options');
assert.deepEqual(parseDrill({kind: 'ox', answer: 1}, base), {drill: {kind: 'ox', answer: 1}, back: 'X'});
assert.ok('error' in parseDrill({kind: 'ox', answer: 2}, base));
assert.ok('error' in parseDrill({kind: 'short'}, base), 'a short answer needs its answer');
assert.deepEqual(parseDrill({kind: 'short'}, {...base, back: 'Seoul'}), {drill: {kind: 'short'}, back: 'Seoul'});
const passage = 'Yesterday I [went] to school and [saw/met] my friend.';
assert.ok('error' in parseDrill({kind: 'short-blank'}, base), 'a blank kind needs [blanks] in the passage');
assert.deepEqual(parseDrill({kind: 'short-blank'}, {...base, example: passage}), {drill: {kind: 'short-blank'}, back: 'went, saw'});
assert.ok('error' in parseDrill({kind: 'choice-blank', blanks: [{wrong: ['go']}, {wrong: []}]}, {...base, example: passage}), 'every choice blank needs a wrong option');
assert.deepEqual(parseDrill({kind: 'choice-blank', blanks: [{wrong: ['go', ' goes ', 'went']}, {wrong: ['see']}]}, {...base, example: passage}), {drill: {kind: 'choice-blank', blanks: [{wrong: ['go', 'goes']}, {wrong: ['see']}]}, back: 'went, saw'}, 'the right answer never doubles as a wrong option');
assert.ok('error' in parseDrill({kind: 'essay'}, base));
assert.ok('error' in parseDrill({kind: 'ox', answer: 0}, {...base, front: ''}), 'a question needs its text');

// Grading: the same rule in practice, tests and the server.
const choiceCard = {...base, back: 'banana', drill: {kind: 'choice' as const, choices: ['apple', 'banana', 'cherry'], answer: 1}};
assert.equal(gradeDrill(choiceCard, ' Banana '), true); assert.equal(gradeDrill(choiceCard, 'apple'), false);
const oxCard = {...base, back: 'X', drill: {kind: 'ox' as const, answer: 1}};
assert.equal(gradeDrill(oxCard, 'x'), true); assert.equal(gradeDrill(oxCard, 'O'), false);
const shortCard = {...base, back: 'Seoul', alternatives: ['서울'], drill: {kind: 'short' as const}};
assert.equal(gradeDrill(shortCard, ' seoul'), true); assert.equal(gradeDrill(shortCard, '서울'), true); assert.equal(gradeDrill(shortCard, 'Busan'), false);
const shortBlank = {...base, example: passage, back: 'went, saw', drill: {kind: 'short-blank' as const}};
assert.equal(gradeDrill(shortBlank, blankAnswer(['Went', 'met'])), true, 'any answer between the slashes');
assert.equal(gradeDrill(shortBlank, blankAnswer(['went'])), false, 'every blank must be answered');
assert.equal(gradeDrill(shortBlank, 'went, saw'), false, 'blank answers come as a list');
const choiceBlank = {...base, example: passage, back: 'went, saw', drill: {kind: 'choice-blank' as const, blanks: [{wrong: ['go']}, {wrong: ['see']}]}};
assert.equal(gradeDrill(choiceBlank, blankAnswer(['went', 'saw'])), true);
assert.equal(gradeDrill(choiceBlank, blankAnswer(['went', 'met'])), false, 'a choice blank takes only the option it marks right');
assert.equal(drillAnswerText(choiceBlank), 'went, saw');

// The question a student gets carries no answer.
const asked = drillQuestion(choiceBlank, () => 0);
assert.equal(asked.passage, 'Yesterday I ( 1 ) to school and ( 2 ) my friend.');
assert.deepEqual(asked.blanks?.map(blank => [...(blank.choices ?? [])].sort()), [['go', 'went'], ['saw', 'see']]);
assert.ok(!JSON.stringify(drillQuestion(shortBlank, () => 0)).includes('went'), 'written blanks send no options and no answers');
assert.deepEqual(drillQuestion(oxCard, () => 0).choices, ['O', 'X']);

// Shared card logic routes drill cards: tests ask the drill question and grade it by the drill rule, whatever the direction.
const questions = buildTestQuestions([{id: 'q1', ...choiceCard}, {id: 'q2', ...shortBlank}], [], {direction: 'back-front', format: 'written'}, () => 'id', () => 0);
assert.deepEqual([questions[0].prompt, questions[0].choices?.length, questions[0].drill?.kind], [base.front, 3, 'choice'], 'options travel as test choices');
assert.deepEqual([questions[1].choices, questions[1].drill?.blanks?.length, questions[1].drill?.passage?.includes('( 1 )')], [undefined, 2, true]);
assert.equal(isCorrectCardAnswer({id: 'q1', ...choiceCard}, 'back-front', 'banana'), true);
assert.equal(cardAnswer({id: 'q2', ...shortBlank}, 'back-front'), 'went, saw');
console.log('cards drill tests ok');
