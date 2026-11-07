import assert from 'node:assert/strict';
import {estimatePrintWidth as measure, A4, type CardPrintOp} from './cards-print';
import {cardStudyPercent, classMissedCards, defaultCardReportPrintOptions, layoutCardReportPrint, studentMissedCards, type CardReportPrintInput, type CardReportPrintOptions} from './cards-print-report';
import type {CardEntry, CardProgress, CardReportStudent, CardRequiredModes} from './cards-types';

const cards: CardEntry[] = Array.from({length: 12}, (_, index) => ({id: `c${index}`, front: `word${index}`, back: `뜻 ${index}`, example: index % 2 ? `This is word${index} in a sentence.` : '', alternatives: []}));
const required: CardRequiredModes = {memorize: {requiredCount: 10, direction: 'front-back', rangeStart: 1, rangeEnd: 12}, recall: {requiredCount: 10, direction: 'front-back', rangeStart: 1, rangeEnd: 12}, spell: {requiredCount: 0, direction: 'front-back', rangeStart: 1, rangeEnd: 12}};
const progress = (patch: Partial<CardProgress> = {}): CardProgress => ({counts: {memorize: 0, recall: 0, spell: 0}, correctCounts: {memorize: 0, recall: 0, spell: 0}, completedCounts: {memorize: 0, recall: 0, spell: 0}, attempts: 0, bestScore: null, latestScore: null, starredCardIds: [], lastPosition: null, updatedAt: null, lateAt: null, studyComplete: false, goalReached: false, mastery: 0, reviewDue: 0, ...patch});
const student = (number: number, name: string, mistakes: [string, number][], patch: Partial<CardProgress> = {}): CardReportStudent => ({id: `s${number}`, name, number, disabled: false, progress: progress(patch), attempts: [], mistakes: mistakes.map(([cardId, count]) => ({cardId, count})), levels: {}});
const students = [student(3, '김하늘', [['c1', 2], ['c4', 5], ['gone', 9]], {completedCounts: {memorize: 10, recall: 4, spell: 7}, bestScore: 90, latestScore: 80, attempts: 2, mastery: 55, lateAt: '2026-11-01T00:00:00Z'}), student(1, '이바다', [['c1', 1]], {studyComplete: true, completedCounts: {memorize: 12, recall: 10, spell: 0}, mastery: 75}), student(2, '박구름', [])];
const input = (patch: Partial<CardReportPrintOptions> = {}): CardReportPrintInput => ({title: '3단원', className: '5학년 2반', date: '2026. 11. 7.', type: 'word', cards, requiredModes: required, students, options: {...defaultCardReportPrintOptions(), ...patch}, copy: key => short[key] ?? key});
const short: Record<string, string> = {printColStudy: '필수 학습', printColMastery: '숙련도', printColBest: '최고', printColLatest: '최근', printColAttempts: '응시', printColLate: '지각', printNumber: '번호', printName: '이름'};
const words = (ops: CardPrintOp[]) => ops.flatMap(op => op.t === 'text' ? [op.text] : []);
const inside = (pages: CardPrintOp[][]) => {for (const op of pages.flat()) if (op.t === 'text') {assert.ok(op.y > 18 && op.y < A4.height, `${op.text} stays on the page`); assert.ok(op.x >= 28 && op.x + measure(op.text, op.size, op.bold) <= A4.width - 28, `${op.text} stays inside the margins`);}};

// Numbers: required study counts each mode only up to its requirement; misses sort by count, then set order.
assert.equal(cardStudyPercent(students[0].progress, required), 70, '10 of 10 and 4 of 10; optional spelling does not count');
assert.equal(cardStudyPercent(students[1].progress, required), 100, 'extra study does not go past 100');
assert.equal(cardStudyPercent(students[0].progress, {...required, memorize: {...required.memorize, requiredCount: 0}, recall: {...required.recall, requiredCount: 0}}), null, 'nothing required');
assert.deepEqual(studentMissedCards(students[0], cards, 10).map(item => [item.card.id, item.count]), [['c4', 5], ['c1', 2]], 'cards gone from the snapshot are ignored');
assert.deepEqual(studentMissedCards(students[0], cards, 1).length, 1);
assert.deepEqual(classMissedCards(students, cards, 10).map(item => [item.card.id, item.count]), [['c1', 2], ['c4', 1]], 'ranked by students, not misses');

// Mistake notes: one sheet per student with misses, names only on student sheets.
const perPage = layoutCardReportPrint(input(), measure);
assert.equal(perPage.total, 2, 'a student with no misses gets no page');
assert.equal(perPage.pages.length, 2);
assert.ok(words(perPage.pages[0]).includes('1. 이바다') && words(perPage.pages[1]).includes('3. 김하늘'), 'in number order, each page names its student');
assert.ok(words(perPage.pages[1]).includes('This is word1 in a sentence.') && words(perPage.pages[1]).includes('뜻 4'), 'meaning and example');
assert.ok(perPage.pages[1].some(op => op.t === 'line' && op.dash), 'English words get guides to rewrite on');
assert.equal(layoutCardReportPrint(input({perPage: false}), measure).pages.length, 1, 'or all on running pages');
assert.equal(layoutCardReportPrint(input({studentId: 's3'}), measure).total, 1, 'one chosen student');
assert.equal(layoutCardReportPrint(input({studentId: 's2'}), measure).pages.length, 0, 'nothing to print');
const whole = words(layoutCardReportPrint(input({scope: 'class'}), measure).pages.flat()).join(' ');
assert.ok(!/김하늘|이바다|박구름/.test(whole), 'the class note carries no names');
assert.ok(whole.includes('이름') && whole.includes('word1'), 'students write their own name');

// Grade sheet: every student once, in number order; slips fit two to a row.
const table = layoutCardReportPrint(input({kind: 'grades'}), measure), cells = words(table.pages.flat());
assert.deepEqual(cells.filter(value => /^(이바다|박구름|김하늘)$/.test(value)), ['이바다', '박구름', '김하늘']);
for (const value of ['70%', '100%', '55%', '90', '80', '—', 'printTeacherOnly']) assert.ok(cells.some(cell => cell === value || cell.includes(value)), `${value} printed`);
const many = Array.from({length: 40}, (_, index) => student(index + 1, `학생${index + 1}`, [['c2', 1]]));
const long = layoutCardReportPrint({...input({kind: 'grades'}), students: many}, measure);
assert.equal(cells.filter(value => value === '지각').length, 2, 'the header and the one late student');
assert.ok(long.pages.length > 1 && words(long.pages[1]).includes('필수 학습'), 'the column header repeats on every page');
const slips = layoutCardReportPrint({...input({kind: 'grades', grades: 'slips'}), students: many}, measure);
assert.equal(words(slips.pages.flat()).filter(value => value === 'printSlipTitle').length, 40, 'one slip per student');
const slipName = (name: string) => slips.pages[0].find((op): op is Extract<CardPrintOp, {t: 'text'}> => op.t === 'text' && op.text === name)!;
assert.ok(slipName('1. 학생1').y === slipName('2. 학생2').y && slipName('1. 학생1').x < slipName('2. 학생2').x && slipName('3. 학생3').y < slipName('1. 학생1').y, 'slips read left to right, then down');
for (const pages of [perPage.pages, table.pages, long.pages, slips.pages, layoutCardReportPrint({...input({perPage: false}), type: 'sentence', cards: cards.map(card => ({...card, front: `${card.front} is a long sentence that wraps across the page for sure`}))}, measure).pages]) inside(pages);
console.log('cards report print tests passed');
