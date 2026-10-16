import assert from 'node:assert/strict';
import test from 'node:test';
import {artworkToday, validArtworkDate} from '../exhibition-metadata';
import {artworkAuthorImages, artworkAuthorNames, artworkAuthorRequest} from './artwork-author-policy';
test('artwork dates default to the Korean school day and reject calendar rollovers', () => {
  assert.equal(artworkToday(new Date('2026-10-15T16:00:00Z')), '2026-10-16');
  assert(validArtworkDate('2024-02-29'));
  for(const day of ['2026-02-29','2026-13-01','2026-02-30','2026-1-1'])assert(!validArtworkDate(day));
});
test('author reading accepts bounded embedded photos only, never external URLs', () => {
  const image='data:image/jpeg;base64,/9j/AAAA';assert.deepEqual(artworkAuthorImages([image]),[image]);
  for(const input of [[],Array(21).fill(image),['https://private.example/image.jpg'],['data:image/svg+xml;base64,AAAA']])assert.throws(()=>artworkAuthorImages(input));
  const request=artworkAuthorRequest([image],'gpt-6-luna');assert.equal(request.store,false);assert.equal(request.input[0].content[1].type,'input_image');assert(request.instructions.includes('Never identify a person from a face'));
});
test('uncertain OCR results remain empty; missing or extra photo answers are rejected', () => {
  assert.deepEqual(artworkAuthorNames('{"names":["가상 작가",""]}',2),['가상 작가','']);
  for(const text of ['{"names":["one"]}','{"names":[1,2]}','not-json'])assert.throws(()=>artworkAuthorNames(text,2));
});
