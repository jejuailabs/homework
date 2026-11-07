import assert from 'node:assert/strict';
import {isCorrectCardAnswer} from './cards-logic';
import {cardBlank, cardPrintCode, cardPrintRuns, clampPrintCounts, combineCardSets, defaultCardPrintOptions, estimatePrintWidth as measure, fitCardText, flowBlocks, generateCardBlankTest, generateCardPrintTest, layoutCardPrint, layoutCardPrintJob, printRange, restoreCardPrintOptions, seededRandom, wrapPrintText, A4, type CardPrintInput, type CardPrintOp, type CardPrintOptions} from './cards-print';
import type {CardEntry} from './cards-types';

const cards: CardEntry[] = Array.from({length: 30}, (_, index) => ({id: `c${index}`, front: `word${index}`, back: `뜻 ${index}`, example: '', alternatives: []}));
const counts = (frontChoice: number, backChoice: number, frontWritten: number, backWritten: number) => ({frontChoice, backChoice, frontWritten, backWritten});
const options = (patch: Partial<CardPrintOptions> = {}): CardPrintOptions => ({...defaultCardPrintOptions('word', cards.length, 7), kind: 'test', counts: counts(6, 4, 3, 2), ...patch});
const input = (patch: Partial<CardPrintOptions> = {}, overrides: Partial<CardPrintInput> = {}): CardPrintInput => ({title: '1단원 단어', type: 'word', cards, options: options(patch), copy: key => key, ...overrides});
const words = (ops: CardPrintOp[]) => ops.flatMap(op => op.t === 'text' ? [op.text] : []);

// A card sharing the prompt is a right answer, so a printed choice never offers it as a wrong one.
{
  const same: CardEntry[] = [{id: 'a', front: 'big', back: '크다', example: '', alternatives: []}, {id: 'b', front: 'large', back: '크다', example: '', alternatives: []}, {id: 'c', front: 'small', back: '작다', example: '', alternatives: []}, {id: 'd', front: 'tall', back: '높다', example: '', alternatives: []}];
  const printed = generateCardPrintTest(same, {...defaultCardPrintOptions('word', 4, 3), kind: 'test', counts: counts(0, 4, 0, 0)});
  for (const question of printed.sections.flatMap(section => section.questions)) if (question.prompt === '크다') assert.equal(question.choices!.filter(choice => choice === 'big' || choice === 'large').length, 1, 'only the one right answer');
}

