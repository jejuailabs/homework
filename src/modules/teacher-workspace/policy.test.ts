import assert from 'node:assert/strict';
import {addDays, assertFolderPlacement, calendarInput, calendarWindow, eventDates, eventSummary, folderInput, importPreview, isoDate, itemInput, itemMatches, ledger, lessonEntries, mergeLessonEntries, overlaps, parseCalendarCsv, parseCsv, parseIcs, parseInstant, parseLessonLine, parseTimetableText, rangeInput, safeFileName, seoulDate, tagsInput, timetableSlots, toCsv, weekDates, weekKeyOf, workspaceAllowed, workspaceFileInput, workspaceFileMime, zonedToUtc, MAX_IMPORT} from './policy';

// Dates: Asia/Seoul is UTC+9 all year.
assert.equal(isoDate('2026-11-05'), '2026-11-05');
assert.throws(() => isoDate('2026-02-30'));
assert.equal(addDays('2026-12-31', 1), '2027-01-01');
assert.equal(seoulDate('2026-11-04T15:00:00.000Z'), '2026-11-05', 'Seoul midnight belongs to the next UTC day');
assert.throws(() => rangeInput('2026-11-05', '2026-11-04'));
assert.throws(() => rangeInput('2025-01-01', '2026-11-04'), /400일/);
assert.deepEqual(parseInstant('2026-11-05 09:30'), {ms: Date.parse('2026-11-05T00:30:00Z'), dateOnly: false, date: '2026-11-05'});
assert.equal(parseInstant('2026-11-05T09:30').ms, Date.parse('2026-11-05T09:30:00+09:00'));
assert.equal(parseInstant('2026-11-05T00:30:00Z').date, '2026-11-05');
assert.equal(parseInstant('2026-11-05').dateOnly, true);
assert.throws(() => parseInstant('2026-11-05 24:00'));
assert.throws(() => parseInstant('11/05/2026'));

// Calendar events
const timed = calendarInput({title: ' 학년 회의 ', start: '2026-11-05 15:00', end: '2026-11-05 16:30', kind: 'meeting'});
assert.deepEqual(timed, {title: '학년 회의', start: '2026-11-05T06:00:00.000Z', end: '2026-11-05T07:30:00.000Z', allDay: false, kind: 'meeting', classId: null});
assert.equal(calendarInput({title: '수업', start: '2026-11-05 09:00'}).end, '2026-11-05T01:00:00.000Z', 'a timed event without an end lasts an hour');
const trip = calendarInput({title: '수학여행', start: '2026-11-05', end: '2026-11-07', classId: 'c1'});
assert.equal(trip.allDay, true);
assert.equal(trip.start, '2026-11-04T15:00:00.000Z');
assert.equal(trip.end, '2026-11-07T15:00:00.000Z', 'all-day end is the Seoul midnight after the last day');
assert.deepEqual(eventDates(trip.start, trip.end, true), {startDate: '2026-11-05', endDate: '2026-11-07'});
assert.deepEqual(eventDates(timed.start, timed.end, false), {startDate: '2026-11-05', endDate: '2026-11-05'});
assert.equal(calendarInput({title: '하루', start: '2026-11-05'}).kind, 'school', 'kind defaults to school');
assert.throws(() => calendarInput({title: 'x', start: '2026-11-05', end: '2026-11-04'}), /앞서/);
assert.throws(() => calendarInput({title: 'x', start: '2026-11-05 10:00', end: '2026-11-05 09:00'}), /앞서/);
assert.throws(() => calendarInput({title: 'x', start: '2026-01-01', end: '2026-06-01'}), /92일/);
assert.throws(() => calendarInput({title: 'x', start: '2026-11-05', kind: 'secret'}), /종류/);
assert.throws(() => calendarInput({title: 'x'.repeat(121), start: '2026-11-05'}), /120자/);
assert.throws(() => calendarInput({title: 'x', start: '2026-11-05', classId: '../c'}), /학급/);
const window = calendarWindow('2026-11-01', '2026-11-30');
assert.equal(window.fromMs, Date.parse('2026-10-31T15:00:00Z'));
assert.equal(window.toMs, Date.parse('2026-11-30T15:00:00Z'));
assert.equal(overlaps(trip.start, trip.end, window.fromMs, window.toMs), true);
assert.equal(overlaps('2026-10-30T15:00:00.000Z', '2026-10-31T15:00:00.000Z', window.fromMs, window.toMs), false, 'ends exactly at the window start');
assert.equal(overlaps('2026-10-25T15:00:00.000Z', '2026-11-02T15:00:00.000Z', window.fromMs, window.toMs), true, 'started before the window, still running');
assert.equal(overlaps('2026-11-03T06:00:00.000Z', '2026-11-03T06:00:00.000Z', window.fromMs, window.toMs), true, 'a point deadline inside the window');

