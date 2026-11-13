import type {PlayChoice, PlayKind} from './types';
import type {CardDirection} from '@/lib/cards-types';
import type {WardrobeOutfit} from '@/lib/points-types';

export type PlayRoomMode = 'duel' | 'speed' | 'team' | 'race';
export type PlayRoomStatus = 'lobby' | 'countdown' | 'question' | 'reveal' | 'paused' | 'finished' | 'closed';
export const roomModeLabels = {duel: '1:1 대결', speed: '순발력 방', team: '우리 반 팀전', race: '카드 개인전'};
/** Rooms the teacher runs from the projector: no 1:1 records, no automatic playground rewards. */
export const isTeacherRun = (room: Pick<PlayRoom, 'mode'>) => room.mode === 'team' || room.mode === 'race';
/** 개인전: each student works through their own order of the questions until the whole-game timer ends. */
export const isRaceRoom = (room: Pick<PlayRoom, 'mode'> | null | undefined) => room?.mode === 'race';
export const RACE_POINTS = 100;
export const roomTeamNames = ['햇살', '물결', '별빛', '달빛', '새싹', '구름'];
export const roomTeamColors = ['#d96753', '#278b8b', '#b28b13', '#8570bc', '#548947', '#498ab5'];
/** Same order as roomTeamNames: public/cards/v1/cards-team-{sticker}.svg. */
export const roomTeamStickers = ['sun', 'wave', 'star', 'moon', 'sprout', 'cloud'];
/** Set on a room opened from a card set. Students of such a room need no playground settings; see firestore.rules. */
export type RoomCardSource = {setId: string; title: string; direction: CardDirection; answer?: 'choice' | 'typed'};
/** 먼저 쓰기: students type the answer, up to HUNT_TRIES tries a question, and only the first right answer scores. */
export const HUNT_TRIES = 3;
export const HUNT_POINTS = 1000;
export const isHuntRoom = (room: Pick<PlayRoom, 'cards'> | null | undefined) => room?.cards?.answer === 'typed';
/** 카드놀이 팀전(객관식): 문제 시간 안에는 다른 보기를 다시 눌러 답을 바꿀 수 있다. 점수는 마지막 답과 그 시간으로 매긴다. */
export const canChangeAnswer = (room: Pick<PlayRoom, 'mode' | 'cards'> | null | undefined) => room?.mode === 'team' && !!room.cards && room.cards.answer !== 'typed';
export type RoomPlayer = {key: string; uid: string; name: string; character: string; imageSrc?: string; outfit: WardrobeOutfit; spaceOutfit: Partial<Record<'body'|'bag', string>>; team: number; score: number; lastSeen: number; forfeited: boolean; answered: number; eligibleFrom: number; joinedAt: number; lastReactionAt: number; reaction: string; answeredRound: number; classId?: string; raceCorrect?: number; raceLastAt?: number};
export type RoomPlayerSummary = Pick<RoomPlayer, 'key' | 'name' | 'character' | 'imageSrc' | 'outfit' | 'spaceOutfit' | 'team' | 'score' | 'lastSeen' | 'forfeited' | 'reaction' | 'raceCorrect' | 'raceLastAt'> & {answered?: number};
export type RoomTeam = {id: number; name: string; color: string; score: number; count: number};
export type PlayRoom = {id: string; code: string; classId: string; ownerUid: string; hostKey: string; mode: PlayRoomMode; status: PlayRoomStatus; kinds: PlayKind[]; playerKeys: string[]; players: RoomPlayerSummary[]; teams: RoomTeam[]; teamCount: number; round: number; roundsTotal: number; questionMs: number; roundStartsAt: number; roundEndsAt: number; statusEndsAt: number; createdAt: number; updatedAt: number; expiresAtMs: number; settled: boolean; completion?: 'complete'|'cancelled'|'forfeit'; pausedFrom: 'countdown'|'question'|'reveal'|null; pausedAt: number; skippedRounds: number[]; cards?: RoomCardSource; classIds?: string[]; classNames?: string[]};
/** 반대항전: a card room across classes of one teacher. `classIds[0]` is `classId`; each class is one team, scored by its average. */
export const roomHasClass = (room: Pick<PlayRoom, 'classId' | 'classIds'>, classId: string | undefined) => !!classId && (room.classId === classId || !!room.classIds?.includes(classId));
export const isVersusRoom = (room: Pick<PlayRoom, 'classIds'>) => (room.classIds?.length ?? 0) > 1;
export type RoomAnswer = {key: string; round: number; choiceId: string; receivedAt: number; elapsedMs?: number; correct: boolean; text?: string; tries?: number; first?: boolean; race?: boolean; step?: number};
/** 개인전: the question a student is on. `question` is null once they have answered every question. */
export type RaceView = {step: number; total: number; question: PublicRoomRound | null; score: number; correct: number};
export type RaceAnswerResult = {correct: boolean; correctChoiceId: string; reveal: string; next: RaceView};
/** 개인전 결과: one wrong answer of this student, shown only to them after the game. */
export type RaceMiss = {prompt: string; answer: string; chosen: string; reveal: string};
export type RoomRoundResult = {key: string; points: number; rank: number; correct: boolean};
export type PublicRoomRound = {round: number; kind: PlayKind; prompt: string; choices: PlayChoice[]; correctChoiceId?: string; reveal?: string; results?: RoomRoundResult[]; distribution?: Record<string, number>; skipped?: boolean};
/** One question of the after-game review on the host screen. Built only from revealed round documents. */
export type RoomReviewItem = {round: number; prompt: string; answer: string; reveal: string; total: number; wrong: number; commonWrong: string; commonWrongCount: number};
export type RoomBootstrap = {room: PlayRoom; question: PublicRoomRound | null; player: RoomPlayer | null; players?: RoomPlayer[]; viewer: {uid: string; key: string; teacher: boolean; canHost: boolean; rewardsEnabled?: boolean}; serverTime: number};
export type RoomState = {room: PlayRoom; key: string; question?: PublicRoomRound | null; players?: RoomPlayer[]; serverTime: number};