// Generation: the seed fixes the form, and the sheet and key read the same test.
const first = generateCardPrintTest(cards, options()), again = generateCardPrintTest(cards, options());
assert.deepEqual(first, again, 'the same seed gives the same test');
assert.notDeepEqual(generateCardPrintTest(cards, options({seed: 8})).sections, first.sections, 'another seed gives another test');
assert.equal(first.total, 15, 'counts add up');
assert.deepEqual(first.sections.map(section => section.key), ['frontChoice', 'backChoice', 'frontWritten', 'backWritten']);
const questions = first.sections.flatMap(section => section.questions);
assert.deepEqual(questions.map(question => question.number), Array.from({length: 15}, (_, index) => index + 1), 'numbers run through the sections');
assert.equal(new Set(questions.map(question => question.cardId)).size, 15, 'a card never appears twice, so no question answers another');
for (const question of questions) if (question.choices) {
  assert.equal(question.choices.length, 4); assert.equal(question.choices[question.answerIndex!], question.answer, 'the key points at the expected answer');
  assert.equal(new Set(question.choices).size, 4, 'no repeated choices');
}
assert.equal(generateCardPrintTest(cards, options({choiceCount: 5})).sections[0].questions[0].choices!.length, 5, 'five choices');
assert.equal(cardPrintCode(cards, options()), first.code);
assert.notEqual(cardPrintCode(cards, options({choiceCount: 5})), first.code, 'a changed setting changes the form code');
assert.notEqual(cardPrintCode(cards.map((card, index) => index ? card : {...card, back: '바뀐 뜻'}), options()), first.code, 'edited cards change the form code');
assert.match(first.code, /^[A-HJ-NP-Z2-9]{4}$/, 'codes avoid look-alike letters');
assert.deepEqual(generateCardPrintTest(cards, options({shuffle: false, counts: counts(3, 0, 0, 0)})).sections[0].questions.map(question => question.cardId), ['c0', 'c1', 'c2'], 'without shuffling, card order is kept');
const ranged = generateCardPrintTest(cards, options({start: 11, end: 15, counts: counts(5, 0, 0, 0)})).sections[0].questions;
assert.ok(ranged.every(question => /^c1[0-4]$/.test(question.cardId)), 'questions stay inside the range');
assert.ok(ranged.some(question => question.choices!.some(choice => !/ 1[0-4]$/.test(choice))), 'distractors may come from the whole set');
const twins: CardEntry[] = [{id: 'a', front: 'big', back: '큰', example: '', alternatives: ['커다란']}, {id: 'b', front: 'huge', back: '커다란', example: '', alternatives: []}, {id: 'c', front: 'cat', back: '고양이', example: '', alternatives: []}, {id: 'd', front: 'dog', back: '개', example: '', alternatives: []}, {id: 'e', front: 'sun', back: '해', example: '', alternatives: []}];
for (let seed = 0; seed < 30; seed++) {
  const question = generateCardPrintTest(twins, {...options({seed, start: 1, end: 5, counts: counts(5, 0, 0, 0)})}).sections[0].questions.find(item => item.cardId === 'a')!;
  assert.ok(question.choices!.filter(choice => isCorrectCardAnswer(twins[0], 'front-back', choice)).length === 1, 'a distractor that would also grade correct is excluded');
}
const lonely = generateCardPrintTest(cards.slice(0, 1), options({start: 1, end: 1, counts: counts(1, 0, 0, 0)}));
assert.equal(lonely.sections[0].key, 'frontWritten', 'a set with no other answers falls back to writing');
assert.equal(lonely.shortChoices, 1);
assert.equal(generateCardPrintTest(cards.slice(0, 3), options({start: 1, end: 3, counts: counts(3, 0, 0, 0)})).shortChoices, 3, 'too few answers for four choices is reported');
assert.deepEqual(clampPrintCounts(counts(5, 5, 5, 5), 12), counts(5, 5, 2, 0), 'later groups give way');
assert.deepEqual(printRange({start: 50, end: 2}, 30), {start: 30, end: 30}, 'a range is kept inside the set');
const restored = restoreCardPrintOptions({kind: 'test', end: 99, columns: 3, seed: 5, counts: {backWritten: 50}}, options(), 10);
assert.deepEqual([restored.kind, restored.end, restored.columns, restored.seed], ['test', 10, 2, 5], 'stored settings are checked against the set');
assert.ok(restored.counts.frontChoice + restored.counts.backChoice + restored.counts.frontWritten + restored.counts.backWritten <= 10);
assert.equal(restoreCardPrintOptions(null, options(), 30).seed, 7, 'nothing stored keeps the defaults');
const random = seededRandom(3), values = Array.from({length: 500}, () => random(5));
assert.ok(values.every(value => value >= 0 && value < 5) && new Set(values).size === 5, 'seeded numbers cover the range');

// Text: words stay whole unless one cannot fit, and fonts split by alphabet.
const fixed = (text: string, size: number) => text.length * size / 2;
assert.deepEqual(wrapPrintText('one two three', 25, 10, fixed), ['one', 'two', 'three']);
assert.deepEqual(wrapPrintText('aaaaaaaa', 4 * 5, 10, fixed), ['aaaa', 'aaaa'], 'a word wider than the line is split');
assert.deepEqual(wrapPrintText('첫 줄\n둘째 줄', 500, 10, fixed), ['첫 줄', '둘째 줄'], 'line breaks are kept');
assert.equal(wrapPrintText('é', 500, 10, fixed)[0], 'é', 'text is composed before measuring');
const hasLatin = (code: number) => code < 0x100, hasKorean = (code: number) => code < 0x80 || (code >= 0xac00 && code <= 0xd7a3);
assert.deepEqual(cardPrintRuns('apple 사과 2개', hasLatin, hasKorean), [{font: 'latin', text: 'apple '}, {font: 'korean', text: '사과 2개'}], 'spaces and digits stay with their neighbours');
assert.deepEqual(cardPrintRuns('3학년', hasLatin, hasKorean), [{font: 'korean', text: '3학년'}], 'a leading digit follows the first letter');
const missing = new Set<string>();
assert.deepEqual(cardPrintRuns('a😀', hasLatin, hasKorean, missing), [{font: 'latin', text: 'a?'}], 'a character in neither font is replaced');
assert.deepEqual([...missing], ['😀'], 'and reported');
assert.equal(fitCardText('abandon', 200, 100, 24, fixed).size, 24, 'short text uses the largest size');
assert.ok(fitCardText('가 '.repeat(500), 100, 40, 24, fixed).cut, 'text that cannot fit is flagged');

