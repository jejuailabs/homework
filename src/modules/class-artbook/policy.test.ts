import assert from 'node:assert/strict';
import { bookOptions, bookSelection, clampLines, ClassBookInputError, fileName, pagePlan, planOutputs, sections, whoLabel } from './policy';
import { centralDirectory, crc32, entryEnd, localHeader } from './zip';
import { STUDENT_VOLUME_SIZE, VOLUME_SIZE, type BookItem, type ClassBookOptions } from './types';

const item = (n: number, over: Partial<BookItem> = {}): BookItem => ({
  key: `r1:a${n}`, roomId: 'r1', artworkId: 'a' + n, roomTitle: '봄 그림전', title: '작품 ' + n, description: '', feedback: '', date: '2026-04-0' + (1 + n % 9),
  studentId: 's' + (n % 3), studentName: ['하늘', '도윤', '서아'][n % 3], studentNumber: 1 + n % 3, artistName: '', sourcePath: 'p/' + n, version: 'v', width: 800, height: 600, origin: 'exhibition', ref: '', ...over,
});
const base: ClassBookOptions = {mode: 'class', title: '우리 반 작품집', cover: 'sage', order: 'student', perPage: 2, names: 'name', story: true, feedback: false, unlinked: true, format: 'a4', dedication: ''};

// Options and selection
assert.deepEqual(bookOptions({mode: 'class', cover: 'sky'}), {...base, cover: 'sky', unlinked: false});
assert.equal(bookOptions({mode: 'students', cover: 'peach', title: ' 3학년 2반 ', perPage: 4}).title, '3학년 2반');
for (const bad of [null, {}, {mode: 'x', cover: 'sage'}, {mode: 'class', cover: 'red'}, {mode: 'class', cover: 'sage', perPage: 3}, {mode: 'class', cover: 'sage', title: 'a'.repeat(81)}, {mode: 'class', cover: 'sage', order: 'x'}])
  assert.throws(() => bookOptions(bad), ClassBookInputError);
assert.deepEqual(bookSelection({roomIds: ['r1'], from: '2026-03-01', to: '2026-12-31', exclude: ['r1:a1', 'r1:a1']}), {roomIds: ['r1'], studentIds: [], from: '2026-03-01', to: '2026-12-31', exclude: ['r1:a1'], homework: false, board: false});
assert.deepEqual(bookSelection({roomIds: [], homework: true}).homework, true);
assert.equal(bookOptions({mode: 'students', cover: 'sky', format: 'mobile'}).format, 'mobile');
for (const bad of [{roomIds: []}, {roomIds: ['r1', 'r1']}, {roomIds: ['../x']}, {roomIds: ['r1'], from: '2026-13-01'}, {roomIds: ['r1'], from: '2026-05-01', to: '2026-04-01'}, {roomIds: ['r1'], exclude: ['nokey']}, {roomIds: ['r1'], studentIds: 'all'}])
  assert.throws(() => bookSelection(bad), ClassBookInputError);

// Names
assert.equal(whoLabel(item(0), 'name'), '1번 하늘');
assert.equal(whoLabel(item(0), 'number'), '1번');
assert.equal(whoLabel(item(0), 'hidden'), '');
assert.equal(whoLabel(item(0, {studentId: '', artistName: '모둠 작품'}), 'name'), '모둠 작품');
assert.equal(whoLabel(item(0, {studentId: '', artistName: '모둠 작품'}), 'number'), '');
assert.equal(fileName('3학년/2반: 봄?', 'x'), '3학년 2반 봄');
assert.equal(fileName('...', '학생'), '학생');

// Class book: one file, students in number order, unlinked works last
const mixed = [item(0), item(1), item(2), item(3), item(4, {studentId: '', studentName: '', studentNumber: 0, artistName: '모둠'})];
const one = planOutputs(mixed, base);
assert.equal(one.length, 1);
assert.equal(one[0].file, '우리 반 작품집.pdf');
assert.deepEqual(one[0].indexes.map(i => mixed[i].studentNumber), [1, 1, 2, 3, 0]);
const parts = sections(mixed, one[0].indexes, base);
assert.deepEqual(parts.map(s => [s.heading, s.sub]), [['1번 하늘', '작품 2점'], ['2번 도윤', '작품 1점'], ['3번 서아', '작품 1점'], ['함께 만든 작품', '작품 1점']]);
assert.deepEqual(sections(mixed, one[0].indexes, {...base, names: 'hidden'}).map(s => s.heading), ['작가 1', '작가 2', '작가 3', '함께 만든 작품']);
assert.deepEqual(sections(mixed, planOutputs(mixed, {...base, order: 'room'})[0].indexes, {...base, order: 'room'}).map(s => s.heading), ['봄 그림전']);
assert.deepEqual(sections(mixed, planOutputs(mixed, {...base, order: 'date'})[0].indexes, {...base, order: 'date'}).map(s => s.heading), ['2026년 4월']);

