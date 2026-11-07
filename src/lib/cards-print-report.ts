// Teacher printouts made from a distribution report: 오답노트 and 성적표. Pure like cards-print.ts, and built from the report the page already loaded.
// Student names appear only on sheets meant for the teacher or for that one student; the whole-class note carries none.
import {assemble, bandBlock, columnWidth, fitLines, gridBlocks, INNER, isLatinText, printSheetHead, printText as text, withFooters, wrapPrintText, writingStrips, type CardPrintBlock, type CardPrintCopyKey, type CardPrintLayout, type CardPrintMeasure, type CardPrintOp, type Head} from './cards-print';
import type {CardEntry, CardProgress, CardReportStudent, CardRequiredModes, CardSetType, CardStudyMode} from './cards-types';

export type CardReportPrintOptions = {kind: 'notes' | 'grades'; scope: 'class' | 'students'; studentId: string; perPage: boolean; limit: 5 | 10 | 20; grades: 'table' | 'slips'};
export type CardReportPrintCopyKey = CardPrintCopyKey | 'printNotesTitle' | 'printNotesClass' | 'printNotesCount' | 'printMissedTimes' | 'printMissedPeople' | 'printGradesTitle' | 'printSlipTitle' | 'printSlipMissed' | 'printColStudy' | 'printColMastery' | 'printColBest' | 'printColLatest' | 'printColAttempts' | 'printColLate' | 'printClassSummary' | 'printTeacherOnly' | CardStudyMode;
export type CardReportPrintInput = {title: string; className: string; date: string; type: CardSetType; cards: CardEntry[]; requiredModes: CardRequiredModes; students: CardReportStudent[]; options: CardReportPrintOptions; copy: (key: CardReportPrintCopyKey) => string};
type Missed = {card: CardEntry; count: number};

const MODES: CardStudyMode[] = ['memorize', 'recall', 'spell'];
const fill = (value: string, values: Record<string, string | number>) => Object.entries(values).reduce((result, [name, item]) => result.replace(`{${name}}`, String(item)), value);
export const defaultCardReportPrintOptions = (): CardReportPrintOptions => ({kind: 'notes', scope: 'students', studentId: '', perPage: true, limit: 10, grades: 'table'});
/** Share of the required study done, counting each mode only up to its requirement. Null when nothing is required. */
export function cardStudyPercent(progress: Pick<CardProgress, 'completedCounts'>, required: CardRequiredModes): number | null {
  let need = 0, done = 0;
  for (const mode of MODES) {const count = required[mode]?.requiredCount ?? 0; if (count > 0) {need += count; done += Math.min(progress.completedCounts[mode] ?? 0, count);}}
  return need ? Math.round(done / need * 100) : null;
}
/** A student's most-missed cards, most misses first, then set order. Cards no longer in the snapshot are ignored. */
export function studentMissedCards(student: Pick<CardReportStudent, 'mistakes'>, cards: CardEntry[], limit: number): Missed[] {
  const order = new Map(cards.map((card, index) => [card.id, index]));
  return student.mistakes.filter(item => item.count > 0 && order.has(item.cardId)).sort((a, b) => b.count - a.count || order.get(a.cardId)! - order.get(b.cardId)!).slice(0, limit).map(item => ({card: cards[order.get(item.cardId)!], count: item.count}));
}
/** Cards the most students missed; `count` is students, not misses, so one struggling student does not top the list. */
export function classMissedCards(students: Pick<CardReportStudent, 'mistakes'>[], cards: CardEntry[], limit: number): Missed[] {
  const order = new Map(cards.map((card, index) => [card.id, index])), totals = new Map<string, {people: number; misses: number}>();
  for (const student of students) for (const {cardId, count} of student.mistakes) if (count > 0 && order.has(cardId)) {const entry = totals.get(cardId) ?? {people: 0, misses: 0}; totals.set(cardId, {people: entry.people + 1, misses: entry.misses + count});}
  return [...totals].sort(([a, x], [b, y]) => y.people - x.people || y.misses - x.misses || order.get(a)! - order.get(b)!).slice(0, limit).map(([id, entry]) => ({card: cards[order.get(id)!], count: entry.people}));
}
const byNumber = (students: CardReportStudent[]) => [...students].sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));

