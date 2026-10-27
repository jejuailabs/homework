export type ReviewRating = 'know' | 'unsure' | 'unknown';
export type ReviewPhase = 'pretest' | 'cards' | 'retest' | 'done';
export type QuestionKind = 'choice' | 'ox';
export type QuestionBody = {prompt: string; choices: string[]; answer: number; explanation: string};
export type LessonConcept = {id: string; title: string; summary: string; example: string};
export type LessonQuestion = QuestionBody & {id: string; conceptId: string; kind: QuestionKind; twin: QuestionBody};
export type LessonContent = {concepts: LessonConcept[]; questions: LessonQuestion[]};
export type LessonStatus = 'draft' | 'published' | 'hidden';
export type Lesson = LessonContent & {
  id: string; classId: string; subject: string; unit: string; title: string; status: LessonStatus;
  source: 'ai' | 'manual'; createdAt: string; updatedAt: string; publishedAt: string | null;
};
/** What a pupil may see before answering: no answer index, no explanation. */
export type PublicQuestion = {id: string; kind: QuestionKind; prompt: string; choices: string[]};
export type AnswerRecord = {choice: number; correct: boolean; rating?: ReviewRating};
export type LessonRun = {lessonId: string; phase: ReviewPhase; pretest: Record<string, AnswerRecord>; retest: Record<string, AnswerRecord>; startedAt: string; finishedAt: string | null; reward: number};
export type ReviewItem = {
  id: string; lessonId: string; questionId: string; conceptId: string; rating: ReviewRating;
  dueDate: string; streak: number; reviews: number; graduated: boolean; lastReviewedAt: string | null;
  pending?: {date: string; choice: number; correct: boolean} | null;
};
export type LessonSummary = {id: string; subject: string; unit: string; title: string; publishedAt: string | null; phase: ReviewPhase | 'new'; questionCount: number};
export type StudentHome = {lessons: LessonSummary[]; dueCount: number; nextDue: string | null};
export type AnswerResult = {correct: boolean; answer: number; explanation: string};
export type RunView = {
  lesson: {id: string; subject: string; unit: string; title: string};
  phase: ReviewPhase; questions: PublicQuestion[];
  answers: Record<string, AnswerRecord & AnswerResult>;
  cards: LessonConcept[]; summary: {know: number; unsure: number; unknown: number; nextReview: string | null} | null; reward: number;
};
export type DueReview = {itemId: string; lessonTitle: string; subject: string; question: PublicQuestion; answered: (AnswerResult & {choice: number}) | null};
export type TeacherReport = {students: {id: string; name: string; number: number; phase: ReviewPhase | 'new'}[]; questions: {id: string; prompt: string; know: number; unsure: number; unknown: number; correct: number; answered: number}[]};
export type TeacherState = {lessons: Lesson[]; rewardsEnabled: boolean; aiConfigured: boolean};
