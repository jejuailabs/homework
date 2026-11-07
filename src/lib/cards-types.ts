export type CardSetType = 'word' | 'sentence';
export type CardStudyMode = 'memorize' | 'recall' | 'spell';
export type CardDirection = 'front-back' | 'back-front';
export type CardEntry = { id: string; front: string; back: string; example: string; alternatives: string[] };
export type CardFolder = { id: string; name: string; createdAt: string; updatedAt: string };
export type CardSetSummary = { id: string; title: string; description: string; type: CardSetType; cardCount: number; folderId: string | null; version: number; versionId: string; archived: boolean; createdAt: string; updatedAt: string };
export type CardSet = CardSetSummary & { cards: CardEntry[] };
export type CardModeRequirement = { requiredCount: number; direction: CardDirection; rangeStart: number; rangeEnd: number };
export type CardRequiredModes = Record<CardStudyMode, CardModeRequirement>;
export type CardTestFormat = 'written' | 'choice';
export type CardTestSettings = { questionCount: number; goalScore: number; maxAttempts: number; requireStudy: boolean; direction: CardDirection; answerRelease: 'immediate' | 'after-due' | 'never'; format?: CardTestFormat; timeLimitSeconds?: number | null };
export type CardAfterDue = 'open' | 'late' | 'lock';
export type CardSnapshot = { title: string; description: string; type: CardSetType; cards: CardEntry[] };
export type CardDistributionSummary = { id: string; classId: string; className: string; setId: string; setVersion: number; versionId: string; title: string; type: CardSetType; cardCount: number; targetCount: number; requiredModes: CardRequiredModes; test: CardTestSettings; dueAt: string | null; afterDue: CardAfterDue; allStudents: boolean; active: boolean; createdAt: string; updatedAt: string; speechRate?: number | null; carriedFrom?: { className: string } | null };
export type CardDistribution = CardDistributionSummary & { snapshot: CardSnapshot; targetStudentIds: string[] };
export type CardCoverage = Record<CardStudyMode, Record<string, number>>;
export type CardProgress = {
  counts: Record<CardStudyMode, number>;
  correctCounts: Record<CardStudyMode, number>;
  completedCounts: Record<CardStudyMode, number>;
  attempts: number;
  bestScore: number | null;
  latestScore: number | null;
  starredCardIds: string[];
  lastPosition: { mode: CardStudyMode; cardId: string } | null;
  updatedAt: string | null;
  lateAt: string | null;
  studyComplete: boolean;
  goalReached: boolean;
  /** Set mastery 0-100: the average card level out of 4. Old records without card states read 0. */
  mastery: number;
  /** Cards whose review date has come (Seoul date). */
  reviewDue: number;
};
/** One card's mastery and next review, kept on the progress record. l: level 0-4 that never goes down; b: step in CARD_REVIEW_DAYS, reset by a miss; d: next review date (YYYY-MM-DD, Seoul). */
export type CardReviewState = { l: number; b: number; d: string };
export type CardReviewStates = Record<string, CardReviewState>;
/** Missed cards across a student's sets: distributionId → cardId → the Seoul date of the latest miss. */
export type CardMisses = Record<string, Record<string, string>>;
export type CardMissSummary = { total: number; weeks: { week: string; count: number }[] };
export type CardReviewItem = { distributionId: string; title: string; direction: CardDirection; card: CardEntry; choices: string[] | null; missedOn: string | null };
export type CardStudentDistribution = CardDistributionSummary & { progress: CardProgress };
export type CardStudyResult = { cardId: string; correct: boolean; expectedAnswer: string };
export type CardTestQuestion = { id: string; cardId: string; prompt: string; choices?: string[] };
export type CardTestResult = { questionId: string; answer: string; correct: boolean; expectedAnswer?: string };
export type CardTestAttempt = { id: string; status: 'started' | 'submitted'; number: number; retryWrong: boolean; questions: CardTestQuestion[]; score: number | null; answersVisible: boolean; results?: CardTestResult[]; startedAt: string; submittedAt: string | null; timeLimitSeconds?: number | null; overtime?: boolean };
export type CardReportStudent = { id: string; name: string; number: number; disabled: boolean; progress: CardProgress; attempts: CardTestAttempt[]; mistakes: { cardId: string; count: number }[]; levels: Record<string, number> };
