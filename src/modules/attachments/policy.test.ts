import assert from 'node:assert/strict';
import {
  AUDIO_BYTES, FILE_BYTES, assertContent, attachmentInput, attachmentMarker, gridsText, inlineForBerry, kindOfName, lessonDraft, sniff, tidy, timetableDraft,
} from './policy';

// Kinds come from the extension; the size limit depends on the kind (recordings get 30MB, everything else 10MB).
assert.equal(kindOfName('시간표.JPG'), 'image');
assert.equal(kindOfName('3월 시간표.hwp'), 'hwp');
assert.equal(kindOfName('수업메모-101500.webm'), 'audio');
assert.equal(kindOfName('virus.exe'), null);
assert.deepEqual(attachmentInput({name: ' 시간표.hwpx ', size: 1200}), {name: '시간표.hwpx', kind: 'hwpx', size: 1200});
assert.equal(kindOfName('계획서.docx'), 'file', 'other documents are kept as originals');
assert.equal(attachmentInput({name: 'a.zip', size: 10}).kind, 'file');
assert.throws(() => attachmentInput({name: 'a.zip', size: 50 * 1024 * 1024 + 1}), /50MB/);
assert.throws(() => attachmentInput({name: 'run.bat', size: 10}), /올릴 수 없어요/);
assert.throws(() => attachmentInput({name: '확장자없음', size: 10}), /올릴 수 없어요/);
assert.throws(() => attachmentInput({name: 'a.pdf', size: 0}), /빈 파일/);
assert.throws(() => attachmentInput({name: 'a.pdf', size: FILE_BYTES + 1}), /10MB/);
assert.equal(attachmentInput({name: 'memo.m4a', size: AUDIO_BYTES}).kind, 'audio', 'a 30MB recording is allowed');
assert.throws(() => attachmentInput({name: 'memo.m4a', size: AUDIO_BYTES + 1}), /30MB/);
assert.equal(attachmentInput({name: '..\..\etc/passwd.txt', size: 5}).name.includes('/'), false, 'path separators never reach a file name');

// The bytes must be what the extension says.
const bytes = (...head: number[]) => Uint8Array.from([...head, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
assert.equal(sniff(bytes(0xff, 0xd8, 0xff)), 'jpeg');
assert.equal(sniff(bytes(0x25, 0x50, 0x44, 0x46)), 'pdf');
assert.equal(sniff(bytes(0xd0, 0xcf, 0x11, 0xe0)), 'cfb');
assert.doesNotThrow(() => assertContent('hwp', bytes(0xd0, 0xcf, 0x11, 0xe0)));
assert.throws(() => assertContent('image', bytes(0x25, 0x50, 0x44, 0x46)), /확장자와 달라요/);
assert.doesNotThrow(() => assertContent('text', bytes(0x41)), 'text and audio are not sniffed');

// Tables become tab-separated rows; several tables carry their names.
assert.equal(gridsText([{name: '표 1', rows: [['', '월', '화'], ['1', '국어 ', ' 수학'], ['', '', '']]}]), '\t월\t화\n1\t국어\t수학');
assert.equal(gridsText([{name: 'A', rows: [['x']]}, {name: 'B', rows: [['y']]}]), '[A]\nx\n\n[B]\ny');
assert.equal(tidy('a\r\nb\u0000\n\n\n\n\nc  '), 'a\nb\n\n\nc');

// What rides along with a Berry message: an even share per file, with a flag when there is more to read.
const inline = inlineForBerry([{id: 'a1', name: '공문.pdf', kind: 'pdf', text: '가'.repeat(5000)}, {id: 'b2', name: '표.xlsx', kind: 'xlsx', text: '짧음'}], 4000);
assert.equal(inline[0].text.length, 2000);
assert.deepEqual([inline[0].truncated, inline[0].total_chars, inline[1].truncated, inline[1].kind], [true, 5000, false, '엑셀']);
assert.equal(attachmentMarker([{id: 'a1', name: '공문.pdf'}]), '[첨부: 공문.pdf · a1]');

// Model answers are trimmed to what the screens can hold; nothing outside the grid or without a subject survives.
const table = timetableDraft({slots: [{day: 1, period: 1, subject: ' 국어 ', room: null}, {day: 1, period: 1, subject: '수학'}, {day: 6, period: 1, subject: '체육'}, {day: 2, period: 8, subject: '음악'}, {day: 2, period: 3, subject: '과학', room: '과학실'}, {day: 3, period: 1, subject: ''}], unsure: [{day: 4, period: 2}, {day: 9, period: 9}], note: '목요일 2교시를 확인해 주세요.'});
assert.deepEqual(table.slots, [{day: 1, period: 1, subject: '국어'}, {day: 2, period: 3, subject: '과학', room: '과학실'}]);
assert.deepEqual(table.unsure, [{day: 4, period: 2}]);
assert.deepEqual(timetableDraft('garbage'), {slots: [], unsure: [], note: ''});
const log = lessonDraft({entries: [{period: 3, subject: '국어', unit: '2단원', note: '비유 표현'}, {period: null, subject: '수학', unit: null, note: ''}, {period: 2, subject: '', note: 'x'}, {period: 99, subject: '체육', note: '피구'}]});
assert.deepEqual(log.entries, [{period: 3, subject: '국어', unit: '2단원', note: '비유 표현'}, {subject: '수학', note: ''}, {subject: '체육', note: '피구'}]);
assert.equal(lessonDraft({entries: Array.from({length: 20}, () => ({subject: '국어', note: ''}))}).entries.length, 12);
console.log('attachments policy tests passed');
