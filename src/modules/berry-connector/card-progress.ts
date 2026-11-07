/** Class-wide picture of one card distribution for Berry. Takes numbers only, so no student name can pass through. */
export type CardLearner = {number: number; unfinished: boolean; goalReached: boolean; bestScore: number | null; late?: boolean; mistakes?: Record<string, unknown>};
export type CardWord = {id: string; front: string; back: string};

const MOST_MISSED = 5;

export function classCardProgress(learners: CardLearner[], cards: CardWord[], labelOf: (number: number) => string) {
  const scores = learners.flatMap(row => typeof row.bestScore === 'number' ? [row.bestScore] : []);
  const missed = new Map<string, {misses: number; students: number}>(), known = new Map(cards.map(card => [card.id, card]));
  for (const row of learners) for (const [cardId, count] of Object.entries(row.mistakes ?? {})) {
    if (!known.has(cardId) || typeof count !== 'number' || count <= 0) continue;
    const total = missed.get(cardId) ?? {misses: 0, students: 0};
    missed.set(cardId, {misses: total.misses + count, students: total.students + 1});
  }
  const unfinished = learners.filter(row => row.unfinished).sort((a, b) => a.number - b.number);
  return {
    students: learners.length, finished: learners.length - unfinished.length, unfinished: unfinished.length,
    unfinished_students: unfinished.map(row => labelOf(row.number)),
    goal_reached: learners.filter(row => row.goalReached).length, late: learners.filter(row => row.late).length, tested: scores.length,
    average_best_score: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
    most_missed: [...missed].sort(([, a], [, b]) => b.misses - a.misses || b.students - a.students).slice(0, MOST_MISSED)
      .map(([cardId, total]) => ({word: known.get(cardId)!.front, meaning: known.get(cardId)!.back, ...total})),
  };
}
