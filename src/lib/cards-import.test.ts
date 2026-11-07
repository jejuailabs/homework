import assert from 'node:assert/strict';
import test from 'node:test';
import {deflateRawSync} from 'node:zlib';
import {parseCardImport, cardsCsv, CardXlsxError, findDuplicateFronts, groupImportErrors, parseCardXlsx, readXlsxRows, removeDuplicateFronts, spreadsheetImport} from './cards-import';

const card = (front: string, back: string, example = '', alternatives: string[] = []) => ({front, back, example, alternatives});

test('card import handles BOM, Korean or English headers, blank records and CRLF', () => {
  assert.deepEqual(parseCardImport('\uFEFF앞면\t뒷면\t예문\t대체 정답\r\n\r\n apple \t 사과 \t An apple. \t 능금 | 사과열매 \r\n'), {cards: [card('apple', '사과', 'An apple.', ['능금', '사과열매'])], errors: []});
  assert.deepEqual(parseCardImport('front,back\ncat,고양이'), {cards: [card('cat', '고양이')], errors: []});
  assert.deepEqual(parseCardImport('\n\n단어\t뜻\ncat\t고양이'), {cards: [card('cat', '고양이')], errors: []});
});

test('quoted CSV preserves commas, embedded tabs, multiline examples and escaped quotes', () => {
  assert.deepEqual(parseCardImport('"hello, friend","안녕","He said ""hello"".\nNext line","반가워|안녕하세요"'), {cards: [card('hello, friend', '안녕', 'He said "hello".\nNext line', ['반가워', '안녕하세요'])], errors: []});
  assert.deepEqual(parseCardImport('"word\twith tab",meaning\nnext,다음'), {cards: [card('word\twith tab', 'meaning'), card('next', '다음')], errors: []});
});

test('row errors preserve physical source lines and valid rows for correction', () => {
  const source='front,back,example\n"word","뜻","first\nsecond"\n\nmissing\n,없음\nnext,다음';
  assert.deepEqual(parseCardImport(source), {cards: [card('word', '뜻', 'first\nsecond'), card('next', '다음')], errors: [{line: 5, reason: 'format'}, {line: 6, reason: 'empty'}]});
});

test('malformed quoting never silently changes pasted content', () => {
  for (const source of ['word,"unclosed', 'wo"rd,뜻', 'word,"meaning"junk', '"word" "extra",meaning']) {
    const result=parseCardImport(source);
    assert.equal(result.cards.length, 0, source);
    assert.equal(result.errors[0]?.reason, 'format', source);
  }
  for (const source of ['', ' \n\r\n ', 'front,back', '앞면\t뒷면']) assert.deepEqual(parseCardImport(source), {cards: [], errors: [{line: 1, reason: 'empty'}]}, source);
});

test('import allows exactly 200 cards and reports the source row of card 201', () => {
  const rows=Array.from({length:201},(_,i)=>`word${i},뜻${i}`);
  assert.equal(parseCardImport(rows.slice(0,200).join('\n')).cards.length,200);
  assert.deepEqual(parseCardImport('front,back\n\n'+rows.join('\n')), {cards: [], errors: [{line: 203, reason: 'limit'}]});
  assert.deepEqual(parseCardImport('a'.repeat(250_001)), {cards: [], errors: [{line: 1, reason: 'limit'}]});
});

test('field and alternative-answer limits return actionable row errors', () => {
  assert.equal(parseCardImport(`${'a'.repeat(1000)},${'뜻'.repeat(1000)},${'b'.repeat(2000)},${'c'.repeat(1000)}`).errors.length,0,'the same limits as the server');
  for (const row of [`${'a'.repeat(1001)},뜻`, `word,${'b'.repeat(1001)}`, `word,뜻,${'c'.repeat(2001)}`, `word,뜻,,${'d'.repeat(1001)}`, `word,뜻,,${Array.from({length:11},(_,i)=>`alt${i}`).join('|')}`]) assert.deepEqual(parseCardImport('word,뜻\n'+row).errors,[{line:2,reason:'length'}]);
  assert.deepEqual(parseCardImport('a,b,c,d,e').errors,[{line:1,reason:'format'}]);
});

