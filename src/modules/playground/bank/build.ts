import type {GradeBand, PlayItem, PlayKind} from '../types';

export type BankRow = readonly [prompt: string, answer: string, distractors: readonly string[], hint: string, reveal: string];
/** Append rows; never reorder/remove existing rows because the index forms a permanent ID. */
export function bankItems(kind: PlayKind, band: GradeBand, rows: readonly BankRow[]): PlayItem[] {
  return rows.map(([prompt, answer, distractors, hint, reveal], i) => ({
    id: `${kind}-${band}-${String(i + 1).padStart(3, '0')}`, version: 'bank-v1', kind, gradeBand: band,
    prompt, answers: [answer], choices: [answer, ...distractors], hints: hint ? [hint] : [], reveal,
    source: 'bank', enabled: true,
  }));
}
