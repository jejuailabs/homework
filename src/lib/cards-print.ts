// Printable card sets. Everything here is pure: one plan drives the dialog's page estimate, the PDF and the tests.
// Layout works in PDF points with y growing upward, and only asks a `measure` callback how wide text is, so no font is needed to test it.
import {buildCardChoices, cardAnswer, shuffleWith} from './cards-logic';
import type {CardDirection, CardEntry, CardSetType} from './cards-types';

export type CardPrintKind = 'list' | 'cards' | 'test' | 'key' | 'blank' | 'blankKey' | 'practice' | 'lines';
export type CardPrintCountKey = 'frontChoice' | 'backChoice' | 'frontWritten' | 'backWritten';
export type CardPrintCounts = Record<CardPrintCountKey, number>;
export type CardPrintOptions = {kind: CardPrintKind; start: number; end: number; hideBack: boolean; columns: 1 | 2; grid: '2x4' | '3x6'; sides: 'duplex' | 'pairs'; shuffle: boolean; choiceCount: 4 | 5; counts: CardPrintCounts; seed: number;
  blankCount: number; blankHint: 'back' | 'initial' | 'none'; blankPick: 'longest' | 'random'; writeLines: 1 | 2 | 3; trace: boolean; linesMode: 'words' | 'blank'; combine: 'merge' | 'pages'; dedupe: boolean};
export type CardPrintOp =
  | {t: 'text'; x: number; y: number; size: number; text: string; bold?: boolean; gray?: number}
  | {t: 'line'; x1: number; y1: number; x2: number; y2: number; width?: number; gray?: number; dash?: number[]}
  | {t: 'rect'; x: number; y: number; w: number; h: number; fill?: number; line?: number; gray?: number; dash?: number[]}
  | {t: 'circle'; x: number; y: number; r: number; line: number};
export type CardPrintMeasure = (text: string, size: number, bold?: boolean) => number;
export type CardPrintCopyKey = 'printSheetWord' | 'printSheetSentence' | 'printKey' | 'printFormCode' | 'printSchool' | 'printClassField' | 'printNumber' | 'printName' | 'printScore' | 'printQuestionTotal' | 'printCardTotal' | 'printColumnWord' | 'printColumnSentence' | 'printColumnBack' | 'printAskFrontChoiceWord' | 'printAskBackChoiceWord' | 'printAskFrontWrittenWord' | 'printAskBackWrittenWord' | 'printAskFrontChoiceSentence' | 'printAskBackChoiceSentence' | 'printAskFrontWrittenSentence' | 'printAskBackWrittenSentence' | 'printOr' | 'printDuplexHint' | 'printPairsHint' | 'printSheetBlank' | 'printBlankKey' | 'printAskBlank' | 'printSheetPractice' | 'printAskPractice' | 'printSheetLines' | 'printAskLines';
/** `types` names each card's own set type when sets of both types are merged. */
export type CardPrintInput = {title: string; type: CardSetType; cards: CardEntry[]; options: CardPrintOptions; copy: (key: CardPrintCopyKey) => string; types?: Record<string, CardSetType>};
export type CardPrintQuestion = {number: number; cardId: string; direction: CardDirection; prompt: string; answer: string; alternatives: string[]; choices?: string[]; answerIndex?: number};
export type CardPrintSection = {key: CardPrintCountKey; written: boolean; direction: CardDirection; questions: CardPrintQuestion[]};
export type CardPrintTest = {code: string; total: number; shortChoices: number; sections: CardPrintSection[]};
/** `skipped`: cards a blank test could not use, because the example does not contain the word. */
export type CardPrintLayout = {pages: CardPrintOp[][]; code: string | null; truncated: number; shortChoices: number; total: number; skipped?: number};
export type CardPrintBlock = {height: number; keep?: boolean; ops: CardPrintOp[]};