// ISO weeks
assert.equal(weekKeyOf('2026-11-02'), '2026-W45');
assert.equal(weekKeyOf('2027-01-01'), '2026-W53', '2026 has 53 ISO weeks');
assert.equal(weekKeyOf('2025-12-29'), '2026-W01');
assert.deepEqual(weekDates('2026-W45').slice(0, 5), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
assert.throws(() => weekDates('2025-W53'), /없는 주차/);
assert.throws(() => weekDates('2026-45'));

// Timetable paste
const pasted = parseTimetableText('\t월\t화\t수\t목\t금\n1교시\t국어\t수학\t\t영어\t체육\n2교시\t과학(과학실)\t\t음악\t\t\n7\t창체\t\t\t\t');
assert.deepEqual(pasted.slice(0, 3), [{day: 1, period: 1, subject: '국어'}, {day: 1, period: 2, subject: '과학', room: '과학실'}, {day: 1, period: 7, subject: '창체'}]);
assert.equal(pasted.length, 7);
assert.deepEqual(parseTimetableText('국어,수학\n,영어'), [{day: 1, period: 1, subject: '국어'}, {day: 2, period: 1, subject: '수학'}, {day: 2, period: 2, subject: '영어'}], 'comma rows without labels are periods 1, 2, …');
assert.throws(() => parseTimetableText('a\tb\tc\td\te\tf\tg'), /5칸/);
assert.throws(() => parseTimetableText(Array.from({length: 8}, () => '국어').join('\n')), /7교시/);
assert.throws(() => timetableSlots([{day: 1, period: 1, subject: '국어'}, {day: 1, period: 1, subject: '수학'}]), /같은 칸/);
assert.throws(() => timetableSlots([{day: 6, period: 1, subject: '국어'}]));

// Lesson log
assert.deepEqual(parseLessonLine('3교시 국어 [2단원] 비유 표현 찾기'), {period: 3, subject: '국어', unit: '2단원', note: '비유 표현 찾기'});
assert.deepEqual(parseLessonLine('수학: 분수의 덧셈 복습'), {subject: '수학', note: '분수의 덧셈 복습'});
assert.deepEqual(parseLessonLine('5 체육 피구'), {period: 5, subject: '체육', note: '피구'});
assert.throws(() => lessonEntries([{subject: '국어', note: 'x'.repeat(501)}]), /500자/);
assert.throws(() => lessonEntries(Array.from({length: 13}, () => ({subject: '국어'}))), /12줄/);
let n = 0;
const merged = mergeLessonEntries([{id: 'a', subject: '국어', note: '', source: 'chat', pending: true}], [{id: 'a', subject: '국어', note: '수정'}, {subject: '수학', note: ''}, {id: 'forged', subject: '과학', note: ''}], () => `new${++n}`);
assert.deepEqual(merged.map(entry => [entry.id, entry.source, entry.pending]), [['a', 'chat', true], ['new1', 'form', false], ['new2', 'form', false]], 'a form save keeps the server pending flag and cannot invent ids');

// Folders
assert.deepEqual(folderInput({name: ' 2학기 평가 ', kind: 'assessment'}), {name: '2학기 평가', kind: 'assessment', parentId: null});
assert.throws(() => folderInput({name: 'x', kind: 'secret'}));
const tree = [{id: 'a', parentId: null}, {id: 'b', parentId: 'a'}, {id: 'c', parentId: 'b'}, {id: 'd', parentId: 'c'}, {id: 'e', parentId: null}, {id: 'f', parentId: 'e'}];
assert.doesNotThrow(() => assertFolderPlacement(tree, null, 'c'), 'fourth level is allowed');
assert.throws(() => assertFolderPlacement(tree, null, 'd'), /4단계/);
assert.throws(() => assertFolderPlacement(tree, 'a', 'c'), /자기 안/);
assert.throws(() => assertFolderPlacement(tree, 'b', 'f'), /4단계/, 'a moved folder brings its levels along');
assert.doesNotThrow(() => assertFolderPlacement(tree, 'b', 'e'));
assert.doesNotThrow(() => assertFolderPlacement(tree, 'c', 'e'));
assert.throws(() => assertFolderPlacement(tree, null, 'zz'), /찾을 수 없/);

// Items
const item = itemInput({folderId: 'f1', type: 'checklist', title: '학부모 상담 주간 준비', body: '안내문\r\n발송', tags: ['#상담', '상담', ' 학부모 '], checklist: [{text: '안내문', done: true}, {text: '시간표'}], dueAt: '2026-11-10'});
assert.deepEqual([item.tags, item.checklist, item.body, item.sensitivity], [['상담', '학부모'], [{text: '안내문', done: true}, {text: '시간표', done: false}], '안내문\n발송', 'normal']);
assert.equal(itemInput({folderId: 'f1', title: 'x', sensitive: true}).sensitivity, 'sensitive');
assert.equal(itemInput({folderId: 'f1', type: 'link', title: '교육청', url: 'https://www.jje.go.kr'}).url, 'https://www.jje.go.kr/');
assert.throws(() => itemInput({folderId: 'f1', type: 'link', title: 'x', url: 'javascript:alert(1)'}), /링크/);
assert.throws(() => itemInput({folderId: 'f1', type: 'link', title: 'x'}), /링크/);
assert.throws(() => itemInput({folderId: 'f1', title: 'x', body: 'x'.repeat(8001)}), /8000자/);
assert.throws(() => itemInput({folderId: 'f1', title: 'x', students: [{classId: 'c', studentId: 's/1'}]}));
assert.throws(() => tagsInput(Array.from({length: 11}, (_, i) => `t${i}`)));
const summary = {id: 'i1', folderId: 'f1', type: 'note' as const, title: '평가 계획', dueAt: '2026-11-10', tags: ['수행평가'], classId: null, sensitivity: 'normal' as const, source: 'form' as const, pending: false, hasFile: false, updatedAt: ''};
assert.equal(itemMatches(summary, {q: '수행'}), true, 'tags are searched');
assert.equal(itemMatches(summary, {q: '본문'}), false, 'bodies are not searched');
assert.equal(itemMatches(summary, {dueBefore: '2026-11-09'}), false);
assert.equal(itemMatches(summary, {dueBefore: '2026-11-10'}), true);
assert.equal(itemMatches(summary, {folderKind: 'assessment', folderKinds: new Map([['f1', 'assessment']])}), true);

// Files and storage ledger
assert.equal(workspaceFileMime({type: '', name: '공문.HWP'}), 'application/x-hwp');
assert.equal(workspaceFileMime({type: 'application/pdf', name: 'a.bin'}), 'application/pdf');
assert.deepEqual(workspaceFileInput({fileName: 'a/b.pdf', contentType: 'application/pdf', size: 10}), {fileName: 'a_b.pdf', contentType: 'application/pdf', size: 10});
assert.throws(() => workspaceFileInput({fileName: 'a.html', contentType: 'text/html', size: 10}), /올릴 수 있어요/);
assert.throws(() => workspaceFileInput({fileName: 'a.pdf', contentType: 'application/pdf', size: 50 * 1024 * 1024 + 1}), /50MB/);
assert.deepEqual(ledger({storageBytes: -5, reservedBytes: 'x'}), {storageBytes: 0, reservedBytes: 0});
assert.deepEqual(ledger({storageBytes: 300, reservedBytes: 20}), {storageBytes: 300, reservedBytes: 20});
assert.equal(safeFileName('../a:b?.pdf'), '__a_b_.pdf');

// ICS import
const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:one@school', 'SUMMARY:2학기 중간\\, 고사', 'DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261107', 'BEGIN:VALARM', 'SUMMARY:alarm', 'END:VALARM', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:two', 'SUMMARY:교직원 회', ' 의', 'DTSTART;TZID=Asia/Seoul:20261105T150000', 'DTEND;TZID=Asia/Seoul:20261105T160000', 'RRULE:FREQ=WEEKLY', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:three', 'SUMMARY:UTC', 'DTSTART:20261105T000000Z', 'DURATION:PT90M', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:four', 'SUMMARY:취소', 'STATUS:CANCELLED', 'DTSTART:20261105T000000Z', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:five', 'SUMMARY:깨짐', 'DTSTART:2026-11-05', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
const parsedIcs = parseIcs(ics);
assert.deepEqual(parsedIcs.rows.map(row => [row.title, row.start, row.end, row.allDay]), [
  ['2학기 중간, 고사', '2026-11-05', '2026-11-06', true],
  ['교직원 회의', '2026-11-05T06:00:00.000Z', '2026-11-05T07:00:00.000Z', false],
  ['UTC', '2026-11-05T00:00:00.000Z', '2026-11-05T01:30:00.000Z', false],
], 'folded lines, escapes, exclusive all-day ends, TZID, DURATION; cancelled skipped; alarms ignored');
assert.deepEqual(parsedIcs.warnings, ['반복 일정은 첫 번째 일정만 가져왔어요.']);
assert.equal(parsedIcs.errors.length, 1, 'a malformed event is reported, not fatal');
assert.equal(zonedToUtc([2026, 7, 1, 9, 0, 0], 'America/New_York'), Date.parse('2026-07-01T13:00:00Z'), 'daylight saving zones convert');
assert.equal(zonedToUtc([2026, 11, 5, 9, 0, 0], 'Korea Standard Time'), Date.parse('2026-11-05T00:00:00Z'), 'Outlook zone names');

// CSV import
assert.deepEqual(parseCsv('﻿"a,b","c""d"\r\n\r\ne,f\n'), [['a,b', 'c"d'], ['e', 'f']]);
const csv = parseCalendarCsv('제목,시작,끝,종류\n체육대회,2026-11-12,,학교\n학년 회의,2026-11-05 15:00,2026-11-05 16:00,회의\n이상,2026-11-05,,파티');
assert.deepEqual(csv.rows.map(row => [row.title, row.allDay, row.kind]), [['체육대회', true, 'school'], ['학년 회의', false, 'meeting']]);
assert.equal(csv.errors[0].line, 4);
const preview = importPreview('csv', '체육대회,2026-11-12\n체육대회,2026-11-12\n날짜 오류,2026-13-01');
assert.equal(preview.events.length, 1, 'duplicate rows collapse to one import id');
assert.match(preview.events[0].importId, /^imp_[0-9a-f]{28}$/);
assert.equal(preview.errors.length, 1);
assert.equal(importPreview('csv', '체육대회,2026-11-12').hash, preview.hash, 'the preview hash depends only on the events');
assert.equal(importPreview('ics', ics).events.find(event => event.title === 'UTC')!.importId, importPreview('ics', ics.replace('SUMMARY:UTC', 'SUMMARY:UTC2')).events.find(event => event.title === 'UTC2')!.importId, 'ICS UID keeps a re-import on the same document');
assert.throws(() => importPreview('csv', Array.from({length: MAX_IMPORT + 1}, (_, i) => `일정${i},2026-11-12`).join('\n')), /500건/);
assert.throws(() => importPreview('xlsx', 'x'));

// Export and event log
const exported = toCsv([['제목', '메모'], ['=HYPERLINK("x")', '"따옴표"']]);
assert.ok(exported.startsWith('﻿'));
assert.ok(exported.includes(`"'=HYPERLINK(""x"")"`), 'formulas are neutralized');
assert.equal(eventSummary('item.created'), '업무 항목 추가 1건');
assert.equal(eventSummary('calendar.imported', 20), '일정 가져오기 20건');
assert.equal(workspaceAllowed('teacher'), true);
assert.equal(workspaceAllowed('student'), false);
assert.equal(workspaceAllowed('admin', 'true'), false, 'kill switch wins');
console.log('teacher workspace policy tests passed');
