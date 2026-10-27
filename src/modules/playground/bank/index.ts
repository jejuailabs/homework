import {nonsenseBank} from './nonsense';
import {riddleBank} from './riddle';
import {vocabBank} from './vocab';
import {spellingBank} from './spelling';
import type {PlayItem} from '../types';

/** The server owns this bank. Never import it into a client component. */
export const playBank: PlayItem[] = [...nonsenseBank, ...riddleBank, ...vocabBank, ...spellingBank];