// Volumes: every work appears exactly once across the files
const many = Array.from({length: VOLUME_SIZE * 2 + 5}, (_, n) => item(n));
const volumes = planOutputs(many, base);
assert.deepEqual(volumes.map(v => [v.file, v.indexes.length, v.volume, v.volumes]), [['우리 반 작품집-1권.pdf', VOLUME_SIZE, 1, 3], ['우리 반 작품집-2권.pdf', VOLUME_SIZE, 2, 3], ['우리 반 작품집-3권.pdf', 5, 3, 3]]);
assert.deepEqual(volumes.flatMap(v => v.indexes).sort((a, b) => a - b), many.map((_, i) => i));

// Student books: unlinked works never leak into a student's book, names stay distinct
const students = planOutputs(mixed, {...base, mode: 'students'});
assert.deepEqual(students.map(o => [o.file, o.displayName, o.indexes.length]), [['01-하늘.pdf', '하늘', 2], ['02-도윤.pdf', '도윤', 1], ['03-서아.pdf', '서아', 1]]);
assert.ok(students.every(o => o.indexes.every(i => mixed[i].studentId === o.studentId)));
const twins = planOutputs([item(0, {studentId: 'a', studentNumber: 0, studentName: '민서'}), item(1, {studentId: 'b', studentNumber: 0, studentName: '민서'})], {...base, mode: 'students'});
assert.deepEqual(twins.map(o => o.file), ['민서.pdf', '민서(2).pdf']);
const prolific = planOutputs(Array.from({length: STUDENT_VOLUME_SIZE + 1}, (_, n) => item(n, {studentId: 's0', studentName: '하늘', studentNumber: 1})), {...base, mode: 'students'});
assert.deepEqual(prolific.map(o => [o.file, o.indexes.length]), [['01-하늘-1권.pdf', STUDENT_VOLUME_SIZE], ['01-하늘-2권.pdf', 1]]);
assert.deepEqual(planOutputs([item(0, {studentId: ''})], {...base, mode: 'students'}), []);

// Page plan and clamping
assert.deepEqual(pagePlan([2, 1, 5], 2, 26), {contents: 1, starts: [3, 4, 5], pages: 8});
assert.deepEqual(pagePlan(Array(27).fill(1), 4, 26).contents, 2);
assert.deepEqual(clampLines(['가', '나', '다라마'], 2), ['가', '나…']);
assert.deepEqual(clampLines(['가'], 2), ['가']);

// ZIP: the pieces must describe each other exactly
const data = new TextEncoder().encode('hello'), first = {name: '01-하늘.pdf', crc: crc32(data), size: data.length, offset: 0, time: 0, date: 33};
assert.equal(crc32(data), 0x3610a686);
const header = localHeader(first), nameBytes = new TextEncoder().encode(first.name).length;
assert.equal(header.length, 30 + nameBytes);
assert.equal(new DataView(header.buffer).getUint32(0, true), 0x04034b50);
assert.equal(new DataView(header.buffer).getUint16(6, true) & 0x0800, 0x0800);
assert.equal(entryEnd(first), 30 + nameBytes + 5);
const second = {...first, name: 'b.pdf', offset: entryEnd(first)}, directory = centralDirectory([first, second], entryEnd(second)), view = new DataView(directory.buffer);
const eocd = directory.length - 22;
assert.equal(view.getUint32(eocd, true), 0x06054b50);
assert.equal(view.getUint16(eocd + 10, true), 2);
assert.equal(view.getUint32(eocd + 12, true), eocd);
assert.equal(view.getUint32(eocd + 16, true), entryEnd(second));
assert.equal(view.getUint32(42, true), 0);
console.log('class-artbook policy tests passed');
