// 카드 스피킹 규칙. 선생님이 배부한 세트에서 켜면 학생이 카드마다 한 개의 녹음을 남긴다.
// 녹음은 어디서나 재생되도록 16kHz 모노 WAV로 저장하고, 다시 녹음하면 이전 파일을 지운다.
import {safeSegment} from './storage-export';
import type {CardEntry} from './cards-types';

export const SPEAKING_MAX_SECONDS = 30, SPEAKING_RATE_HZ = 16000;
export const SPEAKING_MAX_BYTES = 44 + SPEAKING_RATE_HZ * 2 * SPEAKING_MAX_SECONDS;
export const SPEAKING_ZIP_MAX_BYTES = 1024 ** 3;

export type SpeakingTake = {takeId: string; bytes: number; seconds: number; at: string; url?: string};
export type SpeakingTakes = Record<string, SpeakingTake>;
export type SpeakingFile = {path: string; bytes: number; url: string};
export type SpeakingStudentRow = {id: string; number: number; name: string; recorded: number; lastAt: string | null};

export const speakingCards = (cards: CardEntry[]) => cards.filter(card => card.front.trim());
/** Takes for cards still in the set; a snapshot never changes, but this keeps the count honest. */
export const speakingRecorded = (cards: CardEntry[], takes: SpeakingTakes) => speakingCards(cards).filter(card => takes[card.id]).length;
export const speakingComplete = (cards: CardEntry[], takes: SpeakingTakes) => speakingCards(cards).length > 0 && speakingRecorded(cards, takes) === speakingCards(cards).length;
/** "003_look after.wav": the card's place in the set first, so files sort in study order. */
export function speakingFileName(position: number, front: string) {
  return `${String(position + 1).padStart(3, '0')}_${safeSegment(front.slice(0, 40), 'card')}.wav`;
}
export function speakingFolderName(number: number, name: string) {
  return safeSegment(`${number ? `${String(number).padStart(2, '0')}번_` : ''}${name}`, '학생');
}
export const speakingZipName = (title: string, who = '') => `${safeSegment(title, '카드')}_스피킹${who ? `_${safeSegment(who)}` : ''}.zip`;
