import assert from 'node:assert/strict';
import test from 'node:test';
import {parseCardImport, cardsCsv, findDuplicateFronts, groupImportErrors, removeDuplicateFronts} from './cards-import';

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
