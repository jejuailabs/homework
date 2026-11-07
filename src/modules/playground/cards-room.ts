// Turns a card set into room questions. Pure, so the teacher's setup screen and the server that owns the bank agree on what can run.
import {buildCardChoices, cardAnswer, normalizeCardAnswer, shuffleWith} from '../../lib/cards-logic';
import type {CardDirection, CardEntry} from '../../lib/cards-types';
import type {PlayItem} from './types';

export const CARD_ROOM_MAX_QUESTIONS = 30;
export const CARD_ROOM_SECONDS = {min: 10, max: 30, initial: 15};
export const CARD_ROOM_TEAMS = {min: 2, max: 6, initial: 2};
/** 반대항전: two to six classes of the same teacher in one room, each class one team. */
export const CARD_ROOM_VERSUS = {min: 2, max: 6};
/** The classes of a versus room: the host class first, no repeats, two to six. Returns null when the list is not a versus room. */
export function versusClassIds(hostClassId: string, others: unknown): string[] | null {
  if (others === undefined || others === null) return null;
  if (!Array.isArray(others) || others.some(value => typeof value !== 'string')) return [];
  const ids = [...new Set([hostClassId, ...others as string[]])];
  return ids.length >= CARD_ROOM_VERSUS.min && ids.length <= CARD_ROOM_VERSUS.max ? ids : [];
}
/** `answers` under 2 means no question can have a wrong choice; `questions` is the most a room can ask in this direction. */
export function cardRoomCapacity(cards: CardEntry[], direction: CardDirection) {
  return {answers: new Set(cards.map(card => normalizeCardAnswer(cardAnswer(card, direction)))).size, questions: Math.min(CARD_ROOM_MAX_QUESTIONS, cards.filter(card => buildCardChoices(card, cards, direction, () => 0)).length)};
}
/** Only the correct label goes in `answers`: alternatives are left out because the choices were built to exclude them. */
export function cardRoomItems(cards: CardEntry[], direction: CardDirection, rounds: number, random: (max: number) => number): PlayItem[] {
  const items: PlayItem[] = [];
  for (const card of shuffleWith(cards, random)) {
    if (items.length >= rounds) break;
    const choices = buildCardChoices(card, cards, direction, random);
    if (choices) items.push({id: `card_${card.id}`, version: 'cards-v1', kind: 'vocab', gradeBand: 'mid', prompt: direction === 'front-back' ? card.front : card.back, answers: [cardAnswer(card, direction)], choices, hints: [], reveal: [`${card.front} = ${card.back}`, card.example].filter(Boolean).join('\n'), source: 'cards'});
  }
  return items;
}