test('CSV export quotes delimiters and newlines for lossless ordinary-card reimport', () => {
  const exported=cardsCsv([['front','back','example','alternatives'], ['word, one','의미 "하나"','a\nb','첫째|첫 번째']]);
  assert(exported.startsWith('\uFEFF'));
  assert.deepEqual(parseCardImport(exported), {cards: [card('word, one','의미 "하나"','a\nb',['첫째','첫 번째'])], errors: []});
});

test('CSV export neutralizes spreadsheet formula triggers including leading whitespace', () => {
  for (const value of ['=1+1','+SUM(A1:A2)','-10+20','@SUM(A1)',' \t=cmd()','\n+SUM(A1)']) assert(cardsCsv([[value,'safe']]).includes(`"'${value}"`),value);
  assert.equal(cardsCsv([['ordinary','한국어']]),'\uFEFF"ordinary","한국어"');
});

test('every bad line is kept and grouped by reason', () => {
  const {errors}=parseCardImport('a\n,b\nc,d\ne\nf,\n'+'g'.repeat(1001)+',h');
  assert.deepEqual(errors.map(error=>error.line),[1,2,4,5,6]);
  assert.deepEqual(groupImportErrors(errors),[{reason:'format',lines:[1,4]},{reason:'empty',lines:[2,5]},{reason:'length',lines:[6]}]);
  assert.deepEqual(groupImportErrors([]),[]);
});

test('duplicate fronts are found by position, ignoring case and spacing, and removal keeps the first', () => {
  const cards=[{front:'Apple',back:'사과'},{front:' cat ',back:'고양이'},{front:'',back:''},{front:'apple',back:'애플'},{front:'CAT',back:'묘'},{front:'',back:''},{front:'dog',back:'개'},{front:'  APPLE ',back:'능금'}];
  assert.deepEqual(findDuplicateFronts(cards),[{front:'Apple',numbers:[1,4,8]},{front:'cat',numbers:[2,5]}]);
  assert.deepEqual(removeDuplicateFronts(cards).map(card=>card.back),['사과','고양이','','','개'],'first cards and blank rows stay');
  assert.deepEqual(findDuplicateFronts(removeDuplicateFronts(cards)),[]);
  assert.deepEqual(findDuplicateFronts([{front:'a'},{front:'b'}]),[]);
});

/** A real .xlsx is a ZIP of XML parts; this builds one with deflated and stored entries (the reader does not check CRCs). */
function xlsx(parts: Record<string, string>, stored: string[] = []) {
  const files: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const [name, text] of Object.entries(parts)) {
    const raw = Buffer.from(text), keep = stored.includes(name), data = keep ? raw : deflateRawSync(raw), nameBytes = Buffer.from(name), local = Buffer.alloc(30), dir = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(keep ? 0 : 8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(keep ? 0 : 8, 10); dir.writeUInt32LE(data.length, 20); dir.writeUInt32LE(raw.length, 24); dir.writeUInt16LE(nameBytes.length, 28); dir.writeUInt32LE(offset, 42);
    files.push(local, nameBytes, data); central.push(dir, nameBytes); offset += 30 + nameBytes.length + data.length;
  }
  const size = central.reduce((sum, part) => sum + part.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(parts).length, 8); end.writeUInt16LE(Object.keys(parts).length, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...files, ...central, end]));
}
const book = (sheet: string, shared: string[] = [], sheetPath = 'worksheets/data.xml', absolute = false) => ({
  'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="단어" sheetId="1" r:id="rId7"/><sheet name="둘째" sheetId="2" r:id="rId8"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId8" Target="worksheets/other.xml"/><Relationship Id="rId7" Target="${absolute ? '/xl/' : ''}${sheetPath}"/></Relationships>`,
  [`xl/${sheetPath}`]: `<worksheet><sheetData>${sheet}</sheetData></worksheet>`,
  'xl/worksheets/other.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>wrong</t></is></c><c r="B1" t="inlineStr"><is><t>sheet</t></is></c></row></sheetData></worksheet>',
  'xl/sharedStrings.xml': `<sst>${shared.map(text => `<si>${text}</si>`).join('')}</sst>`,
});
const s = (ref: string, index: number) => `<c r="${ref}" t="s"><v>${index}</v></c>`;