// Pagination: blocks are never split, and a section title stays with its first question.
const tall = flowBlocks([{height: 60}, {height: 60}, {height: 60}], () => 100, 2, 0);
assert.deepEqual(tall.map(item => [item.page, item.column]), [[0, 0], [0, 1], [1, 0]], 'columns fill before the next page');
const titled = flowBlocks([{height: 70}, {height: 10, keep: true}, {height: 30}], () => 100, 1, 0);
assert.deepEqual(titled.map(item => item.page), [0, 1, 1], 'a section title moves with the next block');
const capacityByPage = flowBlocks([{height: 50}, {height: 50}], page => page ? 100 : 60, 1, 5);
assert.deepEqual(capacityByPage.map(item => item.page), [0, 1], 'the first page has less room');
const insidePage = (pages: CardPrintOp[][]) => {for (const op of pages.flat()) if (op.t === 'text') {assert.ok(op.y > 18 && op.y < A4.height, `${op.text} stays on the page`); assert.ok(op.x >= 28 && op.x + measure(op.text, op.size, op.bold) <= A4.width - 28, `${op.text} stays inside the margins`);}};
const long = '길게 이어지는 뜻풀이 문장입니다 '.repeat(30).slice(0, 500), sentences: CardEntry[] = cards.slice(0, 12).map((card, index) => ({...card, front: `${long.slice(index)}`, back: `${index} ${long.slice(index)}`}));
for (const kind of ['list', 'cards', 'test', 'key'] as const) for (const columns of [1, 2] as const) {
  insidePage(layoutCardPrint(input({kind, columns}), measure).pages);
  insidePage(layoutCardPrint(input({kind, columns, start: 1, end: 12, choiceCount: 5, grid: '3x6', counts: counts(6, 2, 2, 2)}, {type: 'sentence', cards: sentences}), measure).pages);
}

