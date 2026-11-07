import { createHash, randomBytes } from 'node:crypto';
import { ApiError } from './policy';
import type { CardEntry, CardRequiredModes, CardStudyMode } from '../cards-types';

/**
 * 학부모 링크와 카드놀이 보말의 순수 규칙. 서버(cards-shares.ts, cards-rewards.ts)와 단위 테스트가 같이 쓴다.
 * 링크 토큰은 256비트 난수이고 저장소에는 SHA-256 해시만 남는다. 원래 토큰은 만들 때 한 번만 선생님께 돌려준다.
 */
export const SHARE_DEFAULT_DAYS = 14, SHARE_MAX_DAYS = 60, SHARE_NOTE_MAX = 300, SHARE_PRACTICE_WORDS = 8;
export const SHARE_NAME_MODES = ['given', 'full', 'none'] as const;
export type ShareNameMode = typeof SHARE_NAME_MODES[number];
export type ShareState = 'active' | 'expired' | 'revoked';
const MODES: CardStudyMode[] = ['memorize', 'recall', 'spell'];
const DAY = 86_400_000;

export const newShareToken = () => randomBytes(32).toString('base64url');
export const isShareToken = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export const shareTokenHash = (token: string) => createHash('sha256').update(`cards-parent:${token}`).digest('hex');

export function shareDays(value: unknown) {
  if (value === undefined || value === null) return SHARE_DEFAULT_DAYS;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > SHARE_MAX_DAYS) throw new ApiError(400, `기간은 1~${SHARE_MAX_DAYS}일로 정해 주세요.`, 'SHARE_DAYS');
  return value;
}
export const shareExpiry = (days: number, now = Date.now()) => new Date(now + days * DAY).toISOString();
export function shareNameMode(value: unknown): ShareNameMode {
  if (value === undefined || value === null) return 'given';
  if (!SHARE_NAME_MODES.includes(value as ShareNameMode)) throw new ApiError(400, '이름 표시 방법을 골라 주세요.', 'SHARE_NAME');
  return value as ShareNameMode;
}
export function shareNote(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new ApiError(400, '한마디를 확인해 주세요.', 'SHARE_NOTE');
  // Control characters out, newlines kept; the page renders it as plain text.
  const clean = value.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim();
  if (clean.length > SHARE_NOTE_MAX) throw new ApiError(400, `한마디는 ${SHARE_NOTE_MAX}자까지 쓸 수 있어요.`, 'SHARE_NOTE');
  return clean;
}
export function shareState(share: { expiresAt?: unknown; revokedAt?: unknown }, now = Date.now()): ShareState {
  if (share.revokedAt) return 'revoked';
  const end = typeof share.expiresAt === 'string' ? Date.parse(share.expiresAt) : NaN;
  return Number.isFinite(end) && end > now ? 'active' : 'expired';
}
/**
 * The name a parent sees. given (default): a Korean name without its one-syllable surname (김민준 → 민준), otherwise the first word.
 * full: as on the roster. none: empty, and the page says "우리 아이".
 */
export function shareName(name: unknown, mode: ShareNameMode) {
  const value = typeof name === 'string' ? name.trim() : '';
  if (mode === 'none' || !value) return '';
  if (mode === 'full') return value.slice(0, 40);
  if (/^[가-힣]{2,4}$/.test(value)) return value.slice(1);
  return value.split(/\s+/)[0].slice(0, 40);
}
/** Share of the required study done, 0-100, or null when nothing is required. Extra study past a mode's goal does not make up for another mode. */
export function requiredStudyPercent(completed: Record<CardStudyMode, number>, required: CardRequiredModes) {
  const goal = MODES.reduce((sum, mode) => sum + Math.max(0, required[mode]?.requiredCount ?? 0), 0);
  if (!goal) return null;
  const done = MODES.reduce((sum, mode) => sum + Math.min(Math.max(0, completed[mode] ?? 0), Math.max(0, required[mode]?.requiredCount ?? 0)), 0);
  return Math.floor(done / goal * 100);
}
/** Most-missed cards first, ties in set order, at most `limit`. Cards no longer in the snapshot are dropped. */
export function practiceWords(mistakes: unknown, cards: CardEntry[], limit = SHARE_PRACTICE_WORDS) {
  const counts = mistakes && typeof mistakes === 'object' ? mistakes as Record<string, unknown> : {};
  return cards.map((card, index) => ({ card, index, count: Number(counts[card.id]) || 0 })).filter(row => row.count > 0)
    .sort((a, b) => b.count - a.count || a.index - b.index).slice(0, limit)
    .map(row => ({ front: row.card.front, back: row.card.back, count: row.count }));
}

// 보말: 배부마다 필수 학습 첫 완료 +5, 테스트 목표 첫 달성 +10. 게임 점수·반복 학습·복습에는 주지 않는다.
export const CARD_REWARDS = { study: 5, goal: 10 } as const;
export type CardRewardKind = keyof typeof CARD_REWARDS;
export const cardRewardLedgerId = (kind: CardRewardKind, distributionId: string) => `cards_${kind}_${distributionId}`;
type Flags = { studyComplete: boolean; goalReached: boolean };
/** The rewards this save just earned: a flag that turned on now. A set with nothing required, or a goal of 0, pays nothing. */
export function cardRewardKinds(before: Flags, after: Flags, required: CardRequiredModes, goalScore: number): CardRewardKind[] {
  const kinds: CardRewardKind[] = [];
  if (!before.studyComplete && after.studyComplete && MODES.some(mode => (required[mode]?.requiredCount ?? 0) > 0)) kinds.push('study');
  if (!before.goalReached && after.goalReached && goalScore > 0) kinds.push('goal');
  return kinds;
}