function noteRow(input: CardReportPrintInput, {card, count}: Missed, number: number, label: string, width: number, measure: CardPrintMeasure): CardPrintBlock {
  const size = 11, pad = 8, numberWidth = 22, note = fill(input.copy(label === 'people' ? 'printMissedPeople' : 'printMissedTimes'), {n: count}), noteWidth = measure(note, 8.5) + 8;
  const stacked = input.type === 'sentence' || measure(card.front, size, true) > width * .42 - numberWidth, textWidth = (stacked ? width : width * .48) - numberWidth - noteWidth;
  const ops: CardPrintOp[] = [text(0, -(pad + size), 9, String(number), {gray: .4}), text((stacked ? width : width * .48) - measure(note, 8.5), -(pad + size), 8.5, note, {gray: .35})];
  let y = pad;
  for (const line of wrapPrintText(card.front, textWidth, size, measure, true)) {ops.push(text(numberWidth, -(y + size), size, line, {bold: true})); y += size * 1.35;}
  for (const line of wrapPrintText(card.back, textWidth, 9.5, measure)) {ops.push(text(numberWidth, -(y + 9.5), 9.5, line)); y += 9.5 * 1.38;}
  if (card.example.trim()) for (const line of fitLines(card.example, textWidth, 8.5, 3, measure)) {ops.push(text(numberWidth, -(y + 8.5), 8.5, line, {gray: .38})); y += 8.5 * 1.38;}
  const x = stacked ? numberWidth : width * .5, top = stacked ? y + 4 : pad + 1, strips = writingStrips('', x, top, width - x, 2, measure, isLatinText(card.front));
  const height = Math.max(y, top + strips.height) + pad;
  return {height, ops: [...ops, ...strips.ops, {t: 'line', x1: 0, y1: -height, x2: width, y2: -height, width: .5, gray: .75}]};
}
function notesLayout(input: CardReportPrintInput, measure: CardPrintMeasure): CardPrintLayout {
  const {options, copy} = input, heading = copy(options.scope === 'class' ? 'printNotesClass' : 'printNotesTitle'), band = (items: Missed[], label: string, right = '') => bandBlock(label || fill(copy('printNotesCount'), {n: items.length}), INNER, measure, right);
  const sheet = (head: Head, blocks: CardPrintBlock[], footer: string) => withFooters(assemble(blocks, 1, head, 4), footer, measure);
  if (options.scope === 'class') {
    const items = classMissedCards(input.students, input.cards, options.limit);
    if (!items.length) return {pages: [], code: null, truncated: 0, shortChoices: 0, total: 0};
    const head = printSheetHead(heading, null, input.className, input.title, copy, measure, ['printClassField', 'printNumber', 'printName']);
    return {pages: sheet(head, [band(items, ''), ...items.map((item, index) => noteRow(input, item, index + 1, 'people', INNER, measure))], `${input.title} · ${heading}`), code: null, truncated: 0, shortChoices: 0, total: items.length};
  }
  const chosen = byNumber(input.students).filter(student => !options.studentId || student.id === options.studentId).map(student => ({student, items: studentMissedCards(student, input.cards, options.limit)})).filter(entry => entry.items.length);
  const sections = chosen.map(({student, items}) => [band(items, `${student.number}. ${student.name}`, fill(copy('printNotesCount'), {n: items.length})), ...items.map((item, index) => noteRow(input, item, index + 1, 'times', INNER, measure))]);
  const footer = `${input.title} · ${heading}`;
  // One page per student: each starts its own sheet, head included, so it can be handed out alone.
  const pages = options.perPage ? chosen.flatMap((_, index) => sheet(printSheetHead(heading, null, input.className, input.title, copy, measure, null), sections[index], footer)) : chosen.length ? sheet(printSheetHead(heading, null, input.className, input.title, copy, measure, null), sections.flat(), footer) : [];
  return {pages, code: null, truncated: 0, shortChoices: 0, total: chosen.length};
}