// Output kinds.
const test = layoutCardPrint(input(), measure), key = layoutCardPrint(input({kind: 'key'}), measure);
assert.equal(test.code, key.code, 'sheet and key carry the same form code');
assert.ok(words(test.pages[0]).includes(`printFormCode ${test.code}`) && words(key.pages[0]).includes(`printFormCode ${key.code}`));
for (const label of ['printSchool', 'printClassField', 'printNumber', 'printName', 'printScore']) {assert.ok(words(test.pages[0]).includes(label), `${label} box on the sheet`); assert.ok(!words(key.pages[0]).includes(label), 'no name boxes on the key');}
assert.ok(test.pages.length > 0 && test.pages.slice(1).every(page => words(page).includes(`1단원 단어 · printFormCode ${test.code}`) || words(page).some(line => line.includes(test.code!))), 'every page shows the form code');
const numbers = (pages: CardPrintOp[][]) => pages.flatMap(words).flatMap(line => /^\d+\.$/.test(line) ? [Number.parseInt(line, 10)] : []);
assert.deepEqual(numbers(test.pages), Array.from({length: 15}, (_, index) => index + 1), 'every question is printed once, in order');
assert.deepEqual(numbers(key.pages), numbers(test.pages), 'the key lists the same questions');
const list = words(layoutCardPrint(input({kind: 'list'}), measure).pages.flat()), hidden = words(layoutCardPrint(input({kind: 'list', hideBack: true}), measure).pages.flat());
assert.ok(list.includes('뜻 0') && list.includes('word29'), 'the list shows both sides');
assert.ok(!hidden.includes('뜻 0') && hidden.includes('word29') && hidden.includes('printColumnBack'), 'hiding meanings keeps the blank column');
const part = layoutCardPrint(input({kind: 'list', start: 5, end: 6, columns: 1}), measure);
assert.deepEqual(words(part.pages[0]).filter(line => /^\d$/.test(line)), ['5', '6'], 'rows keep their card numbers');
const row = (ops: CardPrintOp[], value: string) => ops.find((op): op is Extract<CardPrintOp, {t: 'text'}> => op.t === 'text' && op.text === value)!;
const duplex = layoutCardPrint(input({kind: 'cards', start: 1, end: 3}), measure).pages;
assert.equal(duplex.length, 2, 'fronts then backs');
assert.ok(row(duplex[0], 'word0').x < row(duplex[0], 'word1').x && row(duplex[1], '뜻 0').x > row(duplex[1], '뜻 1').x, 'backs are mirrored so they land behind their fronts');
assert.ok(row(duplex[0], 'word2').y === row(duplex[0], 'word2').y && row(duplex[0], 'word0').y > row(duplex[0], 'word2').y, 'rows run down the page');
const pairs = layoutCardPrint(input({kind: 'cards', sides: 'pairs', start: 1, end: 5}), measure).pages;
assert.equal(pairs.length, 2, 'side-by-side cards use one face per sheet');
assert.ok(row(pairs[0], 'word0').x < A4.width / 2 && row(pairs[0], '뜻 0').x > A4.width / 2, 'front and back sit on either side of the fold');
assert.equal(pairs[0].filter(op => op.t === 'line' && op.dash?.length === 4).length, 4, 'the fold line is marked differently');
const edges = duplex[0].filter(op => op.t === 'line').map(op => op.t === 'line' ? `${op.x1},${op.y1},${op.x2},${op.y2}` : '');
assert.equal(new Set(edges).size, edges.length, 'shared card edges are drawn once, so the dashes stay visible');
assert.ok(layoutCardPrint(input({kind: 'cards', grid: '3x6', start: 1, end: 12}, {type: 'sentence', cards: sentences}), measure).truncated > 0, 'cards cut to fit are counted');
// Several sets: joined in order, duplicates dropped once, ids kept unique, each card remembers its set type.
{
  const a: CardEntry[] = [{id: 'x', front: 'Apple', back: '사과', example: '', alternatives: []}, {id: 'y', front: 'pear', back: '배', example: '', alternatives: []}];
  const b: CardEntry[] = [{id: 'x', front: ' apple ', back: '사과', example: '', alternatives: []}, {id: 'z', front: 'apple', back: '애플 회사', example: '', alternatives: []}, {id: 'w', front: 'I like pears.', back: '나는 배를 좋아해요.', example: '', alternatives: []}];
  const joined = combineCardSets([{title: 'A', type: 'word', cards: a}, {title: 'B', type: 'sentence', cards: b}], true);
  assert.deepEqual(joined.cards.map(card => card.id), ['0:x', '0:y', '1:z', '1:w'], 'the same front and back is printed once; a different meaning stays');
  assert.equal(joined.removed, 1);
  assert.equal(joined.type, 'sentence', 'a mix of types counts as sentences');
  assert.deepEqual([joined.types['0:x'], joined.types['1:w']], ['word', 'sentence']);
  assert.equal(combineCardSets([{title: 'A', type: 'word', cards: a}, {title: 'B', type: 'word', cards: b}], false).cards.length, 5, 'duplicates kept when asked');
  assert.deepEqual(combineCardSets([{title: 'A', type: 'word', cards: a}], true).cards.map(card => card.id), ['x', 'y'], 'one set keeps its ids, so its form codes do not change');
  const job = layoutCardPrintJob(joined.groups.map(group => input({kind: 'list', start: 1, end: group.cards.length}, {title: group.title, type: group.type, cards: group.cards})), measure);
  assert.equal(job.pages.length, 2, 'each set starts its own page');
  assert.ok(words(job.pages[0]).includes('A') && words(job.pages[1]).includes('B'));
  const tests = layoutCardPrintJob([input({}, {title: 'one'}), input({seed: 9}, {title: 'two'})], measure);
  assert.match(tests.code!, /^[A-Z2-9]{4} · [A-Z2-9]{4}$/, 'every test part keeps its own form code');
  assert.equal(tests.total, 30);
}

