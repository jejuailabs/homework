import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {TableError, fileKind, gridsOf} from './tables';
import {applyFindings, interpret, kindOf, parseDateRange} from './readers';
import {starterPlan} from './starter';
import {hourStats} from './engine';
import {crc32} from '@/lib/zip-store';

/** 시험용 ZIP: 진짜 엑셀·한글처럼 압축(deflate)해서 만든다. */
function zip(files: Record<string, string>) {
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, body] of Object.entries(files)) {
    const raw = new TextEncoder().encode(body), packed = new Uint8Array(deflateRawSync(raw)), title = new TextEncoder().encode(name), crc = crc32(raw);
    const local = new Uint8Array(30 + title.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(8, 8, true); lv.setUint32(14, crc, true); lv.setUint32(18, packed.length, true); lv.setUint32(22, raw.length, true); lv.setUint16(26, title.length, true); local.set(title, 30);
    const head = new Uint8Array(46 + title.length), hv = new DataView(head.buffer);
    hv.setUint32(0, 0x02014b50, true); hv.setUint16(10, 8, true); hv.setUint32(16, crc, true); hv.setUint32(20, packed.length, true); hv.setUint32(24, raw.length, true); hv.setUint16(28, title.length, true); hv.setUint32(42, offset, true); head.set(title, 46);
    parts.push(local, packed); central.push(head); offset += local.length + packed.length;
  }
  const size = central.reduce((sum, part) => sum + part.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, central.length, true); ev.setUint16(10, central.length, true); ev.setUint32(12, size, true); ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0; for (const part of all) {out.set(part, at); at += part.length;}
  return out;
}
const col = (index: number) => String.fromCharCode(65 + index);
/** 공유 문자열(sharedStrings)을 쓰는 진짜 엑셀 모양. */
function xlsx(sheets: Record<string, (string | number)[][]>) {
  const shared: string[] = [], id = (text: string) => {let at = shared.indexOf(text); if (at < 0) {shared.push(text); at = shared.length - 1;} return at;};
  const names = Object.keys(sheets), files: Record<string, string> = {};
  names.forEach((name, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = `<worksheet><sheetData>${sheets[name].map((row, r) => `<row r="${r + 1}" spans="1:9">${row.map((value, c) => value === '' ? '' : typeof value === 'number' ? `<c r="${col(c)}${r + 1}"><v>${value}</v></c>` : `<c r="${col(c)}${r + 1}" t="s"><v>${id(value)}</v></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  });
  files['xl/workbook.xml'] = `<workbook xmlns:r="r"><sheets>${names.map((name, index) => `<sheet name="${name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`;
  files['xl/_rels/workbook.xml.rels'] = `<Relationships>${names.map((_, index) => `<Relationship Id="rId${index + 1}" Type="x" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`;
  files['xl/sharedStrings.xml'] = `<sst>${shared.map(text => `<si><t>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></si>`).join('')}</sst>`;
  return zip(files);
}
/** 한글(HWPX) 표: 칸 주소(cellAddr)와 병합(cellSpan)을 쓴다. */
function hwpx(tables: {value: string; col: number; row: number; colSpan?: number; rowSpan?: number}[][]) {
  const tbl = (cells: typeof tables[number]) => {
    const rows = [...new Set(cells.map(cell => cell.row))].sort((a, b) => a - b);
    return `<hp:tbl>${rows.map(row => `<hp:tr>${cells.filter(cell => cell.row === row).map(cell => `<hp:tc><hp:subList><hp:p><hp:run><hp:t>${cell.value}</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="${cell.col}" rowAddr="${cell.row}"/><hp:cellSpan colSpan="${cell.colSpan ?? 1}" rowSpan="${cell.rowSpan ?? 1}"/></hp:tc>`).join('')}</hp:tr>`).join('')}</hp:tbl>`;
  };
  return zip({'mimetype': 'application/hwp+zip', 'Contents/content.hpf': '<opf/>', 'Contents/section0.xml': `<hs:sec><hp:p>제목</hp:p>${tables.map(tbl).join('<hp:p/>')}</hs:sec>`});
}

const plan = starterPlan({schoolName: '시험초', className: '3학년 2반', grade: 3, useSampleTimetable: false});

// 1) 편제표(엑셀, 교과가 세로, 학년 아래 1·2학기)
const plannedSheet = xlsx({'편제표': [
  ['2026학년도 교육과정 편제 및 시간 배당'],
  ['구분', '교과', '3학년', '', '4학년', ''],
  ['', '', '1학기', '2학기', '1학기', '2학기'],
  ['교과(군)', '국어', 102, 102, 102, 102],
  ['', '사회', 51, 51, 51, 51],
  ['', '도덕', 17, 17, 17, 17],
  ['', '수학', 68, 68, 68, 68],
  ['', '과학', 51, 51, 51, 51],
  ['', '체육', 51, 51, 51, 51],
  ['', '음악', 34, 34, 34, 34],
  ['', '미술', 34, 34, 34, 34],
  ['', '영어', 34, 34, 34, 34],
  ['창의적 체험활동', '창의적 체험활동', 51, 51, 51, 51],
  ['학교자율시간', '학교자율시간(우리 고장 탐구)', 29, 0, 0, 0],
]});
assert.equal(fileKind('편제표.xlsx', plannedSheet), 'xlsx');
const sheetFindings = interpret(gridsOf('편제표.xlsx', plannedSheet), plan);
const kor = sheetFindings.standards.filter(item => item.subject === 'kor');
assert.deepEqual(kor.map(item => [item.semester, item.hours, item.confidence]), [[1, 102, 'high'], [2, 102, 'high']], '3학년 칸만 읽는다(4학년 칸 아님)');
assert.equal(sheetFindings.standards.find(item => item.subject === 'cre')?.hours, 51, '창체 별칭');
assert.ok(sheetFindings.standards.some(item => item.subject === null && /학교자율/.test(item.subjectName)), '학교자율시간 줄은 교과 밖으로 찾는다');
assert.match(sheetFindings.standards[0].where, /편제표 C4/, '어디서 읽었는지 칸 이름');

// 2) 편제표(한글, 교과가 가로, 병합 머리글, 학년 줄)
const hwpxSheet = hwpx([[
  {value: '학년', col: 0, row: 0, colSpan: 2}, {value: '국어', col: 2, row: 0}, {value: '수학', col: 3, row: 0}, {value: '체육', col: 4, row: 0}, {value: '음악', col: 5, row: 0}, {value: '미술', col: 6, row: 0},
  {value: '3학년', col: 0, row: 1, rowSpan: 2}, {value: '1학기', col: 1, row: 1}, {value: '100', col: 2, row: 1}, {value: '70', col: 3, row: 1}, {value: '52', col: 4, row: 1}, {value: '34', col: 5, row: 1}, {value: '34', col: 6, row: 1},
  {value: '2학기', col: 1, row: 2}, {value: '104', col: 2, row: 2}, {value: '66', col: 3, row: 2}, {value: '52', col: 4, row: 2}, {value: '34', col: 5, row: 2}, {value: '34', col: 6, row: 2},
  {value: '4학년', col: 0, row: 3, rowSpan: 2}, {value: '1학기', col: 1, row: 3}, {value: '999', col: 2, row: 3}, {value: '9', col: 3, row: 3}, {value: '9', col: 4, row: 3}, {value: '9', col: 5, row: 3}, {value: '9', col: 6, row: 3},
]]);
assert.equal(fileKind('편제.hwpx', hwpxSheet), 'hwpx');
const across = interpret(gridsOf('편제.hwpx', hwpxSheet), plan).standards;
assert.deepEqual(across.filter(item => item.subject === 'kor').map(item => [item.semester, item.hours]), [[1, 100], [2, 104]], '가로 표, 병합 학년 칸 아래 학기 줄');
assert.ok(!across.some(item => item.hours === 999), '다른 학년 줄은 읽지 않는다');

// 3) 기초시간표(한글)
const timetable = hwpx([[
  {value: '1학기 기초시간표', col: 0, row: 0, colSpan: 6},
  {value: '교시', col: 0, row: 1}, ...['월', '화', '수', '목', '금'].map((day, index) => ({value: day, col: index + 1, row: 1})),
  ...[['국어', '수학', '국어', '과학', '국어'], ['수학', '영어', '사회', '영어', '체육'], ['사회', '미술', '수학', '음악', '수학'], ['체육', '미술', '체육', '국어', '과학'], ['과학', '음악', '도덕', '사회', '창의적 체험활동']]
    .flatMap((row, period) => [{value: `${period + 1}교시`, col: 0, row: period + 2}, ...row.map((value, day) => ({value, col: day + 1, row: period + 2}))]),
]]);
const found = interpret(gridsOf('시간표.hwpx', timetable), plan).templates[0];
assert.equal(found.semester, 1, '표 위 글자에서 학기');
assert.equal(found.slots.length, 25);
assert.equal(found.confidence, 'high');
assert.deepEqual(found.slots.find(slot => slot.weekday === 5 && slot.period === 5), {weekday: 5, period: 5, subject: 'cre', subjectName: '창의적 체험활동'}, '띄어 쓴 교과 이름도 칸 전체로 맞춘다');

// 4) 학사일정(엑셀 목록: 날짜 글자, 기간, 엑셀 날짜 숫자)
const calendar = xlsx({'학사일정': [
  ['날짜', '요일', '행사명'], ['2026. 3. 3.', '화', '시업식·입학식'], ['5. 4.(월)', '월', '학교장 재량휴업일'],
  ['7.22.~8.16.', '', '여름방학'], [46143, '', '운동회'], ['12월 25일', '금', '성탄절'], ['2027. 1. 8.', '', '종업식'], ['3/1', '', '학년도 밖이 아님(삼일절)'],
]});
const days = interpret(gridsOf('학사일정.xlsx', calendar), plan).days;
assert.deepEqual(days.find(day => day.name === '여름방학'), {date: '2026-07-22', until: '2026-08-16', kind: 'vacation', name: '여름방학', where: '학사일정 A4', confidence: 'high'});
assert.equal(days.find(day => day.name === '학교장 재량휴업일')?.kind, 'off');
assert.equal(days.find(day => day.name === '운동회')?.date, '2026-05-01', '엑셀 날짜 숫자');
assert.equal(days.find(day => day.name === '종업식')?.date, '2027-01-08');
assert.ok(!days.some(day => day.date === '2026-03-01'), '학년도 시작(3/2) 전 날짜는 버린다');
assert.deepEqual(parseDateRange('7월 22일(수) ~ 8월 17일(월)', 2026), {from: '2026-07-22', until: '2026-08-17'});
assert.deepEqual(parseDateRange('2. 10.', 2026), {from: '2027-02-10'}, '1·2월은 다음 해');
assert.equal(parseDateRange('2. 30.', 2026), null, '없는 날짜');
assert.equal(kindOf('여름방학식'), 'event', '방학식은 행사');

// 5) 읽지 못하는 형식은 이유를 말한다
const oldHwp = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
assert.throws(() => gridsOf('편제.hwp', oldHwp), (error: Error) => error instanceof TableError && /HWPX/.test(error.message));
assert.throws(() => gridsOf('a.pdf', new TextEncoder().encode('%PDF-1.7')), TableError);

// 6) 확인 카드에서 고른 값만 넣는다
const applied = applyFindings(plan, {standards: sheetFindings.standards, template: found, days});
assert.equal(applied.subjects.find(subject => subject.key === 'kor')!.standard[1], 102);
assert.ok(applied.subjects.some(subject => subject.key === 'auto1' && subject.standard[1] === 29), '학교자율시간은 교과로 더한다');
assert.equal(applied.templates[1].length, 25);
assert.equal(applied.templates[2].length, 0, '1학기 표는 2학기에 넣지 않는다');
assert.ok(applied.days.filter(day => day.name === '여름방학').length === 26, '기간은 날마다 펼친다');
assert.ok(hourStats(applied).rows.find(row => row.subject === 'kor')!.hasStandard, '읽은 기준시수로 판정이 켜진다');
assert.deepEqual(applyFindings(plan, {standards: [], template: null, days: []}), plan, '아무것도 고르지 않으면 그대로');

console.log('curriculum reader tests passed');
