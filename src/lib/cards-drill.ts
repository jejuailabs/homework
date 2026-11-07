// 연습문제(드릴) 세트: five question kinds stored on ordinary cards, so versions, distributions, tests and reports keep working.
// A drill card's front is the question (지시문), its example the passage (지문), and `drill` holds the kind and its answer data.
// The back is the display answer the server derives, so a report can show it like any card. Pure: editor, server and screens share it.
export type CardDrillKind = 'choice' | 'ox' | 'choice-blank' | 'short' | 'short-blank';
export const CARD_DRILL_KINDS: CardDrillKind[] = ['choice', 'ox', 'choice-blank', 'short', 'short-blank'];
/** choices/answer: 객관식 and O/X. blanks: one entry per [blank] in the passage; `wrong` are the other options of a 객관식 빈칸. */
export type CardDrill = {kind: CardDrillKind; choices?: string[]; answer?: number; blanks?: {wrong: string[]}[]};
export type CardDrillQuestion = {kind: CardDrillKind; passage?: string; choices?: string[]; blanks?: {choices?: string[]}[]};
type DrillCard = {front: string; back: string; example: string; alternatives: string[]; drill?: CardDrill};

export const CARD_DRILL_CHOICES = {min: 2, max: 5};
export const CARD_DRILL_BLANKS = 10;
export const OX_CHOICES = ['O', 'X'];
const BLANK = /\[([^[\]]+)\]/gu;
const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');

/** The blanks of a passage: `I [have] a dog and [two/2] cats.` → [['have'], ['two', '2']]. The first answer is the one shown. */
export function passageBlanks(passage: string): string[][] {
  return [...passage.matchAll(BLANK)].map(match => match[1].split('/').map(answer => answer.trim()).filter(Boolean)).filter(answers => answers.length);
}
/** The passage a student sees: each blank becomes ( 1 ), ( 2 ) … so the answers never travel with the question. */
export function maskPassage(passage: string) {
  let number = 0;
  return passage.replace(BLANK, () => `( ${++number} )`);
}
export const isBlankKind = (kind: CardDrillKind) => kind === 'choice-blank' || kind === 'short-blank';
/** What the teacher sees as the answer and what a report shows. */
export function drillAnswerText(card: Pick<DrillCard, 'back' | 'example' | 'drill'>): string {
  const drill = card.drill;
  if (!drill) return card.back;
  if (drill.kind === 'choice') return drill.choices?.[drill.answer ?? -1] ?? '';
  if (drill.kind === 'ox') return OX_CHOICES[drill.answer ?? -1] ?? '';
  if (isBlankKind(drill.kind)) return passageBlanks(card.example).map(answers => answers[0]).join(', ');
  return card.back;
}
const shuffleWith = <T>(values: T[], random: (max: number) => number) => {const result = [...values]; for (let index = result.length - 1; index > 0; index--) {const other = random(index + 1); [result[index], result[other]] = [result[other], result[index]];} return result;};
/** The question as a student gets it, with choices shuffled by `random` (the server's in a test, the browser's in practice). */
export function drillQuestion(card: DrillCard, random: (max: number) => number): CardDrillQuestion {
  const drill = card.drill!, passage = card.example ? maskPassage(card.example) : '';
  if (drill.kind === 'choice') return {kind: 'choice', ...(passage ? {passage} : {}), choices: shuffleWith(drill.choices ?? [], random)};
  if (drill.kind === 'ox') return {kind: 'ox', ...(passage ? {passage} : {}), choices: [...OX_CHOICES]};
  if (drill.kind === 'short') return {kind: 'short', ...(passage ? {passage} : {})};
  const blanks = passageBlanks(card.example);
  return {kind: drill.kind, passage, blanks: blanks.map((answers, index) => drill.kind === 'choice-blank' ? {choices: shuffleWith([answers[0], ...(drill.blanks?.[index]?.wrong ?? [])], random)} : {})};
}
/** Answers to a blank question travel as a JSON list of strings, one per blank. */
export const blankAnswer = (values: string[]) => JSON.stringify(values);
export function readBlankAnswer(answer: string, count: number): string[] | null {
  try {const value = JSON.parse(answer); return Array.isArray(value) && value.length === count && value.every(item => typeof item === 'string') ? value : null;} catch {return null;}
}
/** One grading rule for practice, tests and reviews: case, outer and repeated spaces never matter. */
export function gradeDrill(card: DrillCard, answer: string): boolean {
  const drill = card.drill;
  if (!drill) return false;
  if (drill.kind === 'choice' || drill.kind === 'ox') return normalize(answer) === normalize(drillAnswerText(card)) && !!drillAnswerText(card);
  if (drill.kind === 'short') return [card.back, ...card.alternatives].some(value => normalize(value) === normalize(answer));
  const blanks = passageBlanks(card.example), given = readBlankAnswer(answer, blanks.length);
  if (!given || !blanks.length) return false;
  // A 객관식 빈칸 is right only with the option it marks as right; a 주관식 빈칸 takes any answer written between the slashes.
  return blanks.every((answers, index) => (drill.kind === 'choice-blank' ? answers.slice(0, 1) : answers).some(value => normalize(value) === normalize(given[index])));
}

