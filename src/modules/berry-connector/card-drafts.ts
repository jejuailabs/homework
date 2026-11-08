import {CARD_AI_REVIEW_MAX, parseCardAiRequest, type CardAiLevel, type CardAiRequest} from '@/lib/cards-ai-draft';
import {BerryError} from './policy';

/** Berry's create_set / create_review_set arguments → the same AI draft request the card editor sends (§39). Pure, so it is tested without Firestore. */
type Data = Record<string, unknown>;
const SUBJECT_NAMES: Record<string, string> = {korean: '국어', math: '수학', social: '사회', science: '과학', hanja: '한자', other: '기타 과목'};
const PREVIEW_ROWS = 30;

const levelOf = (value: unknown): CardAiLevel => {
  if (value === undefined) return 'elementary';
  if (value === 'elementary' || value === 'middle' || value === 'high') return value;
  throw new BerryError('level은 elementary·middle·high 중에서 골라 주세요.');
};
const countOf = (value: unknown, fallback: number, max = 30) => {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > max) throw new BerryError(`count는 1~${max} 사이로 알려 주세요.`);
  return value as number;
};

export function cardSetDraftInput(args: Data): {title: string; request: CardAiRequest; description: string; label: string} {
  const title = typeof args.set_title === 'string' ? args.set_title.trim().slice(0, 120) : '';
  if (!title) throw new BerryError('새 세트 이름(set_title)을 알려 주세요.');
  const level = levelOf(args.level), source = args.source;
  let raw: Data, label: string;
  if (source === 'words') {
    raw = {mode: 'words', level, words: Array.isArray(args.words) ? args.words.map(word => String(word).trim()).filter(Boolean) : []};
    label = `영어 단어 ${(raw.words as string[]).length}개`;
  } else if (source === 'topic') {
    raw = {mode: 'topic', level, topic: args.topic, count: countOf(args.count, 15)};
    label = `영어 주제 "${String(args.topic ?? '').slice(0, 40)}"`;
  } else if (source === 'passage') {
    raw = {mode: 'passage', level, text: args.text, count: countOf(args.count, 15)};
    label = '영어 본문에서 뽑기';
  } else if (source === 'concept') {
    raw = {mode: 'concept', level, subject: args.subject, topic: args.topic ?? '', text: args.text ?? '', count: countOf(args.count, 15)};
    label = `${SUBJECT_NAMES[String(args.subject)] ?? '교과'} 개념어${args.topic ? ` "${String(args.topic).slice(0, 40)}"` : ''}${args.text ? ' · 교과서 내용에서' : ''}`;
  } else throw new BerryError('source(words·topic·passage·concept)를 알려 주세요.');
  const request = parseCardAiRequest(raw);
  if ('error' in request) throw new BerryError(request.error);
  return {title, request, description: `베리가 만든 AI 초안 · ${label}`.slice(0, 500), label};
}

export function reviewDraftInput(args: Data, type: unknown) {
  const count = countOf(args.count, 10, CARD_AI_REVIEW_MAX);
  if (args.rewrite_examples !== undefined && typeof args.rewrite_examples !== 'boolean') throw new BerryError('rewrite_examples는 true나 false로 알려 주세요.');
  return {count, level: levelOf(args.level), rewrite: type === 'word' && args.rewrite_examples !== false};
}

/** The preview card lists what will be saved, one card per line; long sets show the first rows and a count. */
export function setDraftPreview(cards: {front: string; back: string}[]) {
  const shown = cards.slice(0, PREVIEW_ROWS).map((card, index) => `${index + 1}. ${card.front} — ${card.back}`);
  return cards.length > PREVIEW_ROWS ? [...shown, `… 외 ${cards.length - PREVIEW_ROWS}장`].join('\n') : shown.join('\n');
}
