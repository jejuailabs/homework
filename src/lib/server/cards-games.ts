import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from './admin';
import type { Context } from './auth';
import { ApiError, canManageClass, id } from './policy';
import { assertDueOpen, canStudyDistribution, object } from './cards-policy';
import { betterRecord, CARD_GAMES, checkGameResult, GAME_RANK_LIMIT, GAME_RATE, isCardGame, rankGameRows, recentPlays, type CardGame, type GameRankRow, type GameRecord } from '../cards-games';
import type { CardDistribution } from '../cards-types';

// 복습 게임 기록. 배부 × 학생마다 게임별 최고 기록 하나만 남긴다(`cardGameScores`). 판마다 점수를 쌓지 않는다.
// 영수증(`plays/{requestId}`)은 같은 판의 재전송을 한 번만 세려고 지문만 담는다.
type Data = Record<string, any>;
type Distribution = CardDistribution & { ownerUid: string };
type Best = GameRecord & { at: string; plays: number };
export type CardGameBoard = { game: CardGame; best: Best | null; rank: number | null; ranking: GameRankRow[] };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const scoreRef = (distributionId: string, studentId: string) => db().doc(`cardGameScores/${id(distributionId)}_${id(studentId)}`);
// 카드놀이 반 설정 문서. 보말 스위치(`rewardsEnabled`)와 같은 문서에 게임 순위 스위치(`rankingsShown`, 기본 꺼짐)를 둔다.
const cardSettingsRef = (classId: string) => db().doc(`classes/${id(classId, '우리 반')}/settings/cards`);

async function input(request: Request): Promise<Data> {
  const raw = await request.text();
  if (raw.length > 8_000) throw new ApiError(413, '게임 기록이 너무 커요.', 'GAME_INPUT');
  try { return object(raw ? JSON.parse(raw) : {}); } catch { throw new ApiError(400, '게임 기록을 확인해 주세요.', 'GAME_INPUT'); }
}
/** The same checks as the study routes: the class owner, an active student code, and a distribution meant for this student. */
async function access(ctx: Context, distributionId: string, tx?: FirebaseFirestore.Transaction) {
  const ref = db().doc(`cardClassSets/${id(distributionId)}`), snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists) throw new ApiError(404, '배부한 세트를 찾을 수 없어요.', 'NOT_FOUND');
  const value = { ...snap.data(), id: snap.id } as Distribution;
  if (ctx.role !== 'student') {
    const cls = await db().doc(`classes/${value.classId}`).get();
    if (ctx.uid !== value.ownerUid || cls.data()?.ownerUid !== ctx.uid) throw new ApiError(404, '항목을 찾을 수 없어요.', 'NOT_FOUND');
    return value;
  }
  if (!canStudyDistribution(ctx, value)) throw new ApiError(404, '우리 반에 나눠 준 세트를 찾을 수 없어요.', 'NOT_FOUND');
  const refs = [db().doc(`classes/${ctx.classId}`), db().doc(`classes/${ctx.classId}/students/${ctx.studentId}`), db().doc(`users/${ctx.uid}`)];
  const [cls, pupil, profile] = await Promise.all(refs.map(reference => tx ? tx.get(reference) : reference.get()));
  if (!cls.exists || cls.data()?.ownerUid !== value.ownerUid || !pupil.exists || pupil.data()?.disabled || pupil.data()?.authUid !== ctx.uid || !profile.exists || profile.data()?.disabled || profile.data()?.studentId !== ctx.studentId || profile.data()?.classId !== ctx.classId || profile.data()?.role !== 'student') throw new ApiError(403, '학생 코드를 선생님께 다시 확인해 주세요.', 'STUDENT_UNAVAILABLE');
  return value;
}
const bestOf = (value: unknown): Best | null => {
  const record = value as Best | undefined;
  return record && Number.isFinite(record.score) && Number.isFinite(record.timeMs) ? { score: record.score, timeMs: record.timeMs, at: String(record.at ?? ''), plays: Number(record.plays) || 0 } : null;
};
/**
 * Class rankings: classmates only, current active students only. Students see them only when the teacher turns on
 * 카드놀이 "반 순위 보이기" (`classes/{classId}/settings/cards.rankingsShown`, off by default); otherwise only their own best.
 * The playground's own ranking switch is not read here. Students get the top ten plus their own row; the teacher gets everyone.
 */
async function boards(distribution: Distribution, viewer: string | null) {
  const [roster, settings, scores] = await Promise.all([
    db().collection(`classes/${distribution.classId}/students`).select('name', 'number', 'disabled').limit(500).get(),
    cardSettingsRef(distribution.classId).get(),
    db().collection('cardGameScores').where('distributionId', '==', distribution.id).limit(500).get(),
  ]);
  const shown = !viewer || settings.data()?.rankingsShown === true;
  const rows = new Map(scores.docs.filter(doc => doc.data().classId === distribution.classId).map(doc => [String(doc.data().studentId), doc.data()]));
  const pupils = roster.docs.filter(pupil => !pupil.data().disabled);
  const result = Object.fromEntries(CARD_GAMES.map(game => {
    const ranked = rankGameRows(game, pupils.flatMap(pupil => {
      const best = bestOf(rows.get(pupil.id)?.games?.[game]);
      // A blank name falls back to the roll number, the same way Berry shows children.
      return best ? [{ id: pupil.id, name: String(pupil.data().name || '').trim() || `${pupil.data().number ?? ''}번`, score: best.score, timeMs: best.timeMs }] : [];
    }));
    const mine = viewer ? ranked.find(row => row.id === viewer) ?? null : null;
    const ranking = !shown ? [] : viewer ? ranked.filter((row, index) => index < GAME_RANK_LIMIT || row.id === viewer) : ranked;
    return [game, { game, best: viewer ? bestOf(rows.get(viewer)?.games?.[game]) : null, rank: shown ? mine?.rank ?? null : null, ranking: ranking.map(row => viewer && row.id !== viewer ? { ...row, id: '' } : row) } satisfies CardGameBoard];
  })) as Record<CardGame, CardGameBoard>;
  return { games: result, rankingsShown: shown };
}

