import assert from 'node:assert/strict';
import test from 'node:test';
import {LESSON_IMAGE_MAX, lessonFileMatches, lessonUploadIds, lessonUploadPolicy} from './upload-policy';

const uploadId = (n: number) => n.toString(16).padStart(64, '0');

test('lesson material: photos up to 900KB and one PDF up to 2.5MB, nothing else', () => {
  assert.deepEqual(lessonUploadPolicy('image', 'image/jpeg', 500_000), {kind: 'image', contentType: 'image/jpeg', size: 500_000});
  assert.deepEqual(lessonUploadPolicy('pdf', 'application/pdf', 2_500_000), {kind: 'pdf', contentType: 'application/pdf', size: 2_500_000});
  assert.throws(() => lessonUploadPolicy('image', 'image/jpeg', 900_001));
  assert.throws(() => lessonUploadPolicy('pdf', 'application/pdf', 2_500_001));
  assert.throws(() => lessonUploadPolicy('image', 'application/pdf', 10));
  assert.throws(() => lessonUploadPolicy('pdf', 'image/png', 10));
  assert.throws(() => lessonUploadPolicy('video', 'video/mp4', 10));
  assert.throws(() => lessonUploadPolicy('image', 'image/gif', 10));
  assert.throws(() => lessonUploadPolicy('image', 'image/jpeg', 0));
});

test('a generate request names up to ten photos and one PDF by upload id', () => {
  assert.equal(LESSON_IMAGE_MAX, 10);
  const ten = Array.from({length: 10}, (_, n) => uploadId(n + 1));
  assert.deepEqual(lessonUploadIds(ten, uploadId(99)), {images: ten, pdf: uploadId(99)});
  assert.deepEqual(lessonUploadIds(undefined, null), {images: [], pdf: null});
  assert.throws(() => lessonUploadIds([...ten, uploadId(11)], null), /10장까지/);
  assert.throws(() => lessonUploadIds([uploadId(1), uploadId(1)], null));
  assert.throws(() => lessonUploadIds(['data:image/jpeg;base64,AAAA'], null), 'inline photos are no longer accepted');
  assert.throws(() => lessonUploadIds([], '../other'));
});

test('stored files must start like the type they claim', () => {
  const bytes = (prefix: number[], text = '') => Uint8Array.from([...prefix, ...[...text].map(char => char.charCodeAt(0))]);
  assert.equal(lessonFileMatches('image/jpeg', bytes([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(lessonFileMatches('image/png', bytes([0x89], 'PNG\r\n')), true);
  assert.equal(lessonFileMatches('image/webp', bytes([], 'RIFF\0\0\0\0WEBPVP8 ')), true);
  assert.equal(lessonFileMatches('application/pdf', bytes([], '%PDF-1.7')), true);
  assert.equal(lessonFileMatches('image/jpeg', bytes([], '%PDF-1.7')), false);
  assert.equal(lessonFileMatches('application/pdf', bytes([], '<html>')), false);
});