export const A4 = {width: 595.28, height: 841.89};
const MARGIN = {x: 42, top: 40, bottom: 46, footer: 24}, CARD_MARGIN = {x: 30, top: 30, bottom: 46};
export const INNER = A4.width - MARGIN.x * 2, BODY = A4.height - MARGIN.top - MARGIN.bottom, GUTTER = 22;
const GROUPS: {key: CardPrintCountKey; direction: CardDirection; written: boolean}[] = [{key: 'frontChoice', direction: 'front-back', written: false}, {key: 'backChoice', direction: 'back-front', written: false}, {key: 'frontWritten', direction: 'front-back', written: true}, {key: 'backWritten', direction: 'back-front', written: true}];
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const whole = (value: unknown, fallback: number) => Number.isInteger(value) ? value as number : fallback;
export const printRange = (options: Pick<CardPrintOptions, 'start' | 'end'>, count: number) => {
  const start = Math.min(Math.max(whole(options.start, 1), 1), Math.max(count, 1));
  return {start, end: Math.min(Math.max(whole(options.end, count), start), count)};
};
/** A card appears once per test, otherwise one question would hand students the answer to another. Later groups give way first. */
export function clampPrintCounts(counts: CardPrintCounts, available: number): CardPrintCounts {
  let left = Math.max(available, 0);
  return Object.fromEntries(GROUPS.map(({key}) => {const value = Math.min(Math.max(whole(counts[key], 0), 0), left); left -= value; return [key, value];})) as CardPrintCounts;
}
export function defaultCardPrintOptions(type: CardSetType, count: number, seed: number): CardPrintOptions {
  const total = Math.min(20, count);
  return {kind: 'list', start: 1, end: count, hideBack: false, columns: type === 'word' ? 2 : 1, grid: '2x4', sides: 'duplex', shuffle: true, choiceCount: 4, counts: {frontChoice: Math.ceil(total / 2), backChoice: 0, frontWritten: 0, backWritten: Math.floor(total / 2)}, seed, blankCount: total, blankHint: 'back', blankPick: 'longest', writeLines: 2, trace: true, linesMode: 'words', combine: 'merge', dedupe: true};
}
/** Reads saved dialog choices defensively, since the set may have shrunk or the shape changed since they were stored. */
export function restoreCardPrintOptions(stored: unknown, fallback: CardPrintOptions, count: number): CardPrintOptions {
  const value = (stored ?? {}) as Partial<CardPrintOptions>, pick = <T,>(item: unknown, allowed: T[], base: T) => allowed.includes(item as T) ? item as T : base;
  return {kind: pick(value.kind, ['list', 'cards', 'test', 'key', 'blank', 'blankKey', 'practice', 'lines'], fallback.kind), ...printRange({start: value.start ?? fallback.start, end: value.end ?? fallback.end}, count), hideBack: pick(value.hideBack, [true, false], fallback.hideBack), columns: pick(value.columns, [1, 2], fallback.columns), grid: pick(value.grid, ['2x4', '3x6'], fallback.grid), sides: pick(value.sides, ['duplex', 'pairs'], fallback.sides), shuffle: pick(value.shuffle, [true, false], fallback.shuffle), choiceCount: pick(value.choiceCount, [4, 5], fallback.choiceCount), counts: clampPrintCounts({...fallback.counts, ...value.counts}, count), seed: Number.isInteger(value.seed) && value.seed! >= 0 ? value.seed! : fallback.seed,
    blankCount: Math.min(Math.max(whole(value.blankCount, fallback.blankCount), 0), count), blankHint: pick(value.blankHint, ['back', 'initial', 'none'], fallback.blankHint), blankPick: pick(value.blankPick, ['longest', 'random'], fallback.blankPick), writeLines: pick(value.writeLines, [1, 2, 3], fallback.writeLines), trace: pick(value.trace, [true, false], fallback.trace), linesMode: pick(value.linesMode, ['words', 'blank'], fallback.linesMode), combine: pick(value.combine, ['merge', 'pages'], fallback.combine), dedupe: pick(value.dedupe, [true, false], fallback.dedupe)};
}

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return (max: number) => {
    state = (state + 0x6D2B79F5) >>> 0;
    let mixed = state; mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1); mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return Math.floor(((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296 * max);
  };
}
/** Printed on both sheets. It hashes everything that changes the questions, so a key made after a settings change visibly stops matching. */
export function cardPrintCode(cards: CardEntry[], options: CardPrintOptions) {
  const {start, end} = printRange(options, cards.length);
  return printHash(JSON.stringify([options.seed, start, end, options.shuffle, options.choiceCount, clampPrintCounts(options.counts, end - start + 1), cards.map(card => [card.id, card.front, card.back, card.alternatives])]));
}
function printHash(source: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index++) hash = Math.imul(hash ^ source.charCodeAt(index), 0x01000193);
  hash >>>= 0;
  return Array.from({length: 4}, (_, index) => CODE_LETTERS[(hash >>> (index * 5)) & 31]).join('');
}
/** Same cards, options and seed always give the same test, which is what lets the sheet and its key be made separately. */
export function generateCardPrintTest(cards: CardEntry[], options: CardPrintOptions): CardPrintTest {
  const {start, end} = printRange(options, cards.length), selected = cards.slice(start - 1, end), random = seededRandom(options.seed);
  const ordered = options.shuffle ? shuffleWith(selected, random) : selected, counts = clampPrintCounts(options.counts, ordered.length);
  const groups = GROUPS.map(group => ({...group, questions: [] as CardPrintQuestion[]}));
  let cursor = 0, shortChoices = 0;
  for (const group of groups) for (let index = 0; index < counts[group.key]; index++) {
    const card = ordered[cursor++], choices = group.written ? null : buildCardChoices(card, cards, group.direction, random, options.choiceCount), answer = cardAnswer(card, group.direction);
    if (!group.written && (choices?.length ?? 0) < options.choiceCount) shortChoices++;
    const question: CardPrintQuestion = {number: 0, cardId: card.id, direction: group.direction, prompt: group.direction === 'front-back' ? card.front : card.back, answer, alternatives: group.direction === 'front-back' ? card.alternatives : []};
    if (choices) group.questions.push({...question, choices, answerIndex: choices.indexOf(answer)});
    else if (group.written) group.questions.push(question);
    else groups.find(other => other.written && other.direction === group.direction)!.questions.push(question); // A set with no other answers cannot make a choice question.
  }
  const sections = groups.filter(group => group.questions.length); let number = 0;
  for (const section of sections) for (const question of section.questions) question.number = ++number;
  return {code: cardPrintCode(cards, options), total: number, shortChoices, sections};
}

