// Turns a card set into room questions. Pure, so the teacher's setup screen and the server that owns the bank agree on what can run.
import {buildCardChoices, cardAnswer, normalizeCardAnswer, shuffleWith} from '../../lib/cards-logic';
import type {CardDirection, CardEntry} from '../../lib/cards-types';
import type {PlayItem} from './types';

export const CARD_ROOM_MAX_QUESTIONS = 30;
export const CARD_ROOM_SECONDS = {min: 10, max: 30, initial: 15};
export const CARD_ROOM_TEAMS = {min: 2, max: 6, initial: 2};
const promptOf = (card: CardEntry, direction: CardDirection) => direction === 'front-back' ? card.front : card.back;
/** A card that shares this prompt is a right answer in disguise, so its answer is never offered as a wrong choice. */
function choicesOf(card: CardEntry, cards: CardEntry[], direction: CardDirection, random: (max: number) => number) {
  const prompt = normalizeCardAnswer(promptOf(card, direction));
  return buildCardChoices(card, cards.filter(other => other.id === card.id || normalizeCardAnswer(promptOf(other, direction)) !== prompt), direction, random);
}
/** `answers` under 2 means no question can have a wrong choice; `questions` is the most a room can ask in this direction. */
export function cardRoomCapacity(cards: CardEntry[], direction: CardDirection) {
  return {answers: new Set(cards.map(card => normalizeCardAnswer(cardAnswer(card, direction)))).size, questions: Math.min(CARD_ROOM_MAX_QUESTIONS, cards.filter(card => choicesOf(card, cards, direction, () => 0)).length)};
}
/** Only the correct label goes in `answers`: alternatives are left out because the choices were built to exclude them. */
export function cardRoomItems(cards: CardEntry[], direction: CardDirection, rounds: number, random: (max: number) => number): PlayItem[] {
  const items: PlayItem[] = [];
  for (const card of shuffleWith(cards, random)) {
    if (items.length >= rounds) break;
    const choices = choicesOf(card, cards, direction, random);
    if (choices) items.push({id: `card_${card.id}`, version: 'cards-v1', kind: 'vocab', gradeBand: 'mid', prompt: promptOf(card, direction), answers: [cardAnswer(card, direction)], choices, hints: [], reveal: [`${card.front} = ${card.back}`, card.example].filter(Boolean).join('\n'), source: 'cards'});
  }
  return items;
}
