import test from 'node:test';
import assert from 'node:assert/strict';
import {hasDuplicateArtworkStudents, matchArtworkStudent} from './artwork-student-matching';

test('written names only preselect one exact roster match', () => {
  const students = [{id: 'one', name: '김하늘'}, {id: 'two', name: '이바다'}];
  assert.deepEqual(matchArtworkStudent(' 김 하늘 ', students), {studentId: 'one', artistName: '김하늘'});
  assert.equal(matchArtworkStudent('', students).studentId, '');
  assert.equal(matchArtworkStudent('김하', students).studentId, '');
  assert.equal(matchArtworkStudent('없는이름', students).studentId, '');
});

test('students with the same name must be selected manually by their distinct IDs', () => {
  const students = [{id: 'one', name: '김하늘'}, {id: 'two', name: '김하늘'}];
  assert.equal(matchArtworkStudent('김하늘', students).studentId, '');
  assert.equal(hasDuplicateArtworkStudents([{studentId: 'one'}, {studentId: 'two'}]), false);
});

test('bulk selection detects duplicate student slots before an upload can overwrite them', () => {
  assert.equal(hasDuplicateArtworkStudents([{studentId: 'one'}, {studentId: 'one'}]), true);
  assert.equal(hasDuplicateArtworkStudents([{studentId: ''}, {studentId: ''}, {studentId: 'one'}]), false);
});
