import {BerryError} from './policy';

/**
 * Berry's "배부" settings, turned into what POST /api/cards/distributions takes. Anything the teacher leaves out uses
 * the same defaults as the app's "우리 반에 추가" dialog (cards-publish.tsx): the server's own default is 0 required
 * cards, which would quietly turn every Berry distribution into optional study.
 */
type Data = Record<string, any>;
type Direction = 'front-back' | 'back-front';
type Release = 'immediate' | 'after-due' | 'never';
const MODES = ['memorize', 'recall', 'spell'] as const;
const MODE_LABEL = {memorize: '암기', recall: '리콜', spell: '스펠'} as const;
const RELEASE_LABEL: Record<Release, string> = {immediate: '제출 직후', 'after-due': '마감 이후', never: '공개 안 함'};
const DIRECTION_LABEL: Record<Direction, string> = {'front-back': '앞면 → 뒷면', 'back-front': '뒷면 → 앞면'};

function whole(value: unknown, fallback: number, min: number, max: number, label: string) {
  const number = value ?? fallback;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < min || number > max) throw new BerryError(`${label}은(는) ${min}~${max} 사이의 정수로 알려 주세요.`);
  return number;
}
function direction(value: unknown, fallback: Direction, label: string): Direction {
  const result = value ?? fallback;
  if (result !== 'front-back' && result !== 'back-front') throw new BerryError(`${label} 방향은 front-back 또는 back-front로 보내 주세요.`);
  return result;
}
function section(value: unknown, name: string): Data {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BerryError(`${name}을(를) 확인해 주세요.`);
  return value as Data;
}

export function cardDistributionSettings(args: {required_modes?: unknown; test?: unknown}, cardCount: number, hasDue: boolean) {
  const modes = section(args.required_modes, 'required_modes');
  const unknown = Object.keys(modes).find(key => !(MODES as readonly string[]).includes(key));
  if (unknown) throw new BerryError(`required_modes에는 memorize, recall, spell만 넣어 주세요: ${unknown}`);
  const requiredModes = Object.fromEntries(MODES.map(mode => {
    const raw = section(modes[mode], mode), label = MODE_LABEL[mode];
    const rangeStart = whole(raw.range_start, 1, 1, cardCount, `${label} 시작 카드`);
    const rangeEnd = whole(raw.range_end, cardCount, rangeStart, cardCount, `${label} 마지막 카드`);
    // Spell stays optional unless asked for, as in the dialog; naming it without a count means one round of its range.
    const size = rangeEnd - rangeStart + 1, fallback = mode === 'spell' && modes[mode] === undefined ? 0 : size;
    return [mode, {requiredCount: whole(raw.count, fallback, 0, size * 10, `${label} 필수 학습량`), direction: direction(raw.direction, mode === 'spell' ? 'back-front' : 'front-back', label), rangeStart, rangeEnd}];
  })) as Record<typeof MODES[number], {requiredCount: number; direction: Direction; rangeStart: number; rangeEnd: number}>;
  const raw = section(args.test, 'test');
  if (raw.require_study !== undefined && typeof raw.require_study !== 'boolean') throw new BerryError('require_study는 true/false로 보내 주세요.');
  const answerRelease = (raw.answer_release ?? 'immediate') as Release;
  if (!(answerRelease in RELEASE_LABEL)) throw new BerryError('answer_release는 immediate, after-due, never 중에서 골라 주세요.');
  if (answerRelease === 'after-due' && !hasDue) throw new BerryError('마감 후 정답 공개에는 마감(due_at)이 필요해요.');
  const test = {questionCount: whole(raw.question_count, Math.min(20, cardCount), 1, cardCount, '테스트 문항 수'), goalScore: whole(raw.goal_score, 80, 0, 100, '목표 점수'), maxAttempts: whole(raw.max_attempts, 3, 1, 20, '응시 횟수'), requireStudy: raw.require_study === true, direction: direction(raw.direction, 'back-front', '테스트'), answerRelease};
  const study = MODES.map(mode => {
    const rule = requiredModes[mode], range = rule.rangeStart === 1 && rule.rangeEnd === cardCount ? '' : ` (${rule.rangeStart}~${rule.rangeEnd}번)`;
    return `${MODE_LABEL[mode]} ${rule.requiredCount ? `${rule.requiredCount}${range}` : '선택'}`;
  }).join(' · ');
  const lines = [`필수 학습: ${study}`, `테스트: ${test.questionCount}문항 · 목표 ${test.goalScore}점 · ${test.maxAttempts}회 · ${DIRECTION_LABEL[test.direction]} · 정답 ${RELEASE_LABEL[answerRelease]}${test.requireStudy ? ' · 필수 학습 후 응시' : ''}`];
  return {requiredModes, test, lines};
}