async function readBoards(ctx: Context, distributionId: string) {
  const distribution = await access(ctx, distributionId);
  return json({ ...(await boards(distribution, ctx.role === 'student' ? ctx.studentId! : null)), serverTime: new Date().toISOString() });
}

async function saveRecord(ctx: Context, request: Request, distributionId: string) {
  if (ctx.role !== 'student' || !ctx.classId || !ctx.studentId) throw new ApiError(403, '학생 화면에서 이용해 주세요.', 'FORBIDDEN');
  const body = await input(request), requestId = id(body.requestId, '저장 요청 ID'), game = body.game;
  if (!isCardGame(game)) throw new ApiError(400, '게임 종류를 확인해 주세요.', 'GAME_INPUT');
  const { requestId: _requestId, ...payload } = body, fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const outcome = await db().runTransaction(async tx => {
    const distribution = await access(ctx, distributionId, tx), ref = scoreRef(distributionId, ctx.studentId!), receiptRef = ref.collection('plays').doc(requestId);
    const [saved, receipt] = await Promise.all([tx.get(ref), tx.get(receiptRef)]);
    if (receipt.exists) {
      if (receipt.data()!.fingerprint !== fingerprint) throw new ApiError(409, '같은 요청 ID에 다른 기록을 저장할 수 없어요.', 'REQUEST_CONFLICT');
      return { distribution, state: saved.data() ?? {}, improved: !!receipt.data()!.improved, duplicate: true };
    }
    assertDueOpen(distribution);
    const checked = checkGameResult(game, body, distribution.snapshot.cards, distribution.snapshot.type);
    if (!checked.ok) throw new ApiError(400, '이 게임 기록은 저장할 수 없어요.', 'GAME_RESULT');
    const time = Date.now(), recent = recentPlays(saved.data()?.recent, time);
    if (recent.length >= GAME_RATE.max) throw new ApiError(429, '기록을 너무 자주 보냈어요. 잠시 뒤 다시 저장해 주세요.', 'GAME_RATE');
    const at = new Date(time).toISOString(), state: Data = saved.data() ?? { distributionId, classId: ctx.classId, studentId: ctx.studentId, ownerUid: distribution.ownerUid, games: {} };
    const previous = bestOf(state.games?.[game]), improved = betterRecord(game, checked.record, previous);
    state.games = { ...state.games, [game]: improved ? { ...checked.record, at, plays: (previous?.plays ?? 0) + 1 } : { ...previous, plays: (previous?.plays ?? 0) + 1 } };
    Object.assign(state, { recent: [...recent, time], updatedAt: at });
    tx.set(ref, state);
    tx.create(receiptRef, { fingerprint, improved, createdAt: at });
    return { distribution, state, improved, duplicate: false };
  });
  // The ranking is read after the commit; the student's own fresh record replaces whatever the query saw.
  const board = await boards(outcome.distribution, ctx.studentId);
  const mine = bestOf(outcome.state.games?.[game]);
  return json({ ...board, game, best: mine, improved: outcome.improved, duplicate: outcome.duplicate });
}

/** GET a distribution's game records (student: own best and the class top ten; teacher: everyone). POST one finished round. */
/** GET/PATCH `classes/{classId}/game-rankings`: the class owner's 반 순위 보이기 switch for card games. Saved at once, apart from the class defaults. */
export async function cardGameRankingSettings(ctx: Context, request: Request, classId: string) {
  if (ctx.role === 'student') throw new ApiError(403, '선생님만 사용할 수 있어요.', 'FORBIDDEN');
  const cls = await db().doc(`classes/${id(classId, '우리 반')}`).get();
  if (!cls.exists || !canManageClass(ctx.role, ctx.uid, cls.data()?.ownerUid)) throw new ApiError(404, '항목을 찾을 수 없어요.', 'NOT_FOUND');
  let shown = (await cardSettingsRef(classId).get()).data()?.rankingsShown === true;
  if (request.method === 'PATCH') {
    const value = await input(request);
    if (typeof value.rankingsShown !== 'boolean') throw new ApiError(400, '순위 설정을 확인해 주세요.', 'RANKING_SETTINGS');
    shown = value.rankingsShown;
    await cardSettingsRef(classId).set({ rankingsShown: shown, updatedAt: new Date().toISOString() }, { merge: true });
  } else if (request.method !== 'GET') throw new ApiError(404, '카드놀이 기능을 찾을 수 없어요.', 'NOT_FOUND');
  return json({ rankingsShown: shown });
}
export async function cardGames(ctx: Context, request: Request, distributionId: string) {
  if (request.method === 'GET') return readBoards(ctx, distributionId);
  if (request.method === 'POST') return saveRecord(ctx, request, distributionId);
  throw new ApiError(404, '카드놀이 기능을 찾을 수 없어요.', 'NOT_FOUND');
}