// Blanks: the word inside its example, with endings; sentences hide a content word.
{
  const card = (front: string, example: string, back = '뜻'): CardEntry => ({id: front, front, back, example, alternatives: []}), none = () => 0;
  assert.deepEqual(cardBlank(card('apple', 'I ate an Apple today.'), 'word', 'longest', none), {before: 'I ate an ', answer: 'Apple', after: ' today.'}, 'case does not matter');
  assert.equal(cardBlank(card('run', 'She is running fast.'), 'word', 'longest', none)?.answer, 'running', 'endings stay with the word');
  assert.equal(cardBlank(card('make', 'We are making a cake.'), 'word', 'longest', none)?.answer, 'making', 'a dropped final e is found');
  assert.equal(cardBlank(card('happy', 'They smiled happily.'), 'word', 'longest', none)?.answer, 'happily');
  assert.equal(cardBlank(card('cat', 'A cat and a category.'), 'word', 'longest', none)?.before, 'A ', 'a whole word wins over a longer one');
  assert.equal(cardBlank(card('look after', 'Please look  after my dog.'), 'word', 'longest', none)?.answer, 'look  after', 'phrases match across spaces');
  assert.equal(cardBlank(card('go', 'He went home.'), 'word', 'longest', none), null, 'irregular forms are not guessed');
  assert.equal(cardBlank(card('apple', ''), 'word', 'longest', none), null, 'no example, no blank');
  assert.equal(cardBlank(card('사과', '나는 사과를 먹었어요.'), 'word', 'longest', none)?.answer, '사과', 'Korean words match inside a phrase');
  assert.deepEqual(cardBlank(card('I want to visit the museum.', ''), 'sentence', 'longest', none), {before: 'I want to visit the ', answer: 'museum', after: '.'}, 'the longest word, without its punctuation');
  assert.equal(cardBlank(card('It is on a box.', ''), 'sentence', 'longest', none)?.answer, 'box', 'function words are skipped');
  const picks = new Set(Array.from({length: 40}, (_, seed) => cardBlank(card('Tom reads books every night.', ''), 'sentence', 'random', seededRandom(seed))?.answer));
  assert.ok(picks.size >= 3 && !picks.has(undefined), 'random picks vary');
  const cards = [card('apple', 'An apple a day.'), card('banana', ''), card('cherry', 'Cherries are red.'), card('grape', 'Grapes are sweet.'), card('melon', 'No match here.')];
  const blank = (patch: Partial<CardPrintOptions> = {}) => ({...defaultCardPrintOptions('word', cards.length, 3), kind: 'blank' as const, blankCount: 10, ...patch});
  const test = generateCardBlankTest(cards, 'word', blank());
  assert.deepEqual([test.total, test.skipped], [3, 2], 'cards without a usable example are counted, not printed');
  assert.deepEqual(generateCardBlankTest(cards, 'word', blank()), test, 'the seed fixes the test');
  assert.equal(generateCardBlankTest(cards, 'word', blank({blankCount: 2})).total, 2);
  assert.notEqual(generateCardBlankTest(cards, 'word', blank({blankHint: 'none'})).code, test.code, 'a changed setting changes the code');
  assert.deepEqual(generateCardBlankTest(cards, 'word', blank({shuffle: false})).items.map(item => item.answer), ['apple', 'Cherries', 'Grapes']);
  const mixed = generateCardBlankTest([card('apple', 'An apple.'), {...card('We play soccer after school.', ''), id: 's'}], 'word', blank({shuffle: false}), {s: 'sentence'});
  assert.equal(mixed.items[1].answer, 'soccer', 'merged sentence cards use the sentence rule');
  const sheet = layoutCardPrint(input({kind: 'blank', blankCount: 3, shuffle: false}, {cards}), measure), key = layoutCardPrint(input({kind: 'blankKey', blankCount: 3, shuffle: false}, {cards}), measure);
  assert.equal(sheet.code, key.code, 'the blank sheet and its key match');
  assert.equal(sheet.skipped, 2);
  const sheetText = words(sheet.pages.flat()).join(' '), keyText = words(key.pages.flat()).join(' ');
  assert.ok(!/apple|Cherries|Grapes/.test(sheetText.replace('1단원 단어', '')) && /_{6,}/.test(sheetText), 'the sheet hides the answers');
  assert.ok(sheetText.includes('(뜻)'), 'the meaning is the hint');
  assert.ok(['apple', 'Cherries', 'Grapes'].every(answer => words(key.pages.flat()).includes(answer)), 'the key shows them');
  assert.ok(keyText.includes('printBlankKey') && sheetText.includes('printName'));
  assert.match(words(layoutCardPrint(input({kind: 'blank', blankCount: 1, shuffle: false, blankHint: 'initial'}, {cards}), measure).pages.flat()).join(' '), /An a_{6,} a day\./, 'the first-letter hint');
  assert.equal(layoutCardPrint(input({kind: 'blank'}), measure).total, 0, 'no examples, nothing to ask');
}

