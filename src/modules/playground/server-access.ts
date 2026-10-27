import 'server-only';
import {db} from '@/lib/server/admin';
import type {Context} from '@/lib/server/auth';
import {ApiError, canManageClass, id} from '@/lib/server/policy';
import {defaultPlaySettings, type GradeBand, type PlayItem, type PlaySettings} from './types';
import {gradeBand, playDate, schoolYear, weekStart} from './engine';
import {playBank} from './bank';

export function settingsOf(data?: FirebaseFirestore.DocumentData): PlaySettings {
  const source = data || {};
  return {...defaultPlaySettings,
    enabled: source.enabled === true, allowDuels: source.allowDuels === true,
    rewardsEnabled: source.rewardsEnabled === true, showRankings: source.showRankings !== false,
    soloReward: Number.isInteger(source.soloReward) && source.soloReward >= 0 && source.soloReward <= 3 ? source.soloReward : 1,
    duelReward: Number.isInteger(source.duelReward) && source.duelReward >= 0 && source.duelReward <= 3 ? source.duelReward : 1,
    timeWindows: Array.isArray(source.timeWindows) ? source.timeWindows : [],
  };
}
export const settingsRef = (classId: string) => db().doc(`classes/${classId}/settings/playground`);
export async function accessStudent(ctx: Context, tx?: FirebaseFirestore.Transaction) {
  if (ctx.role !== 'student' || !ctx.classId || !ctx.studentId) throw new ApiError(403, '학생 화면에서 이용해 주세요.', 'FORBIDDEN');
  const refs = [db().doc(`classes/${ctx.classId}/students/${ctx.studentId}`), db().doc(`classes/${ctx.classId}`), db().doc(`users/${ctx.uid}`), settingsRef(ctx.classId)];
  const [pupil, cls, user, settings] = await Promise.all(refs.map(ref => tx ? tx.get(ref) : ref.get()));
  const u = user.data(), p = pupil.data();
  if (!cls.exists || !pupil.exists || p?.disabled || p?.authUid !== ctx.uid || !user.exists || u?.disabled || u?.role !== 'student' || u?.classId !== ctx.classId || u?.studentId !== ctx.studentId || (u?.authVersion ?? 0) !== (ctx.authVersion ?? 0)) throw new ApiError(403, '학생 계정을 다시 확인해 주세요.', 'STUDENT_UNAVAILABLE');
  const date = playDate();
  return {ctx: ctx as Context & {classId: string; studentId: string}, date, week: weekStart(date), year: String(schoolYear(date)), gradeBand: gradeBand(cls.data()?.grade), pupil, cls, settings: settingsOf(settings.data())};
}
export type PlayAccess = Awaited<ReturnType<typeof accessStudent>>;
export function requirePlayEnabled(access: Pick<PlayAccess, 'settings'>) {
  if (!access.settings.enabled) throw new ApiError(403, '선생님이 말놀이터를 열면 이용할 수 있어요.', 'PLAY_DISABLED');
}
export async function teacherClass(ctx: Context, classId: string, tx?: FirebaseFirestore.Transaction) {
  if (ctx.role === 'student') throw new ApiError(403, '선생님만 사용할 수 있어요.', 'FORBIDDEN');
  const refs = [db().doc(`classes/${id(classId)}`), db().doc(`users/${ctx.uid}`), db().doc(`platformRoles/${ctx.uid}`)];
  const [cls, user, platform] = await Promise.all(refs.map(ref => tx ? tx.get(ref) : ref.get()));
  const role = platform.data()?.role === 'admin' || platform.data()?.role === 'superadmin' ? platform.data()!.role : 'teacher';
  if (!cls.exists || user.data()?.disabled || !canManageClass(role, ctx.uid, cls.data()?.ownerUid)) throw new ApiError(403, '우리 반만 확인할 수 있어요.', 'FORBIDDEN');
  return cls;
}
export async function loadItems(classId: string, band?: GradeBand, tx?: FirebaseFirestore.Transaction): Promise<PlayItem[]> {
  const query = db().collection(`classes/${classId}/playgroundItems`).limit(500);
  const snapshot = tx ? await tx.get(query) : await query.get();
  const items = [...playBank, ...snapshot.docs.map(row => ({...row.data(), id: row.id}) as PlayItem)];
  return items.filter(item => (!band || item.gradeBand === band) && item.enabled !== false);
}