type Cell = {key: CardReportPrintCopyKey; width: number; value: (student: CardReportStudent) => string};
function gradeCells(input: CardReportPrintInput): Cell[] {
  const percent = (value: number | null) => value === null ? '—' : `${value}%`, fixed: Cell[] = [
    {key: 'printNumber', width: 34, value: student => String(student.number)}, {key: 'printName', width: 0, value: student => student.name},
    {key: 'printColStudy', width: 62, value: student => percent(cardStudyPercent(student.progress, input.requiredModes))}, {key: 'printColMastery', width: 56, value: student => percent(student.progress.mastery ?? 0)},
    {key: 'printColBest', width: 50, value: student => student.progress.bestScore === null ? '—' : String(student.progress.bestScore)}, {key: 'printColLatest', width: 50, value: student => student.progress.latestScore === null ? '—' : String(student.progress.latestScore)},
    {key: 'printColAttempts', width: 42, value: student => String(student.progress.attempts)}, {key: 'printColLate', width: 42, value: student => student.progress.lateAt ? input.copy('printColLate') : ''}];
  fixed[1].width = INNER - fixed.reduce((sum, cell) => sum + cell.width, 0);
  return fixed;
}
function gradeSummary(input: CardReportPrintInput) {
  const {students} = input, mastery = students.length ? Math.round(students.reduce((sum, student) => sum + (student.progress.mastery ?? 0), 0) / students.length) : 0;
  return fill(input.copy('printClassSummary'), {mastery, done: students.filter(student => student.progress.studyComplete).length, total: students.length});
}
function tableLayout(input: CardReportPrintInput, measure: CardPrintMeasure, head: Head, footer: string): CardPrintOp[][] {
  const cells = gradeCells(input), rowHeight = 20, size = 9.5;
  const place = (cells: Cell[], values: string[], y: number, bold: boolean, small: number) => {
    const ops: CardPrintOp[] = [];
    let x = 0;
    cells.forEach((cell, index) => {const value = fitLines(values[index], cell.width - 8, small, 1, measure, bold)[0] ?? ''; ops.push(text(index === 1 ? x + 6 : x + (cell.width - measure(value, small, bold)) / 2, y, small, value, {bold})); x += cell.width;});
    return ops;
  };
  const rule = (y: number): CardPrintOp => ({t: 'line', x1: 0, y1: y, x2: INNER, y2: y, width: .5, gray: .7});
  const columnHead = {height: rowHeight, ops: [{t: 'rect', x: 0, y: -rowHeight, w: INNER, h: rowHeight, fill: .9} as CardPrintOp, ...place(cells, cells.map(cell => input.copy(cell.key)), -13.5, true, 8.5)]};
  const rows: CardPrintBlock[] = byNumber(input.students).map((student, index) => ({height: rowHeight, ops: [...(index % 2 ? [{t: 'rect', x: 0, y: -rowHeight, w: INNER, h: rowHeight, fill: .965} as CardPrintOp] : []), ...place(cells, cells.map(cell => cell.value(student)), -13.5, false, size), rule(-rowHeight)]}));
  rows.push({height: 26, ops: [text(0, -18, 9.5, gradeSummary(input), {gray: .25})]});
  return withFooters(assemble(rows, 1, head, 0, columnHead), footer, measure);
}
function slipBlock(input: CardReportPrintInput, student: CardReportStudent, width: number, measure: CardPrintMeasure): CardPrintBlock {
  const height = 166, pad = 12, inner = width - pad * 2, ops: CardPrintOp[] = [{t: 'rect', x: 0, y: -height, w: width, h: height, line: .6, gray: .5, dash: [4, 3]}];
  const corner = fitLines(`${input.className} · ${input.date}`, inner * .5, 7.5, 1, measure)[0] ?? '';
  ops.push(text(pad, -(pad + 7), 7.5, input.copy('printSlipTitle'), {gray: .4}), text(width - pad - measure(corner, 7.5), -(pad + 7), 7.5, corner, {gray: .4}));
  ops.push(text(pad, -(pad + 27), 14, fitLines(`${student.number}. ${student.name}`, inner, 14, 1, measure, true)[0] ?? '', {bold: true}), text(pad, -(pad + 42), 9, fitLines(input.title, inner, 9, 1, measure)[0] ?? '', {gray: .3}));
  const cells = gradeCells(input).slice(2), cell = inner / cells.length;
  cells.forEach((item, index) => {
    const label = fitLines(input.copy(item.key), cell - 2, 7.5, 1, measure)[0] ?? '', value = item.value(student) || '—', x = pad + index * cell;
    ops.push(text(x + (cell - measure(label, 7.5)) / 2, -(pad + 62), 7.5, label, {gray: .4}), text(x + (cell - measure(value, 12.5, true)) / 2, -(pad + 80), 12.5, value, {bold: true}));
  });
  ops.push({t: 'line', x1: pad, y1: -(pad + 92), x2: width - pad, y2: -(pad + 92), width: .5, gray: .75});
  const modes = MODES.map(mode => {const need = input.requiredModes[mode]?.requiredCount ?? 0, done = student.progress.completedCounts[mode] ?? 0; return `${input.copy(mode)} ${need ? `${Math.min(done, need)}/${need}` : done}`;}).join(' · ');
  ops.push(text(pad, -(pad + 106), 8.5, fitLines(modes, inner, 8.5, 1, measure)[0] ?? ''));
  const missed = studentMissedCards(student, input.cards, 5).map(item => item.card.front).join(', ');
  ops.push(text(pad, -(pad + 124), 8.5, input.copy('printSlipMissed'), {bold: true}));
  fitLines(missed || '—', inner, 8.5, 2, measure).forEach((line, index) => ops.push(text(pad, -(pad + 138 + index * 12), 8.5, line, {gray: .25})));
  return {height, ops};
}
function gradesLayout(input: CardReportPrintInput, measure: CardPrintMeasure): CardPrintLayout {
  const heading = input.copy('printGradesTitle'), head = printSheetHead(heading, null, `${input.className} · ${input.date}`, input.title, input.copy, measure, null), footer = `${input.title} · ${heading} · ${input.copy('printTeacherOnly')}`;
  const students = byNumber(input.students), total = students.length;
  if (!total) return {pages: [], code: null, truncated: 0, shortChoices: 0, total: 0};
  const pages = input.options.grades === 'table' ? tableLayout(input, measure, head, footer) : withFooters(gridBlocks(students.map(student => slipBlock(input, student, columnWidth(2), measure)), 2, head, 12), footer, measure);
  return {pages, code: null, truncated: 0, shortChoices: 0, total};
}
export function layoutCardReportPrint(input: CardReportPrintInput, measure: CardPrintMeasure): CardPrintLayout {
  return input.options.kind === 'grades' ? gradesLayout(input, measure) : notesLayout(input, measure);
}
