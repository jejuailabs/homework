import type {PlayChoice, PlayKind} from './types';
import type {WardrobeOutfit} from '@/lib/points-types';

export type PlayRoomMode = 'duel' | 'speed' | 'team';
export type PlayRoomStatus = 'lobby' | 'countdown' | 'question' | 'reveal' | 'paused' | 'finished' | 'closed';
export const roomModeLabels = {duel: '1:1 대결', speed: '순발력 방', team: '우리 반 팀전'};
export const roomTeamNames = ['햇살', '물결', '별빛', '달빛', '새싹', '구름'];
export const roomTeamColors = ['#d96753', '#278b8b', '#b28b13', '#8570bc', '#548947', '#498ab5'];
export type RoomPlayer = {key: string; uid: string; name: string; character: string; imageSrc?: string; outfit: WardrobeOutfit; spaceOutfit: Partial<Record<'body'|'bag', string>>; team: number; score: number; lastSeen: number; forfeited: boolean; answered: number; eligibleFrom: number; joinedAt: number; lastReactionAt: number; reaction: string; answeredRound: number};
export type RoomPlayerSummary = Pick<RoomPlayer, 'key' | 'name' | 'character' | 'imageSrc' | 'outfit' | 'spaceOutfit' | 'team' | 'score' | 'lastSeen' | 'forfeited' | 'reaction'>;
export type RoomTeam = {id: number; name: string; color: string; score: number; count: number};
export type PlayRoom = {id: string; code: string; classId: string; ownerUid: string; hostKey: string; mode: PlayRoomMode; status: PlayRoomStatus; kinds: PlayKind[]; playerKeys: string[]; players: RoomPlayerSummary[]; teams: RoomTeam[]; teamCount: number; round: number; roundsTotal: number; questionMs: number; roundStartsAt: number; roundEndsAt: number; statusEndsAt: number; createdAt: number; updatedAt: number; expiresAtMs: number; settled: boolean; completion?: 'complete'|'cancelled'|'forfeit'; pausedFrom: 'countdown'|'question'|'reveal'|null; pausedAt: number; skippedRounds: number[]};
export type RoomAnswer = {key: string; round: number; choiceId: string; receivedAt: number; elapsedMs?: number; correct: boolean};
export type RoomRoundResult = {key: string; points: number; rank: number; correct: boolean};
export type PublicRoomRound = {round: number; kind: PlayKind; prompt: string; choices: PlayChoice[]; correctChoiceId?: string; reveal?: string; results?: RoomRoundResult[]; distribution?: Record<string, number>; skipped?: boolean};
export type RoomBootstrap = {room: PlayRoom; question: PublicRoomRound | null; player: RoomPlayer | null; players?: RoomPlayer[]; viewer: {uid: string; key: string; teacher: boolean; canHost: boolean}; serverTime: number};
export type RoomState = {room: PlayRoom; key: string; question?: PublicRoomRound | null; players?: RoomPlayer[]; serverTime: number};
