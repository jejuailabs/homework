import type {AnswerRecord, LessonConcept, LessonContent, LessonQuestion, LessonRun, PublicQuestion, QuestionBody, QuestionKind, ReviewItem, ReviewRating} from './types';

export const CONCEPT_MIN = 3, CONCEPT_MAX = 6, QUESTION_MIN = 5, QUESTION_MAX = 10;
/** Days until the next review: a fully unknown point returns weekly, a shaky one every two weeks. */
export const REVIEW_DAYS: Record<Exclude<ReviewRating, 'know'>, number> = {unknown: 7, unsure: 14};
export const GRADUATE_STREAK = 2, DAILY_REVIEW_LIMIT = 10, LESSON_REWARD = 1;
export const SUBJECTS = ['국어', '수학', '사회', '과학', '영어', '도덕', '음악', '미술', '체육', '실과', '기타'] as const;
export const RATINGS: ReviewRating[] = ['know', 'unsure', 'unknown'];

export class LessonReviewError extends Error {constructor(message: string, readonly code = 'LESSON_REVIEW_INVALID', readonly status = 400) {super(message);}}

export function reviewDate(now = new Date()) {return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);}
export function addDays(date: string, days: number) {const at = new Date(`${date}T00:00:00Z`); at.setUTCDate(at.getUTCDate() + days); return at.toISOString().slice(0, 10);}

/** A wrong answer can still feel familiar, but it can never count as fully understood. */
export function effectiveRating(correct: boolean, rating: ReviewRating): ReviewRating {return !correct && rating === 'know' ? 'unsure' : rating;}
export function isRating(value: unknown): value is ReviewRating {return value === 'know' || value === 'unsure' || value === 'unknown';}

export function publicQuestion(question: LessonQuestion, twin = false): PublicQuestion {
  const body = twin ? question.twin : question;
  return {id: question.id, kind: question.kind, prompt: body.prompt, choices: [...body.choices]};
}
export function questionBody(question: LessonQuestion, twin = false): QuestionBody {return twin ? question.twin : question;}

/** Questions the pupil did not fully understand in the pretest drive both the cards and the retest. */
export function weakQuestions(content: LessonContent, pretest: Record<string, AnswerRecord>): LessonQuestion[] {
  return content.questions.filter(question => pretest[question.id]?.rating && pretest[question.id].rating !== 'know');
}
export function cardsFor(content: LessonContent, pretest: Record<string, AnswerRecord>): LessonConcept[] {
  const ids = new Set(weakQuestions(content, pretest).map(question => question.conceptId));
  return content.concepts.filter(concept => ids.has(concept.id));
}
export function phaseComplete(questions: LessonQuestion[], answers: Record<string, AnswerRecord>) {return questions.every(question => !!answers[question.id]?.rating);}

/** The retest rating wins for questions that were retested; otherwise the pretest rating stands. */
export function finalRatings(content: LessonContent, run: Pick<LessonRun, 'pretest' | 'retest'>): Record<string, ReviewRating> {
  return Object.fromEntries(content.questions.map(question => [question.id, run.retest[question.id]?.rating || run.pretest[question.id]?.rating || 'unknown']));
}

export function scheduleItem(lessonId: string, question: LessonQuestion, rating: ReviewRating, today: string): ReviewItem | null {
  if (rating === 'know') return null;
  return {id: `${lessonId}_${question.id}`, lessonId, questionId: question.id, conceptId: question.conceptId, rating, dueDate: addDays(today, REVIEW_DAYS[rating]), streak: 0, reviews: 0, graduated: false, lastReviewedAt: null, pending: null};
}

/** Two fully understood reviews in a row graduate the item; anything less restarts the streak. */
export function nextReview(item: ReviewItem, rating: ReviewRating, today: string): ReviewItem {
  const reviews = item.reviews + 1;
  if (rating === 'know') {
    const streak = item.streak + 1;
    return {...item, rating, streak, reviews, graduated: streak >= GRADUATE_STREAK, dueDate: addDays(today, REVIEW_DAYS.unsure), lastReviewedAt: today, pending: null};
  }
  return {...item, rating, streak: 0, reviews, graduated: false, dueDate: addDays(today, REVIEW_DAYS[rating]), lastReviewedAt: today, pending: null};
}

const clean = (value: unknown, label: string, max: number, optional = false) => {
  if (typeof value !== 'string') {if (optional) return ''; throw new LessonReviewError(`${label}을(를) 적어 주세요.`);}
  const text = value.replace(/\r\n?/g, '\n').trim();
  if (!text && !optional) throw new LessonReviewError(`${label}을(를) 적어 주세요.`);
  if (text.length > max) throw new LessonReviewError(`${label}은(는) ${max}자까지 적을 수 있어요.`);
  return text;
};
function body(value: unknown, kind: QuestionKind, where: string): QuestionBody {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const prompt = clean(raw.prompt, `${where} 문제`, 300);
  const choices = kind === 'ox' ? ['O', 'X'] : Array.isArray(raw.choices) ? raw.choices.map((choice, index) => clean(choice, `${where} 보기 ${index + 1}`, 120)) : [];
  if (kind === 'choice' && (choices.length !== 4 || new Set(choices).size !== 4)) throw new LessonReviewError(`${where}에는 서로 다른 보기 4개가 필요해요.`);
  const answer = Number(raw.answer);
  if (!Number.isInteger(answer) || answer < 0 || answer >= choices.length) throw new LessonReviewError(`${where}의 정답을 골라 주세요.`);
  return {prompt, choices, answer, explanation: clean(raw.explanation, `${where} 해설`, 400)};
}

/** Same check for AI output and teacher edits: bounded counts, linked concepts, unique ids. */
export function validateContent(value: unknown): LessonContent {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (!Array.isArray(raw.concepts) || raw.concepts.length < CONCEPT_MIN || raw.concepts.length > CONCEPT_MAX) throw new LessonReviewError(`핵심 개념은 ${CONCEPT_MIN}~${CONCEPT_MAX}개로 정리해 주세요.`);
  if (!Array.isArray(raw.questions) || raw.questions.length < QUESTION_MIN || raw.questions.length > QUESTION_MAX) throw new LessonReviewError(`문제는 ${QUESTION_MIN}~${QUESTION_MAX}개로 만들어 주세요.`);
  const concepts = raw.concepts.map((item, index) => {
    const concept = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {id: `c${index + 1}`, title: clean(concept.title, `개념 ${index + 1} 이름`, 60), summary: clean(concept.summary, `개념 ${index + 1} 설명`, 500), example: clean(concept.example, `개념 ${index + 1} 예시`, 300, true)};
  });
  const conceptIds = new Map(raw.concepts.map((item, index) => [String((item as Record<string, unknown>)?.id ?? `c${index + 1}`), `c${index + 1}`]));
  const questions = raw.questions.map((item, index) => {
    const question = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const kind: QuestionKind = question.kind === 'ox' ? 'ox' : 'choice', where = `${index + 1}번`;
    const conceptId = conceptIds.get(String(question.conceptId)) || (concepts.some(concept => concept.id === question.conceptId) ? String(question.conceptId) : '');
    if (!conceptId) throw new LessonReviewError(`${where} 문제와 연결할 개념을 골라 주세요.`);
    return {id: `q${index + 1}`, conceptId, kind, ...body(question, kind, where), twin: body(question.twin, kind, `${where} 쌍둥이`)};
  });
  return {concepts, questions};
}

export function validateMeta(value: Record<string, unknown>) {
  return {subject: clean(value.subject, '과목', 20), unit: clean(value.unit, '단원', 80), title: clean(value.title, '차시 제목', 80)};
}