// Worksheets: four-line guides for English, plain rules otherwise, all inside the page.
{
  const dashed = (ops: CardPrintOp[]) => ops.filter(op => op.t === 'line' && op.dash?.join() === '4,3').length;
  const practice = layoutCardPrint(input({kind: 'practice', start: 1, end: 10, writeLines: 2}), measure);
  assert.equal(dashed(practice.pages.flat()), 10 * 2 * 2, 'two guides per English word, two dashed lines each');
  assert.ok(words(practice.pages.flat()).filter(line => line === 'word3').length === 2, 'the word and its trace');
  assert.ok(words(layoutCardPrint(input({kind: 'practice', start: 1, end: 10, trace: false}), measure).pages.flat()).filter(line => line === 'word3').length === 1, 'no trace when turned off');
  const korean = layoutCardPrint(input({kind: 'practice', start: 1, end: 3, writeLines: 3}, {cards: cards.map(card => ({...card, front: `단어${card.id}`}))}), measure);
  assert.equal(dashed(korean.pages.flat()), 0, 'Korean words get ruled lines');
  const lines = layoutCardPrint(input({kind: 'lines', start: 1, end: 30, writeLines: 1}), measure);
  assert.equal(dashed(lines.pages.flat()), 30 * 2, 'one guide per word');
  assert.ok(lines.pages.length > 1, 'long sets continue on the next page');
  const blank = layoutCardPrint(input({kind: 'lines', linesMode: 'blank'}), measure);
  assert.equal(blank.pages.length, 1, 'a blank sheet is one page');
  assert.ok(dashed(blank.pages[0]) >= 20, 'filled with guides');
  const meaningFirst = words(layoutCardPrint(input({kind: 'lines', start: 1, end: 1}, {cards: [{id: 'k', front: '사과', back: 'apple', example: '', alternatives: []}]}), measure).pages.flat());
  assert.ok(meaningFirst.filter(line => line === 'apple').length === 2, 'the English side is the model when the front is Korean');
  for (const kind of ['blank', 'blankKey', 'practice', 'lines'] as const) {
    insidePage(layoutCardPrint(input({kind, blankCount: 12}, {cards: sentences.map(card => ({...card, example: card.front}))}), measure).pages);
    insidePage(layoutCardPrint(input({kind, writeLines: 3}, {type: 'sentence', cards: sentences}), measure).pages);
  }
  const restoredMore = restoreCardPrintOptions({kind: 'lines', blankCount: 500, writeLines: 7, combine: 'pages', blankHint: 'initial'}, options(), 30);
  assert.deepEqual([restoredMore.kind, restoredMore.blankCount, restoredMore.writeLines, restoredMore.combine, restoredMore.blankHint], ['lines', 30, 2, 'pages', 'initial'], 'new settings are checked too');
}
console.log('cards print tests passed');
