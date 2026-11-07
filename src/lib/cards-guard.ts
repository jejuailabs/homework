import { isTestOvertime } from './cards-logic';
import type { CardDirection, CardSnapshot, CardTestAttempt } from './cards-types';

// 시험 정답 보호. 테스트를 푸는 동안(시작했고 제한 시간 + 여유 안) 그 학생에게 가는 응답에서 답이 될 수 있는 것을 뺀다.
// 시험 전·후의 학습은 일부러 열어 둔다. 카드 앞·뒷면이 학습용으로 기기에 오는 것은 그대로다.

/** A started attempt still within its time. No time limit (or an old attempt without the field) stays active until it is submitted. */
export function cardTestActive(attempt: { status?: string; startedAt?: string; timeLimitSeconds?: number | null } | null | undefined, time = Date.now()) {
  return !!attempt && attempt.status === 'started' && !isTestOvertime(String(attempt.startedAt ?? ''), attempt.timeLimitSeconds, time);
}
/** Keeps only the side the test shows as the prompt; the answer side, examples and alternatives go. Card IDs and order stay. */
export function redactCardSnapshot(snapshot: CardSnapshot, direction: CardDirection): CardSnapshot {
  return { ...snapshot, cards: snapshot.cards.map(card => ({ id: card.id, front: direction === 'front-back' ? card.front : '', back: direction === 'back-front' ? card.back : '', example: '', alternatives: [] })) };
}
/** Another attempt seen while one is running: the score stays, the per-question answers (own answers that were right included) wait. */
export function sealedAttempt(attempt: CardTestAttempt): CardTestAttempt {
  const { results: _results, ...rest } = attempt;
  return { ...rest, answersVisible: false };
}