export const clean = (value: string) => value.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\t\f\v ]/g, ' ').replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‍⁠﻿]/g, '');
const graphemes = (value: string) => typeof Intl.Segmenter === 'function' ? Array.from(new Intl.Segmenter('ko', {granularity: 'grapheme'}).segment(value), part => part.segment) : Array.from(value);
/** Breaks at spaces first, so Korean phrases and English words stay whole, and only splits a word that cannot fit a line alone. */
export function wrapPrintText(value: string, width: number, size: number, measure: CardPrintMeasure, bold = false) {
  const lines: string[] = [];
  for (const paragraph of clean(value).split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ').filter(Boolean)) {
      const joined = line ? `${line} ${word}` : word;
      if (measure(joined, size, bold) <= width) {line = joined; continue;}
      if (line) lines.push(line);
      line = '';
      for (const letter of graphemes(word)) {
        if (line && measure(line + letter, size, bold) > width) {lines.push(line); line = letter;}
        else line += letter;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}
export function fitLines(value: string, width: number, size: number, limit: number, measure: CardPrintMeasure, bold = false) {
  const lines = wrapPrintText(value, width, size, measure, bold);
  if (lines.length <= limit) return lines;
  let last = lines[limit - 1];
  while (last && measure(`${last}…`, size, bold) > width) last = last.slice(0, -1);
  return [...lines.slice(0, limit - 1), `${last.trimEnd()}…`];
}
/** Splits a line between the two fonts. Digits, spaces and punctuation stay in the surrounding font; anything neither font has becomes ?. */
export function cardPrintRuns(value: string, hasLatin: (code: number) => boolean, hasKorean: (code: number) => boolean, missing?: Set<string>) {
  const letters = Array.from(value).map(letter => {
    const code = letter.codePointAt(0)!, latin = hasLatin(code), korean = hasKorean(code);
    if (!latin && !korean) {missing?.add(letter); return {letter: '?', font: 'latin' as const, neutral: false};}
    return {letter, font: latin ? 'latin' as const : 'korean' as const, neutral: latin && korean && /^[\s\d\p{P}\p{S}]$/u.test(letter)};
  });
  const runs: {font: 'latin' | 'korean'; text: string}[] = [];
  let current = letters.find(item => !item.neutral)?.font ?? 'latin';
  for (const item of letters) {
    if (!item.neutral) current = item.font;
    const last = runs[runs.length - 1];
    if (last?.font === current) last.text += item.letter; else runs.push({font: current, text: item.letter});
  }
  return runs;
}
/** Close enough for the dialog's page estimate, before the fonts are downloaded. */
export const estimatePrintWidth: CardPrintMeasure = (value, size) => Array.from(value).reduce((total, letter) => total + (letter.codePointAt(0)! < 0x2e80 ? (/[ .,:;'!|il]/.test(letter) ? .3 : /[A-Z@%&MW]/.test(letter) ? .68 : .53) : .92) * size, 0);

export const printText = (x: number, y: number, size: number, value: string, extra: {bold?: boolean; gray?: number} = {}): CardPrintOp => ({t: 'text', x, y, size, text: value, ...extra});
const text = printText;
/** Choice numbers are drawn, not typed: the embedded font has no circled digits. */
const choiceMark = (x: number, y: number, size: number, index: number, measure: CardPrintMeasure): CardPrintOp[] => {
  const radius = size * .5, digit = String(index + 1), small = size * .72;
  return [{t: 'circle', x: x + radius, y: y + size * .34, r: radius, line: .5}, text(x + radius - measure(digit, small) / 2, y + size * .34 - small * .35, small, digit)];
};
const translate = (ops: CardPrintOp[], dx: number, dy: number) => ops.map((op): CardPrintOp => op.t === 'line' ? {...op, x1: op.x1 + dx, x2: op.x2 + dx, y1: op.y1 + dy, y2: op.y2 + dy} : {...op, x: op.x + dx, y: op.y + dy});
export const columnWidth = (columns: number) => (INNER - (columns - 1) * GUTTER) / columns;
/** Fills columns top to bottom. A block is never split, and a `keep` block (a section title) moves with the block after it. */
export function flowBlocks<T extends {height: number; keep?: boolean}>(blocks: T[], capacity: (page: number) => number, columns: number, gap: number) {
  const placed: {block: T; page: number; column: number; top: number}[] = [];
  let page = 0, column = 0, used = 0;
  blocks.forEach((block, index) => {
    const need = block.height + (block.keep && blocks[index + 1] ? gap + blocks[index + 1].height : 0);
    if (used && used + gap + need > capacity(page)) {column++; used = 0; if (column >= columns) {column = 0; page++;}}
    const top = used ? used + gap : 0;
    placed.push({block, page, column, top}); used = top + block.height;
  });
  return placed;
}
export type Head = {height: number; ops: CardPrintOp[]};
/** Places blocks onto pages. Only the first page carries the head; `columnHead` repeats at the top of every column in use. */
export function assemble(blocks: CardPrintBlock[], columns: number, head: Head, gap: number, columnHead: Head | null = null, divider = false) {
  const reserved = columnHead?.height ?? 0, width = columnWidth(columns), offset = (page: number) => page ? 0 : head.height;
  const placed = flowBlocks(blocks, page => BODY - offset(page) - reserved, columns, gap);
  const pages: CardPrintOp[][] = Array.from({length: (placed[placed.length - 1]?.page ?? 0) + 1}, () => []);
  pages[0].push(...translate(head.ops, MARGIN.x, A4.height - MARGIN.top));
  const top = (page: number) => A4.height - MARGIN.top - offset(page), seen = new Set<string>();
  for (const {block, page, column, top: from} of placed) {
    const x = MARGIN.x + column * (width + GUTTER);
    if (columnHead && !seen.has(`${page}:${column}`)) {seen.add(`${page}:${column}`); pages[page].push(...translate(columnHead.ops, x, top(page)));}
    pages[page].push(...translate(block.ops, x, top(page) - reserved - from));
  }
  if (divider) pages.forEach((ops, page) => {for (let column = 1, last = Math.max(...placed.filter(item => item.page === page).map(item => item.column)); column <= last; column++) ops.unshift({t: 'line', x1: MARGIN.x + column * (width + GUTTER) - GUTTER / 2, y1: top(page), x2: MARGIN.x + column * (width + GUTTER) - GUTTER / 2, y2: MARGIN.bottom, width: .5, gray: .7});});
  return pages;
}
/** Equal-size blocks such as slips, in reading order: left to right, then down. */
export function gridBlocks(blocks: CardPrintBlock[], across: number, head: Head, gap: number) {
  const width = columnWidth(across), height = Math.max(1, ...blocks.map(block => block.height)), pages: CardPrintOp[][] = [translate(head.ops, MARGIN.x, A4.height - MARGIN.top)];
  let top = head.height, slot = 0;
  for (const block of blocks) {
    if (slot === across) {slot = 0; top += height + gap;}
    if (top + height > BODY) {pages.push([]); top = 0; slot = 0;}
    pages[pages.length - 1].push(...translate(block.ops, MARGIN.x + slot++ * (width + GUTTER), A4.height - MARGIN.top - top));
  }
  return pages;
}
export function withFooters(pages: CardPrintOp[][], left: string, measure: CardPrintMeasure) {
  return pages.map((ops, index) => {
    const number = `${index + 1} / ${pages.length}`, room = INNER - measure(number, 8) - 12;
    return [...ops, text(MARGIN.x, MARGIN.footer, 8, fitLines(left, room, 8, 1, measure)[0] ?? '', {gray: .35}), text(A4.width - MARGIN.x - measure(number, 8), MARGIN.footer, 8, number, {gray: .35})];
  });
}
/** Tries smaller type, then fewer columns. One column at the smallest scale fits the longest text the editor allows. */
function fitBlocks(columnChoices: number[], limit: number, build: (width: number, columns: number) => ((scale: number) => CardPrintBlock)[]) {
  for (const columns of columnChoices) {
    const blocks = build(columnWidth(columns), columns).map(make => [1, .88, .76].map(make).find(block => block.height <= limit));
    if (blocks.every(Boolean)) return {columns, blocks: blocks as CardPrintBlock[]};
  }
  const columns = columnChoices[columnChoices.length - 1];
  return {columns, blocks: build(columnWidth(columns), columns).map(make => make(.76))};
}
const FIELD_WEIGHTS: Partial<Record<CardPrintCopyKey, number>> = {printSchool: 190, printClassField: 120, printNumber: 76, printName: 186, printScore: 124};
const TEST_FIELDS: CardPrintCopyKey[] = ['printSchool', 'printClassField', 'printNumber', 'printName', 'printScore'], WORK_FIELDS: CardPrintCopyKey[] = ['printClassField', 'printNumber', 'printName'];
/** The first page's head: heading, an optional form-code box, the title, then boxes for students to fill in or a plain rule. */
export function printSheetHead(heading: string, code: string | null, note: string, title: string, copy: (key: CardPrintCopyKey) => string, measure: CardPrintMeasure, fields: CardPrintCopyKey[] | null): Head {
  const ops: CardPrintOp[] = [text(0, -17, 18, heading, {bold: true})];
  if (code) {const label = `${copy('printFormCode')} ${code}`, labelWidth = measure(label, 10, true) + 14; ops.push({t: 'rect', x: INNER - labelWidth, y: -21, w: labelWidth, h: 21, line: .8}, text(INNER - labelWidth + 7, -14.5, 10, label, {bold: true}));}
  ops.push(text(INNER - measure(note, 9.5), -36, 9.5, note, {gray: .25}));
  let y = -36;
  for (const line of fitLines(title, INNER - measure(note, 9.5) - 16, 11, 2, measure)) {ops.push(text(0, y, 11, line)); y -= 15;}
  y -= 2;
  if (fields?.length) {
    const gap = 4, height = 28, scale = (INNER - gap * (fields.length - 1)) / fields.reduce((sum, key) => sum + (FIELD_WEIGHTS[key] ?? 120), 0);
    let x = 0;
    for (const key of fields) {const width = (FIELD_WEIGHTS[key] ?? 120) * scale; ops.push({t: 'rect', x, y: y - height, w: width, h: height, line: .8}, text(x + 6, y - 17.5, 9, copy(key))); x += width + gap;}
    y -= height;
  } else ops.push({t: 'line', x1: 0, y1: y, x2: INNER, y2: y, width: 1});
  return {height: -y + 14, ops};
}
const sheetHead = (heading: string, code: string, note: string, input: CardPrintInput, measure: CardPrintMeasure, boxes: boolean) => printSheetHead(heading, code, note, input.title, input.copy, measure, boxes ? TEST_FIELDS : null);
function sectionBlock(input: CardPrintInput, section: CardPrintSection, width: number, measure: CardPrintMeasure): CardPrintBlock {
  const {key} = section, kind = input.type === 'word' ? 'Word' : 'Sentence', from = section.questions[0].number, to = section.questions[section.questions.length - 1].number;
  return bandBlock(`[${from === to ? from : `${from}-${to}`}] ${input.copy(`printAsk${key[0].toUpperCase()}${key.slice(1)}${kind}` as CardPrintCopyKey)}`, width, measure);
}
/** A shaded instruction or section band that stays with the block after it. `right` is a short gray note at the band's end. */
export function bandBlock(label: string, width: number, measure: CardPrintMeasure, right = ''): CardPrintBlock {
  const size = 9.5, room = right ? measure(right, 8.5) + 14 : 0, lines = wrapPrintText(label, width - 12 - room, size, measure, true), height = lines.length * size * 1.4 + 8;
  const ops: CardPrintOp[] = [{t: 'rect', x: 0, y: -height, w: width, h: height, fill: .93}, ...lines.map((line, index) => text(6, -(size * 1.1 + 3) - index * size * 1.4, size, line, {bold: true}))];
  if (right) ops.push(text(width - 6 - measure(right, 8.5), -(size * 1.1 + 3), 8.5, right, {gray: .3}));
  return {height, keep: true, ops};
}
function questionBlock(input: CardPrintInput, question: CardPrintQuestion, width: number, measure: CardPrintMeasure, scale: number): CardPrintBlock {
  const size = 10.5 * scale, lead = size * 1.42, indent = size * 2.15, body = width - indent, strong = input.type === 'word', prompt = wrapPrintText(question.prompt, body, size, measure, strong);
  const ops: CardPrintOp[] = [text(0, -size, size, `${question.number}.`, {bold: true}), ...prompt.map((line, index) => text(indent, -size - index * lead, size, line, {bold: strong}))];
  let y = prompt.length * lead;
  if (question.choices) {
    const small = size * .95, tight = small * 1.38, hang = small * 1.45, widths = question.choices.map(choice => measure(clean(choice), small));
    const across = [question.choices.length, 2].find(count => count > 1 && widths.every(item => item + hang + 8 <= body / count)) ?? 1, cell = body / across;
    y += size * .22;
    const rows = Math.ceil(question.choices.length / across);
    for (let row = 0; row < rows; row++) {
      const items = question.choices.slice(row * across, row * across + across).map(choice => wrapPrintText(choice, cell - hang - 8, small, measure));
      items.forEach((lines, slot) => {
        const x = indent + slot * cell, top = y + small;
        ops.push(...choiceMark(x, -top, small, row * across + slot, measure), ...lines.map((line, index) => text(x + hang, -top - index * tight, small, line)));
      });
      y += Math.max(...items.map(lines => lines.length), 1) * tight;
    }
  } else {
    const rules = Math.min(3, Math.max(1, Math.ceil(measure(clean(question.answer), size) * 1.3 / body)));
    for (let rule = 0; rule < rules; rule++) {y += 21; ops.push({t: 'line', x1: indent, y1: -y, x2: width, y2: -y, width: .6, gray: .45});}
    y += 3;
  }
  return {height: y, ops};
}
function testLayout(input: CardPrintInput, measure: CardPrintMeasure): CardPrintLayout {
  const test = generateCardPrintTest(input.cards, input.options), heading = input.copy(input.type === 'word' ? 'printSheetWord' : 'printSheetSentence');
  const head = sheetHead(heading, test.code, input.copy('printQuestionTotal').replace('{n}', String(test.total)), input, measure, true);
  const {columns, blocks} = fitBlocks(input.options.columns === 2 ? [2, 1] : [1], BODY - head.height - 30, width => test.sections.flatMap(section => [() => sectionBlock(input, section, width, measure), ...section.questions.map(question => (scale: number) => questionBlock(input, question, width, measure, scale))]));
  return {pages: withFooters(assemble(blocks, columns, head, 11, null, true), `${input.title} · ${input.copy('printFormCode')} ${test.code}`, measure), code: test.code, truncated: 0, shortChoices: test.shortChoices, total: test.total};
}
const answerText = (input: CardPrintInput, question: CardPrintQuestion) => [question.answer, ...question.alternatives].join(` ${input.copy('printOr')} `);
function keyRow(input: CardPrintInput, question: CardPrintQuestion, width: number, measure: CardPrintMeasure, scale: number): CardPrintBlock {
  const size = 10 * scale, lead = size * 1.4, chosen = question.answerIndex !== undefined, indent = size * 2.3 + (chosen ? size * 1.4 : 0), lines = wrapPrintText(answerText(input, question), width - indent, size, measure);
  return {height: lines.length * lead, ops: [text(0, -size, size, `${question.number}.`, {bold: true}), ...(chosen ? choiceMark(size * 2.3, -size, size * .95, question.answerIndex!, measure) : []), ...lines.map((line, index) => text(indent, -size - index * lead, size, line))]};
}
function keyLayout(input: CardPrintInput, measure: CardPrintMeasure): CardPrintLayout {
  const test = generateCardPrintTest(input.cards, input.options), head = sheetHead(input.copy('printKey'), test.code, input.copy('printQuestionTotal').replace('{n}', String(test.total)), input, measure, false);
  const {columns, blocks} = fitBlocks(input.type === 'word' ? [3, 2, 1] : [2, 1], BODY - head.height - 30, width => test.sections.flatMap(section => [() => sectionBlock(input, section, width, measure), ...section.questions.map(question => (scale: number) => keyRow(input, question, width, measure, scale))]));
  return {pages: withFooters(assemble(blocks, columns, head, 6, null, true), `${input.title} · ${input.copy('printKey')} · ${input.copy('printFormCode')} ${test.code}`, measure), code: test.code, truncated: 0, shortChoices: test.shortChoices, total: test.total};
}
function listRow(input: CardPrintInput, card: CardEntry, number: number, width: number, split: number[], measure: CardPrintMeasure, scale: number): CardPrintBlock {
  const size = 10 * scale, lead = size * 1.4, pad = 5.5, [no, front] = split, strong = input.type === 'word', hidden = input.options.hideBack;
  const left = wrapPrintText(card.front, front - 10, size, measure, strong), right = hidden ? [] : wrapPrintText(card.back, width - no - front - 10, size, measure);
  const count = Math.max(left.length, right.length), height = Math.max(count * lead + pad * 2, hidden ? 27 : 21), top = (height - count * lead) / 2 + size * .95, numeral = String(number), rule = {width: .5, gray: .65};
  return {height, ops: [text(no - 6 - measure(numeral, size * .85), -top, size * .85, numeral, {gray: .3}), ...left.map((line, index) => text(no + 5, -top - index * lead, size, line, {bold: strong})), ...right.map((line, index) => text(no + front + 5, -top - index * lead, size, line)), {t: 'line', x1: 0, y1: -height, x2: width, y2: -height, ...rule}, {t: 'line', x1: no, y1: 0, x2: no, y2: -height, ...rule}, {t: 'line', x1: no + front, y1: 0, x2: no + front, y2: -height, ...rule}]};
}
function listLayout(input: CardPrintInput, measure: CardPrintMeasure): CardPrintLayout {
  const {start, end} = printRange(input.options, input.cards.length), selected = input.cards.slice(start - 1, end), word = input.type === 'word', note = input.copy('printCardTotal').replace('{n}', String(selected.length));
  const lines = fitLines(input.title, INNER - 90, 15, 2, measure, true), head: Head = {height: lines.length * 20 + 16, ops: [...lines.map((line, index) => text(0, -15 - index * 20, 15, line, {bold: true})), text(INNER - measure(note, 9.5), -14, 9.5, note, {gray: .25})]};
  const splitFor = (width: number) => {const no = 26; return [no, (width - no) * (word && !input.options.hideBack ? .42 : .5)];};
  const {columns, blocks} = fitBlocks(input.options.columns === 2 ? [2, 1] : [1], BODY - head.height - 24, width => selected.map((card, index) => (scale: number) => listRow(input, card, start + index, width, splitFor(width), measure, scale)));
  const width = columnWidth(columns), [no, front] = splitFor(width), size = 9, band = 19;
  const columnHead: Head = {height: band, ops: [{t: 'rect', x: 0, y: -band, w: width, h: band, fill: .9}, text(no + 5, -13, size, input.copy(word ? 'printColumnWord' : 'printColumnSentence'), {bold: true}), text(no + front + 5, -13, size, input.copy('printColumnBack'), {bold: true})]};
  return {pages: withFooters(assemble(blocks, columns, head, 0, columnHead), input.title, measure), code: null, truncated: 0, shortChoices: 0, total: selected.length};
}
/** Largest size that fits, preferring one that keeps every word whole. Very long text on small cards is cut and reported. */
export function fitCardText(value: string, width: number, height: number, max: number, measure: CardPrintMeasure, bold = false) {
  const words = clean(value).split(/\s+/).filter(Boolean), least = 6.5;
  for (let size = max; size >= least; size -= .5) {
    if (size > 9 && words.some(word => measure(word, size, bold) > width)) continue;
    const lines = wrapPrintText(value, width, size, measure, bold);
    if (lines.length * size * 1.34 <= height) return {size, lines, cut: false};
  }
  return {size: least, lines: fitLines(value, width, least, Math.max(1, Math.floor(height / (least * 1.34))), measure, bold), cut: true};
}
function cardFace(value: string, x: number, y: number, width: number, height: number, number: number, strong: boolean, max: number, measure: CardPrintMeasure) {
  const pad = Math.min(14, width * .08), fit = fitCardText(value, width - pad * 2, height - 26, max, measure, strong), lead = fit.size * 1.34, baseline = y + height / 2 + (fit.lines.length * lead) / 2 - fit.size * 1.02, numeral = String(number);
  const ops: CardPrintOp[] = fit.lines.map((line, index) => text(x + (width - measure(line, fit.size, strong)) / 2, baseline - index * lead, fit.size, line, {bold: strong}));
  ops.push(text(x + width - 7 - measure(numeral, 7), y + 6, 7, numeral, {gray: .45}));
  return {ops, cut: fit.cut};
}
function cardsLayout(input: CardPrintInput, measure: CardPrintMeasure): CardPrintLayout {
  const {start, end} = printRange(input.options, input.cards.length), selected = input.cards.slice(start - 1, end), {grid, sides} = input.options, pairs = sides === 'pairs';
  const rows = grid === '2x4' ? 4 : 6, across = pairs ? 2 : grid === '2x4' ? 2 : 3, faces = pairs ? rows : across * rows, width = (A4.width - CARD_MARGIN.x * 2) / across, height = (A4.height - CARD_MARGIN.top - CARD_MARGIN.bottom) / rows, max = rows === 4 ? 24 : 16;
  const pages: CardPrintOp[][] = [], cut = new Set<string>(), frame = (column: number, row: number) => ({x: CARD_MARGIN.x + column * width, y: A4.height - CARD_MARGIN.top - (row + 1) * height});
  // Neighbouring cards share an edge. Drawing it twice would fill in the dashes, so each sheet keeps a set of edges already drawn.
  const outline = (column: number, row: number, drawn: Set<string>) => {
    const {x, y} = frame(column, row), edges: [string, number, number, number, number, boolean][] = [[`h${column}:${row}`, x, y + height, x + width, y + height, false], [`h${column}:${row + 1}`, x, y, x + width, y, false], [`v${column}:${row}`, x, y, x, y + height, pairs && column === 1], [`v${column + 1}:${row}`, x + width, y, x + width, y + height, pairs && column === 0]];
    return edges.filter(([key]) => !drawn.has(key) && !!drawn.add(key)).map(([, x1, y1, x2, y2, fold]): CardPrintOp => ({t: 'line', x1, y1, x2, y2, width: .5, gray: .55, dash: fold ? [10, 3, 2, 3] : [4, 3]}));
  };
  for (let from = 0; from < selected.length; from += faces) {
    const front: CardPrintOp[] = [], back: CardPrintOp[] = [], frontEdges = new Set<string>(), backEdges = new Set<string>();
    selected.slice(from, from + faces).forEach((card, index) => {
      const column = pairs ? 0 : index % across, row = pairs ? index : Math.floor(index / across), number = start + from + index, flip = pairs ? 1 : across - 1 - column, a = frame(column, row), b = frame(flip, row); // Duplex backs mirror left and right so each lands behind its front.
      const shown = cardFace(card.front, a.x, a.y, width, height, number, input.type === 'word', max, measure), hidden = cardFace(card.back, b.x, b.y, width, height, number, false, max, measure);
      if (shown.cut || hidden.cut) cut.add(card.id);
      front.push(...outline(column, row, frontEdges), ...shown.ops); (pairs ? front : back).push(...outline(flip, row, pairs ? frontEdges : backEdges), ...hidden.ops);
    });
    pages.push(front); if (!pairs) pages.push(back);
  }
  return {pages: withFooters(pages, `${input.title} · ${input.copy(pairs ? 'printPairsHint' : 'printDuplexHint')}`, measure), code: null, truncated: cut.size, shortChoices: 0, total: selected.length};
}
export function layoutCardPrint(input: CardPrintInput, measure: CardPrintMeasure): CardPrintLayout {
  switch (input.options.kind) {
    case 'test': return testLayout(input, measure);
    case 'key': return keyLayout(input, measure);
    case 'cards': return cardsLayout(input, measure);
    case 'blank': case 'blankKey': return blankLayout(input, measure);
    case 'practice': return practiceLayout(input, measure);
    case 'lines': return linesLayout(input, measure);
    default: return listLayout(input, measure);
  }
}

// Several sets in one print job.
export type CardPrintSource = {title: string; type: CardSetType; cards: CardEntry[]};
const sameText = (value: string) => clean(value).toLocaleLowerCase().replace(/\s+/g, ' ').trim();
/** Joins sets in the chosen order. With `dedupe`, a card whose front and back both match an earlier one is left out. Ids get a set prefix so they stay unique. */
export function combineCardSets(sources: CardPrintSource[], dedupe: boolean) {
  const seen = new Set<string>(), types: Record<string, CardSetType> = {};
  let removed = 0;
  const groups = sources.map((source, index) => ({title: source.title, type: source.type, cards: source.cards.flatMap(card => {
    const key = `${sameText(card.front)}\n${sameText(card.back)}`;
    if (dedupe && seen.has(key)) {removed++; return [];}
    seen.add(key);
    const id = sources.length > 1 ? `${index}:${card.id}` : card.id;
    types[id] = source.type;
    return [{...card, id}];
  })}));
  return {cards: groups.flatMap(group => group.cards), groups, types, removed, type: (sources.every(source => source.type === 'word') ? 'word' : 'sentence') as CardSetType};
}
/** Prints the inputs one after another; each starts a new page with its own head, page numbers and form code. */
export function layoutCardPrintJob(inputs: CardPrintInput[], measure: CardPrintMeasure): CardPrintLayout {
  const parts = inputs.filter(input => input.cards.length).map(input => layoutCardPrint(input, measure));
  if (parts.length <= 1) return parts[0] ?? {pages: [], code: null, truncated: 0, shortChoices: 0, total: 0, skipped: 0};
  const sum = (key: 'truncated' | 'shortChoices' | 'total' | 'skipped') => parts.reduce((total, part) => total + (part[key] ?? 0), 0), codes = parts.flatMap(part => part.code ? [part.code] : []);
  return {pages: parts.flatMap(part => part.pages), code: codes.length ? codes.join(' · ') : null, truncated: sum('truncated'), shortChoices: sum('shortChoices'), total: sum('total'), skipped: sum('skipped')};
}

// Blank test: one word hidden in a sentence.
export type CardBlank = {before: string; answer: string; after: string};
export type CardBlankItem = CardBlank & {number: number; cardId: string; type: CardSetType; hint: string; sentence: string};
export type CardBlankTest = {code: string; total: number; skipped: number; items: CardBlankItem[]};
const STOP_WORDS = new Set('a an the and or but so to of in on at by for from with as is am are was were be been do does did have has had it its this that these those i you he she we they me him her us them my your his our their not no if can will'.split(' '));
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const isLatinText = (value: string) => /\p{Script=Latin}/u.test(value) && !/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
/** Word cards hide the word inside their example, allowing endings (run → running, make → making, happy → happily). Sentence cards hide their longest word, or a seeded random one, skipping short function words. */
export function cardBlank(card: CardEntry, type: CardSetType, pick: CardPrintOptions['blankPick'], random: (max: number) => number): CardBlank | null {
  const cut = (source: string, start: number, answer: string): CardBlank => ({before: source.slice(0, start), answer, after: source.slice(start + answer.length)});
  if (type === 'word') {
    const source = clean(card.example).trim(), target = clean(card.front).trim();
    if (!source || !target) return null;
    const body = target.split(/\s+/).map(escapePattern).join('\\s+'), latin = isLatinText(target), stem = latin && !/\s/.test(target) && target.length >= 4 ? escapePattern(target.replace(/[ey]$/i, '')) : null;
    const patterns = latin ? [`(?<!\\p{L})${body}(?!\\p{L})`, `(?<!\\p{L})${body}\\p{L}*`, ...(stem ? [`(?<!\\p{L})${stem}\\p{L}*`] : [])] : [body];
    for (const pattern of patterns) {const match = new RegExp(pattern, 'iu').exec(source); if (match) return cut(source, match.index, match[0]);}
    return null;
  }
  const source = clean(card.front).trim(), words = [...source.matchAll(/\S+/g)].flatMap(match => {const core = /[\p{L}\p{N}](?:.*[\p{L}\p{N}])?/u.exec(match[0]); return core ? [{start: match.index + core.index, value: core[0]}] : [];});
  if (!words.length) return null;
  const strong = words.filter(word => Array.from(word.value).length >= 2 && !STOP_WORDS.has(word.value.toLowerCase())), pool = strong.length ? strong : words;
  const chosen = pick === 'random' ? pool[random(pool.length)] : pool.reduce((best, word) => Array.from(word.value).length > Array.from(best.value).length ? word : best);
  return cut(source, chosen.start, chosen.value);
}
/** Seeded like the regular test, so the sheet and its key can be made separately. Cards with no usable sentence are counted, not printed. */
export function generateCardBlankTest(cards: CardEntry[], type: CardSetType, options: CardPrintOptions, types: Record<string, CardSetType> = {}): CardBlankTest {
  const {start, end} = printRange(options, cards.length), selected = cards.slice(start - 1, end), random = seededRandom(options.seed ^ 0x2545f491), items: CardBlankItem[] = [];
  let skipped = 0;
  for (const card of options.shuffle ? shuffleWith(selected, random) : selected) {
    const own = types[card.id] ?? type, blank = cardBlank(card, own, options.blankPick, random);
    if (!blank) {skipped++; continue;}
    if (items.length < options.blankCount) items.push({...blank, number: items.length + 1, cardId: card.id, type: own, sentence: blank.before + blank.answer + blank.after, hint: options.blankHint === 'back' ? clean(card.back).trim() : ''});
  }
  return {code: printHash(JSON.stringify(['blank', options.seed, start, end, options.shuffle, options.blankCount, options.blankHint, options.blankPick, cards.map(card => [card.id, card.front, card.back, card.example])])), total: items.length, skipped, items};
}
/** Underscores about a quarter longer than the answer, so the blank does not give its length away exactly. */
const blankMarks = (item: CardBlankItem, hint: CardPrintOptions['blankHint'], size: number, measure: CardPrintMeasure) => (hint === 'initial' ? graphemes(item.answer)[0] : '') + '_'.repeat(Math.max(6, Math.ceil(measure(item.answer, size) * 1.25 / Math.max(measure('_', size), .1))));
function blankBlock(input: CardPrintInput, item: CardBlankItem, width: number, measure: CardPrintMeasure, scale: number): CardPrintBlock {
  const size = 10.5 * scale, small = size * .86, lead = size * 1.55, indent = size * 2.15, body = width - indent, ops: CardPrintOp[] = [text(0, -size, size, `${item.number}.`, {bold: true})];
  let y = 0;
  for (const line of wrapPrintText(item.before + blankMarks(item, input.options.blankHint, size, measure) + item.after, body, size, measure)) {ops.push(text(indent, -(y + size), size, line)); y += lead;}
  if (item.hint) for (const line of wrapPrintText(item.type === 'word' ? `(${item.hint})` : item.hint, body, small, measure)) {ops.push(text(indent, -(y + small - 2), small, line, {gray: .3})); y += small * 1.4;}
  return {height: y + 2, ops};
}
function blankKeyRow(item: CardBlankItem, width: number, measure: CardPrintMeasure, scale: number): CardPrintBlock {
  const size = 10 * scale, small = size * .8, indent = size * 2.3, ops: CardPrintOp[] = [text(0, -size, size, `${item.number}.`, {bold: true})];
  let y = 0;
  for (const line of wrapPrintText(item.answer, width - indent, size, measure, true)) {ops.push(text(indent, -(y + size), size, line, {bold: true})); y += size * 1.4;}
  for (const line of fitLines(item.sentence, width - indent, small, 2, measure)) {ops.push(text(indent, -(y + small), small, line, {gray: .4})); y += small * 1.35;}
  return {height: y + 2, ops};
}
function blankLayout(input: CardPrintInput, measure: CardPrintMeasure): CardPrintLayout {
  const key = input.options.kind === 'blankKey', test = generateCardBlankTest(input.cards, input.type, input.options, input.types), heading = input.copy(key ? 'printBlankKey' : 'printSheetBlank');
  const head = printSheetHead(heading, test.code, input.copy('printQuestionTotal').replace('{n}', String(test.total)), input.title, input.copy, measure, key ? null : TEST_FIELDS);
  const {columns, blocks} = fitBlocks(key ? [2, 1] : [1], BODY - head.height - 30, width => [...(key || !test.total ? [] : [() => bandBlock(`[1${test.total > 1 ? `-${test.total}` : ''}] ${input.copy('printAskBlank')}`, width, measure)]), ...test.items.map(item => (scale: number) => key ? blankKeyRow(item, width, measure, scale) : blankBlock(input, item, width, measure, scale))]);
  return {pages: withFooters(assemble(blocks, columns, head, key ? 7 : 13, null, key), `${input.title} · ${key ? `${heading} · ` : ''}${input.copy('printFormCode')} ${test.code}`, measure), code: test.code, truncated: 0, shortChoices: 0, total: test.total, skipped: test.skipped};
}

// Worksheets: writing practice and the English four-line guide (사선지).
const X_HEIGHT = .523; // Helvetica's x-height, so a model word's small letters fill the guide's middle band.
/** The English four-line guide drawn after public/cards/v1/cards-print-lines.svg: solid top and bottom lines, dashed middle lines. `top` is a downward offset. */
export function guideLines(x: number, top: number, width: number, gap: number): CardPrintOp[] {
  return [0, 1, 2, 3].map(index => ({t: 'line', x1: x, y1: -(top + index * gap), x2: x + width, y2: -(top + index * gap), ...(index % 3 ? {width: .45, gray: .5, dash: [4, 3]} : {width: .8, gray: .3})}));
}
/** Writing space below `top`: four-line guides for English, ruled lines otherwise. A model is printed in light gray to trace, at the start of the first strip for a word, or on strips of its own for a sentence, before `count` empty strips. Text longer than three strips is not traced. */
export function writingStrips(model: string, x: number, top: number, width: number, count: number, measure: CardPrintMeasure, latin: boolean, gap = 9) {
  const strip = latin ? gap * 3 : gap * 2.6, between = latin ? gap * 1.3 : gap, size = latin ? gap / X_HEIGHT : gap * 1.6, ops: CardPrintOp[] = [];
  const wrapped = model ? wrapPrintText(model, width - 8, size, measure) : [], lines = wrapped.length > 3 ? [] : wrapped, own = lines.length > 1 || (lines[0] !== undefined && measure(lines[0], size) > width * .55) ? lines.length : 0;
  let y = top;
  for (let index = 0; index < count + own; index++) {
    ops.push(...(latin ? guideLines(x, y, width, gap) : [{t: 'line', x1: x, y1: -(y + strip), x2: x + width, y2: -(y + strip), width: .6, gray: .45} as CardPrintOp]));
    if (lines[index] !== undefined && (own || !index)) ops.push(text(x + 4, latin ? -(y + gap * 2) : -(y + strip - 4), size, lines[index], {gray: .66}));
    y += strip + between;
  }
  return {ops, height: y - between - top};
}
function practiceRow(input: CardPrintInput, card: CardEntry, number: number, width: number, measure: CardPrintMeasure, scale: number): CardPrintBlock {
  const size = 11 * scale, small = size * .84, numberWidth = 22, left = width * .32, pad = 8, latin = isLatinText(card.front);
  const stacked = (input.types?.[card.id] ?? input.type) === 'sentence' || measure(clean(card.front), size, true) > left - numberWidth - 8, textWidth = stacked ? width - numberWidth : left - numberWidth - 8;
  const ops: CardPrintOp[] = [text(0, -(pad + size), size * .8, String(number), {gray: .4})];
  let y = pad;
  for (const line of wrapPrintText(card.front, textWidth, size, measure, true)) {ops.push(text(numberWidth, -(y + size), size, line, {bold: true})); y += size * 1.35;}
  for (const line of fitLines(card.back, textWidth, small, 3, measure)) {ops.push(text(numberWidth, -(y + small), small, line, {gray: .3})); y += small * 1.38;}
  const x = stacked ? numberWidth : left, strips = writingStrips(input.options.trace ? card.front : '', x, stacked ? y + 4 : pad + 1, width - x, input.options.writeLines, measure, latin);
  ops.push(...strips.ops);
  const height = Math.max(y, (stacked ? y + 4 : pad + 1) + strips.height) + pad;
  return {height, ops: [...ops, {t: 'line', x1: 0, y1: -height, x2: width, y2: -height, width: .5, gray: .75}]};
}
function practiceLayout(input: CardPrintInput, measure: CardPrintMeasure): CardPrintLayout {
  const {start, end} = printRange(input.options, input.cards.length), selected = input.cards.slice(start - 1, end);
  const head = printSheetHead(input.copy('printSheetPractice'), null, input.copy('printCardTotal').replace('{n}', String(selected.length)), input.title, input.copy, measure, WORK_FIELDS);
  const {blocks} = fitBlocks([1], BODY - head.height - 30, width => [() => bandBlock(input.copy('printAskPractice'), width, measure), ...selected.map((card, index) => (scale: number) => practiceRow(input, card, start + index, width, measure, scale))]);
  return {pages: withFooters(assemble(blocks, 1, head, 0), `${input.title} · ${input.copy('printSheetPractice')}`, measure), code: null, truncated: 0, shortChoices: 0, total: selected.length};
}
const LINE_GAP = 12;
function linesRow(input: CardPrintInput, card: CardEntry, number: number, width: number, measure: CardPrintMeasure): CardPrintBlock {
  const backFirst = !isLatinText(card.front) && isLatinText(card.back), model = clean(backFirst ? card.back : card.front).trim(), other = clean(backFirst ? card.front : card.back).trim(), numeral = `${number}.`;
  const shown = fitLines(model, width * .6, 9.5, 1, measure, true)[0] ?? '', modelX = measure(numeral, 9, true) + 5, otherX = modelX + measure(shown, 9.5, true) + 9;
  const strips = writingStrips(input.options.trace ? model : '', 0, 17, width, input.options.writeLines, measure, true, LINE_GAP);
  return {height: 17 + strips.height + 4, ops: [text(0, -10, 9, numeral, {bold: true, gray: .35}), text(modelX, -10, 9.5, shown, {bold: true}), text(otherX, -10, 9, fitLines(other, width - otherX, 9, 1, measure)[0] ?? '', {gray: .35}), ...strips.ops]};
}
function linesLayout(input: CardPrintInput, measure: CardPrintMeasure): CardPrintLayout {
  const {start, end} = printRange(input.options, input.cards.length), selected = input.cards.slice(start - 1, end), blank = input.options.linesMode === 'blank';
  const head = printSheetHead(input.copy('printSheetLines'), null, blank ? '' : input.copy('printCardTotal').replace('{n}', String(selected.length)), input.title, input.copy, measure, WORK_FIELDS), gap = 14;
  const room = BODY - head.height - 24, strip = LINE_GAP * 3, empty = Math.floor((room - 30 + gap) / (strip + gap));
  const blocks: CardPrintBlock[] = [bandBlock(input.copy('printAskLines'), INNER, measure), ...(blank ? Array.from({length: empty}, () => ({height: strip, ops: guideLines(0, 0, INNER, LINE_GAP)})) : selected.map((card, index) => linesRow(input, card, start + index, INNER, measure)))];
  return {pages: withFooters(assemble(blocks, 1, head, gap), `${input.title} · ${input.copy('printSheetLines')}`, measure), code: null, truncated: 0, shortChoices: 0, total: blank ? 0 : selected.length};
}
