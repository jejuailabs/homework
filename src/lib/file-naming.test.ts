import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadDisposition, extensionOf, friendlyFileName, personPart, titlePart} from './file-naming';

test('titles drop spaces and symbols and keep the first ten characters', () => {
  assert.equal(titlePart('레코더 영상 학교종이 땡!'), '레코더영상학교종이땡');
  assert.equal(titlePart('레코더 영상: 학교종이 땡땡땡 연습'), '레코더영상학교종이땡');
  assert.equal(titlePart('Unit 3 · Spelling test'), 'Unit3Spell');
  assert.equal(titlePart('  ** '), '파일');
  assert.equal(titlePart('', '전시'), '전시');
});

test('people keep their name without spaces', () => {
  assert.equal(personPart('심 지후'), '심지후');
  assert.equal(personPart(''), '학생');
});

test('extensions come from the original name, else from the content type', () => {
  assert.equal(extensionOf('IMG_1234.JPG', 'image/jpeg'), 'jpg');
  assert.equal(extensionOf('영상', 'video/mp4'), 'mp4');
  assert.equal(extensionOf('noext', 'application/x-unknown'), '');
});

test('friendly names follow 이름_제목 and number later files', () => {
  assert.equal(friendlyFileName('심지후', '레코더 영상 학교종이 땡', 'mp4'), '심지후_레코더영상학교종이땡.mp4');
  assert.equal(friendlyFileName('심지후', '레코더 영상 학교종이 땡', 'jpg', 2), '심지후_레코더영상학교종이땡_2.jpg');
  assert.equal(friendlyFileName('', '', ''), '학생_파일');
});

test('dispositions keep Korean names and an ASCII fallback', () => {
  assert.equal(downloadDisposition('심지후_가을.jpg'), `inline; filename="______.jpg"; filename*=UTF-8''${encodeURIComponent('심지후_가을.jpg')}`);
  assert.match(downloadDisposition('a"b.jpg', 'attachment'), /^attachment; filename="a_b\.jpg"; filename\*=UTF-8''a%22b\.jpg$/);
});
