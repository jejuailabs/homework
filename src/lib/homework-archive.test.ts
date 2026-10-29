import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveEntryNames, archiveZipName, cleanupState, purgeTime, trashCheck, HOMEWORK_TRASH_KEEP_DAYS} from './homework-archive';
import {crc32, zipParts} from './zip-store';

test('archive names use the homework title and the Korean date it was given', () => {
  assert.equal(archiveZipName('받아쓰기 3단원', '2026-10-28T16:30:00.000Z'), '받아쓰기 3단원_10-29.zip');
  assert.equal(archiveZipName('수학/익힘책: 24쪽?', null), '수학 익힘책 24쪽.zip');
  assert.equal(archiveZipName('', undefined), '숙제.zip');
});

test('entries are numbered by student, keep file names and separate earlier attempts', () => {
  const students = [{id: 's1', number: 3, name: '김민준'}, {id: 's2', number: 12, name: '이서연'}];
  const names = archiveEntryNames([
    {id: 'u3', studentId: 's2', fileName: 'image.jpg', size: 3, current: true},
    {id: 'u1', studentId: 's1', fileName: 'image.jpg', size: 1, current: true},
    {id: 'u2', studentId: 's1', fileName: 'image.jpg', size: 2, current: true},
    {id: 'u4', studentId: 's1', fileName: 'old.png', size: 4, current: false},
    {id: 'u5', studentId: 'gone', fileName: 'a.pdf', size: 5, current: true},
  ], students);
  assert.deepEqual(names.map(file => file.name), ['03_김민준_image.jpg', '03_김민준_image (2).jpg', '12_이서연_image.jpg', '학생_a.pdf', '이전 제출/03_김민준_old.png']);
  assert.deepEqual(names.map(file => file.uploadId), ['u1', 'u2', 'u3', 'u5', 'u4']);
});

test('files can only be cleared after every stored file was downloaded', () => {
  assert.deepEqual(trashCheck([], ['a']), {ok: false, reason: 'NOTHING_TO_CLEAR', missing: 0});
  assert.deepEqual(trashCheck(['a', 'b'], undefined), {ok: false, reason: 'NOT_DOWNLOADED', missing: 2});
  assert.deepEqual(trashCheck(['a', 'b', 'c'], ['a', 'b']), {ok: false, reason: 'NEW_FILES', missing: 1});
  assert.deepEqual(trashCheck(['a', 'b'], ['b', 'a', 'old']), {ok: true, uploadIds: ['a', 'b']});
});

test('cleared files stay restorable for fourteen days', () => {
  const now = Date.parse('2026-10-29T00:00:00Z'), purgeAt = new Date(purgeTime(now)).toISOString();
  assert.equal(HOMEWORK_TRASH_KEEP_DAYS, 14);
  assert.equal(purgeAt, '2026-11-12T00:00:00.000Z');
  assert.equal(cleanupState(purgeAt, now), 'trashed');
  assert.equal(cleanupState(purgeAt, Date.parse(purgeAt)), 'purged');
  assert.equal(cleanupState(undefined, now), 'none');
});

test('stored ZIP entries match the standard CRC and layout', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const data = new TextEncoder().encode('hello'), parts = zipParts([{name: '03_김민준_a.txt', data, modifiedAt: new Date(2026, 9, 29, 10, 20, 30)}]);
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0; for (const part of parts) {bytes.set(part, offset); offset += part.length;}
  const view = new DataView(bytes.buffer), name = new TextEncoder().encode('03_김민준_a.txt');
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(6, true), 0x0800, 'UTF-8 names');
  assert.equal(view.getUint32(14, true), crc32(data));
  assert.equal(new TextDecoder().decode(bytes.slice(30, 30 + name.length)), '03_김민준_a.txt');
  assert.equal(new TextDecoder().decode(bytes.slice(30 + name.length, 35 + name.length)), 'hello');
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 1);
  assert.equal(view.getUint32(view.getUint32(end + 16, true), true), 0x02014b50, 'central directory offset');
});
