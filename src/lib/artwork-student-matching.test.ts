import test from 'node:test';
import assert from 'node:assert/strict';
import {hasDuplicateArtworkStudents, linkableArtworks, matchArtworkStudent} from './artwork-student-matching';

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

test('existing artworks link by artist name or title, once per student, never over a linked one', () => {
  const students = [{id: 'one', name: '장유석'}, {id: 'two', name: '김하늘'}, {id: 'three', name: '이바다'}, {id: 'x', name: '박별'}, {id: 'y', name: '박별'}];
  assert.deepEqual(linkableArtworks([
    {id: 'a', title: '장유석', artistName: ''},
    {id: 'b', title: '봄 풍경', artistName: '김 하늘'},
    {id: 'c', title: '장유석', artistName: ''},
    {id: 'd', title: '이바다', studentId: 'three'},
    {id: 'e', title: '이바다'},
    {id: 'f', title: '박별'},
    {id: 'g', title: '모르는 제목'},
  ], students), [
    {artworkId: 'a', studentId: 'one', artistName: '장유석'},
    {artworkId: 'b', studentId: 'two', artistName: '김하늘'},
  ]);
});
