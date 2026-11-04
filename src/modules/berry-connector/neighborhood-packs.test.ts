import assert from 'node:assert/strict';
import {filterPacks, packDay, packDetail, packSummary} from './neighborhood-packs';

const place = (id: string, name: string, extra: Record<string, unknown> = {}) => ({id, name, category: '공공기관', lat: 33.5, lon: 126.5, sourceUrl: '', note: '', selected: true, verified: false, ...extra});
const map = {center: {lat: 33.5, lon: 126.5, radius: 800}, lines: [{id: 'r1', kind: 'road', name: '중앙로', points: [[126.5, 33.5], [126.51, 33.51]]}], source: 'vworld', attribution: '브이월드 공간정보 오픈플랫폼(국토교통부)', sourceUrl: 'https://www.vworld.kr', sourceDate: '2026-10-20T01:00:00.000Z', retrievedAt: '2026-10-20T01:00:00.000Z',
  places: [place('school', '제주초등학교', {kind: 'school'}), place('spot-1', '제주시청', {kind: 'office', note: '김민준이 다녀온 곳', verified: true}), place('spot-2', '동문시장', {kind: 'market', selected: false}), place('spot-3', '이름 모를 곳', {kind: 'spaceship'})]};
const pack = {title: '김민준네 동네 탐험', region: '제주시 이도동', grade: '3학년', unit: '우리 고장의 모습', classId: 'c1', createdAt: '2026-10-31T16:30:00.000Z', brief: '브리핑 '.repeat(200), teacherNotes: '교사 메모', sources: [{title: '제주시청 누리집', url: 'https://www.jejusi.go.kr'}], referenceDate: '2026-10-20', sketch: {title: '우리 학교 둘레', mainRoads: ['중앙로'], labels: {school: '학교'}}, mapJson: JSON.stringify(map), contentHash: 'h', ownerUid: 't1'};
const docs = [
  {id: 'p1', data: pack},
  {id: 'p2', data: {title: '서귀포 견학', region: '서귀포시', unit: '', classId: 'c2', createdAt: '2026-09-02T00:00:00.000Z'}},
  {id: 'p3', data: {title: '학급 없는 자료', region: '제주시 이도동', unit: '고장', classId: '', createdAt: '2026-11-03T00:00:00.000Z'}},
];

assert.equal(packDay('2026-02', true), '2026-02-28', 'a month widens to its last day');
assert.equal(packDay('2026-10'), '2026-10-01');
assert.equal(packDay('지난달'), '', 'loose words are ignored, not guessed');

// Same filters as the saved list: class, Seoul-day range and words over title·region·unit.
assert.deepEqual(filterPacks(docs, {}).map(doc => doc.id), ['p1', 'p2', 'p3']);
assert.deepEqual(filterPacks(docs, {classId: 'c1'}).map(doc => doc.id), ['p1']);
assert.deepEqual(filterPacks(docs, {from: '2026-11', to: '2026-11'}).map(doc => doc.id), ['p1', 'p3'], 'saved 16:30 UTC on Oct 31 is Nov 1 in Seoul');
assert.deepEqual(filterPacks(docs, {to: '2026-09-30'}).map(doc => doc.id), ['p2']);
assert.deepEqual(filterPacks(docs, {q: '이도동 고장'}).map(doc => doc.id), ['p1', 'p3'], 'every word must match somewhere');

const mask = (text: string) => text.split('김민준').join('학생 03');
const row = packSummary(docs[0], '3학년 2반', mask);
assert.equal(row.title, '학생 03네 동네 탐험', 'a child named in a title is masked');
assert.equal(row.created_on, '2026-11-01');
assert.equal(row.class, '3학년 2반');
assert.equal(row.has_sketch, true);
assert.equal(row.link, '/teacher/tools/neighborhood');
assert.equal(packSummary(docs[2], null).has_sketch, false);

const detail = packDetail(docs[0], '3학년 2반', mask);
assert.deepEqual(detail.selected_places.map(item => item.name), ['제주초등학교', '제주시청', '이름 모를 곳'], 'only selected places');
assert.deepEqual(detail.selected_places[1], {name: '제주시청', kind: 'office', kind_label: '시청·주민센터', category: '공공기관', note: '학생 03이 다녀온 곳', verified: true});
assert.equal(detail.selected_places[2].kind, null, 'unknown kinds are dropped, not passed on');
assert.deepEqual(detail.sketch, {title: '우리 학교 둘레', main_roads: ['중앙로']});
assert.deepEqual(detail.sources, [{title: '제주시청 누리집', url: 'https://www.jejusi.go.kr'}]);
assert.deepEqual(detail.map_source, {source: 'vworld', attribution: '브이월드 공간정보 오픈플랫폼(국토교통부)', source_date: '2026-10-20T01:00:00.000Z'});
assert.equal(detail.brief_preview.length, 400, 'the briefing is only a preview');
const sent = JSON.stringify(detail);
for (const key of ['lat', 'lon', 'center', 'points', 'lines', 'mapJson', 'teacherNotes', 'contentHash', 'ownerUid', 'labels']) assert.ok(!sent.includes(`"${key}":`), `${key} never leaves`);
assert.ok(!sent.includes('김민준') && !sent.includes('교사 메모'), 'no real name, no teacher notes');

const bare = packDetail({id: 'p9', data: {title: '빈 자료', mapJson: '{broken', createdAt: 'x'}}, null);
assert.deepEqual([bare.selected_places, bare.sources, bare.map_source, bare.sketch, bare.created_on], [[], [], null, null, ''], 'broken or missing parts read as empty');
console.log('neighborhood pack tests ok');
