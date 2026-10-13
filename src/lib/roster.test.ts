import assert from 'node:assert/strict';
import test from 'node:test';
import {parseRoster} from './roster';

test('numbered lists accept dots, whitespace, parentheses and Korean number suffixes together', () => {
  assert.deepEqual(parseRoster('1. 김민서\n2 이서준\n3) 박하윤\n4번 최지우'), {ok: true, students: [
    {number: 1, name: '김민서'}, {number: 2, name: '이서준'}, {number: 3, name: '박하윤'}, {number: 4, name: '최지우'},
  ]});
  assert.deepEqual(parseRoster('1.김민서\n2)박하윤').ok, true);
});

test('Excel and quoted CSV retain names, spaces, commas and escaped quotes', () => {
  assert.deepEqual(parseRoster('\uFEFF번호\t이름\r\n1\t김민서\r\n\r\n2\tMary Jane'), {ok: true, students: [{number: 1, name: '김민서'}, {number: 2, name: 'Mary Jane'}]});
  assert.deepEqual(parseRoster('"number","name"\n"1","Doe, Jane"\n2,"Alex ""AJ"" Kim"'), {ok: true, students: [{number: 1, name: 'Doe, Jane'}, {number: 2, name: 'Alex "AJ" Kim'}]});
});

test('invalid rows fail the entire batch and report the original input line including blank lines', () => {
  assert.deepEqual(parseRoster('\n번호,이름\n1. 김민서\n\n학생 이름'), {ok: false, issue: {kind: 'format', line: 5}});
  assert.deepEqual(parseRoster('1,김민서\n01. 이서준'), {ok: false, issue: {kind: 'duplicate', line: 2}});
});

test('decimal and negative numbers cannot silently become a different student number', () => {
  for (const input of ['1.5, Alice', '1.5 Alice', '-1, Alice', '1e2 Alice', '1Alice']) assert.equal(parseRoster(input).ok, false, input);
  for (const input of ['0. Alice', '1000, Alice']) assert.deepEqual(parseRoster(input), {ok: false, issue: {kind: 'number', line: 1}});
  assert.equal(parseRoster('999) Alice').ok, true);
});

test('names and delimited rows are validated without ignoring extra columns or broken quotes', () => {
  for (const input of ['1,', '1. ', `1,${'가'.repeat(51)}`, '1,Alice,extra', '1\tAlice\textra', '1,"Alice', '1,"Alice"extra']) assert.equal(parseRoster(input).ok, false, input);
  assert.equal(parseRoster(`1,${'가'.repeat(50)}`).ok, true);
  for (const input of ['', '  \n ', '번호,이름']) assert.deepEqual(parseRoster(input), {ok: false, issue: {kind: 'empty', line: 1}});
});