test('xlsx: first sheet by relationship, headers by name, shared, rich, inline and escaped text', async () => {
  const shared = ['<t>뜻</t>', '<t>단어</t>', '<t>예문</t>', '<t>번호</t>', '<r><t>ap</t></r><r><t xml:space="preserve">ple</t></r><rPh><t>アップル</t></rPh>', '<t>사과 &amp; 능금</t>', '<t>대체 정답</t>'];
  const sheet = `<row r="1">${s('A1', 3)}${s('B1', 1)}${s('C1', 0)}${s('D1', 2)}${s('E1', 6)}</row>`
    + `<row r="2"><c r="A2"><v>1</v></c>${s('B2', 4)}${s('C2', 5)}<c r="D2" t="inlineStr"><is><t>I ate an apple_x000D_.</t></is></c><c r="E2" t="str"><f>"a"</f><v>능금|사과열매</v></c></row>`
    + '<row r="3"/><row r="5"><c r="A5"><v>2</v></c><c r="B5" t="inlineStr"><is><t>cat</t></is></c></row>';
  assert.deepEqual(await parseCardXlsx(xlsx(book(sheet, shared))), {cards: [card('apple', '사과 & 능금', 'I ate an apple\r.', ['능금', '사과열매'])], errors: [{line: 5, reason: 'empty'}]});
  assert.deepEqual((await readXlsxRows(xlsx(book(sheet, shared), ['xl/worksheets/data.xml']))).map(row => row.line), [1, 2, 5], 'stored entries and row numbers');
});
test('xlsx without a header is positional (absolute sheet target) and reports every bad row like a paste', async () => {
  const cell = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
  const sheet = `<row r="1">${cell('A1', 'dog')}${cell('B1', '개')}</row><row r="2">${cell('A2', 'only')}</row><row r="3">${cell('A3', 'x')}${cell('C3', 'y')}</row><row r="4">${cell('A4', 'a')}${cell('B4', 'b')}${cell('E4', 'e')}</row><row r="6">${cell('B6', 'run')}${cell('C6', '달리다')}</row>`;
  const result = await parseCardXlsx(xlsx(book(sheet, [], 'worksheets/sheet9.xml', true)));
  assert.deepEqual(result.cards, [card('dog', '개')]);
  assert.deepEqual(groupImportErrors(result.errors), [{reason: 'format', lines: [2, 4]}, {reason: 'empty', lines: [3, 6]}]);
  assert.deepEqual(spreadsheetImport([{cells: ['Word', 'Meaning'], line: 1}]), {cards: [], errors: [{line: 1, reason: 'empty'}]});
});
test('xlsx refuses non-workbooks, broken archives and oversized parts', async () => {
  await assert.rejects(parseCardXlsx(new TextEncoder().encode('front,back\na,b')), CardXlsxError);
  await assert.rejects(parseCardXlsx(xlsx({'word/document.xml': '<w/>'})), CardXlsxError);
  const whole = xlsx(book('<row r="1"/>'));
  await assert.rejects(parseCardXlsx(whole.slice(0, whole.length - 30)), CardXlsxError);
  await assert.rejects(parseCardXlsx(xlsx(book(`<row r="1"><c r="A1" t="inlineStr"><is><t>${'a'.repeat(9 * 1024 * 1024)}</t></is></c></row>`))), CardXlsxError, 'inflated size is capped');
  await assert.rejects(parseCardXlsx(new Uint8Array(5 * 1024 * 1024 + 1)), CardXlsxError);
});