/** Checks the drill data of one card and returns it cleaned, or an error message. `front`/`example` are already trimmed. */
export function parseDrill(raw: unknown, card: {front: string; example: string; back: string; alternatives: string[]}): {drill: CardDrill; back: string} | {error: string} {
  const value = raw as Partial<CardDrill> | null;
  if (!value || typeof value !== 'object' || !CARD_DRILL_KINDS.includes(value.kind as CardDrillKind)) return {error: '문항 유형을 골라 주세요.'};
  const kind = value.kind as CardDrillKind;
  if (!card.front) return {error: '문제를 써 주세요.'};
  if (kind === 'choice') {
    const choices = Array.isArray(value.choices) ? value.choices.map(choice => typeof choice === 'string' ? choice.trim() : '').filter(Boolean) : [];
    if (choices.length < CARD_DRILL_CHOICES.min || choices.length > CARD_DRILL_CHOICES.max || choices.some(choice => choice.length > 300)) return {error: `보기는 ${CARD_DRILL_CHOICES.min}~${CARD_DRILL_CHOICES.max}개, 300자까지 써 주세요.`};
    if (new Set(choices.map(normalize)).size !== choices.length) return {error: '같은 보기가 두 번 있어요.'};
    if (!Number.isInteger(value.answer) || value.answer! < 0 || value.answer! >= choices.length) return {error: '정답 보기를 골라 주세요.'};
    return {drill: {kind, choices, answer: value.answer!}, back: choices[value.answer!]};
  }
  if (kind === 'ox') {
    if (value.answer !== 0 && value.answer !== 1) return {error: 'O나 X 가운데 정답을 골라 주세요.'};
    return {drill: {kind, answer: value.answer}, back: OX_CHOICES[value.answer]};
  }
  if (kind === 'short') {
    if (!card.back) return {error: '정답을 써 주세요.'};
    return {drill: {kind}, back: card.back};
  }
  const blanks = passageBlanks(card.example);
  if (!blanks.length) return {error: '지문에 [정답]처럼 대괄호로 빈칸을 넣어 주세요.'};
  if (blanks.length > CARD_DRILL_BLANKS) return {error: `빈칸은 ${CARD_DRILL_BLANKS}개까지 넣을 수 있어요.`};
  if (kind === 'short-blank') return {drill: {kind}, back: blanks.map(answers => answers[0]).join(', ')};
  const rawBlanks = Array.isArray(value.blanks) ? value.blanks : [];
  const cleaned = blanks.map((answers, index) => {
    const wrong = Array.isArray(rawBlanks[index]?.wrong) ? rawBlanks[index]!.wrong.map(option => typeof option === 'string' ? option.trim() : '').filter(Boolean) : [];
    return {wrong: [...new Set(wrong.filter(option => normalize(option) !== normalize(answers[0])))].slice(0, CARD_DRILL_CHOICES.max - 1)};
  });
  if (cleaned.some(blank => !blank.wrong.length)) return {error: '객관식 빈칸마다 틀린 보기를 하나 이상 써 주세요.'};
  return {drill: {kind, blanks: cleaned}, back: blanks.map(answers => answers[0]).join(', ')};
}
