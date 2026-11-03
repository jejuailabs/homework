import assert from 'node:assert/strict';
import test from 'node:test';
import {archiveDay, autoTags, csv, effectiveTags, filterArchive, normalizeTag, normalizeTags, tagCounts, type ArchiveRow} from './exhibition-tags';

test('hashtags drop #, spaces and symbols and stay short and unique', () => {
  assert.equal(normalizeTag('#봄 꽃!'), '봄꽃');
  assert.equal(normalizeTag('Spring'), 'spring');
  assert.equal(normalizeTag('가나다라마바사아자차카타파하가나다라마바사'), '가나다라마바사아자차카타파하가나다라마바');
  assert.deepEqual(normalizeTags(['#봄', '봄', '', '!!', ...Array.from({length: 20}, (_, i) => `t${i}`)]).length, 10);
  assert.deepEqual(normalizeTags('봄'), []);
});

test('automatic tags take topic words, subject, season, month, grade and homework source', () => {
  const tags = autoTags({title: '봄꽃을 그려요', description: '우리 학교 화단의 봄꽃 관찰', grade: '3', createdAt: '2026-04-10T01:00:00Z', linkedAssignmentId: 'a1'});
  assert(tags.includes('봄꽃'));
  assert(!tags.includes('그려요'));
  assert(tags.includes('화단'));
  for (const tag of ['미술', '봄', '4월', '3학년', '숙제']) assert(tags.includes(tag), tag);
  assert(!tags.includes('우리'));
  assert(autoTags({title: '가을 사과 고양이를'}).includes('가을'));
  assert(autoTags({title: '가을 사과 고양이를'}).includes('사과'));
  assert(autoTags({title: '가을 사과 고양이를'}).includes('고양이'));
  assert.deepEqual(autoTags({title: '바다'}), ['바다']);
  // A title with enough words leaves the description's sentence words out.
  assert(!autoTags({title: '가을 낙엽 콜라주', description: '낙엽을 모아 만든 작품'}).includes('만든'));
  // Seoul date decides the month: 31 March 16:00 UTC is already 1 April.
  assert(autoTags({title: 'x', createdAt: '2026-03-31T16:00:00Z'}).includes('4월'));
  assert.deepEqual(effectiveTags({tags: ['직접'], title: '봄꽃'}), ['직접']);
  assert(effectiveTags({title: '봄꽃'}).includes('봄꽃'));
});

const row = (patch: Partial<ArchiveRow>): ArchiveRow => ({id: 'x', title: '', description: '', classId: 'c1', className: '3-1', status: 'open', tags: [], createdAt: '2026-04-10T01:00:00Z', source: 'direct', artworkCount: 0, approvedCount: 0, ...patch});

test('one filter serves the menu and Berry: words, tags, months, class and source', () => {
  const rows = [
    row({id: 'a', title: '봄꽃 그리기', tags: ['봄꽃', '미술', '봄'], createdAt: '2026-04-02T00:00:00Z'}),
    row({id: 'b', title: '여름 바다', tags: ['바다', '여름'], createdAt: '2026-07-20T00:00:00Z', source: 'homework'}),
    row({id: 'c', title: '봄 소풍', tags: ['소풍', '봄'], createdAt: '2026-05-31T15:30:00Z', classId: 'c2'}),
  ];
  const ids = (filter: Parameters<typeof filterArchive>[1]) => filterArchive(rows, filter).map(item => item.id);
  assert.deepEqual(ids({q: '#봄'}), ['a', 'c']);
  assert.deepEqual(ids({tags: ['봄', '미술']}), ['a']);
  assert.deepEqual(ids({from: '2026-03', to: '2026-05'}), ['a']);
  // 31 May 15:30 UTC is 1 June in Seoul.
  assert.deepEqual(ids({from: '2026-06'}), ['b', 'c']);
  assert.deepEqual(ids({source: 'homework'}), ['b']);
  assert.deepEqual(ids({classId: 'c2'}), ['c']);
  assert.deepEqual(ids({q: '봄 소풍'}), ['c']);
  assert.equal(archiveDay('2024-02', true), '2024-02-29');
  assert.equal(archiveDay('nope'), '');
  assert.deepEqual(tagCounts(rows, 1), [{tag: '봄', count: 2}]);
});

test('archive spreadsheets open in Excel and never run formulas', () => {
  const text = csv([['제목', '설명'], ['=SUM(A1)', '쉼표, "따옴표"']]);
  assert(text.startsWith('﻿'));
  assert(text.includes(`"'=SUM(A1)"`));
  assert(text.includes('"쉼표, ""따옴표"""'));
});
