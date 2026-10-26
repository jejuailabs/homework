import 'server-only';
import {db} from './admin';
import {assertOrigin, requireTeacher, type Context} from './auth';
import {ApiError, canManageClass} from './policy';
import {assignmentVisibility, visibilityChange, visibilityRequest, type VisibilityRequest} from './assignment-visibility-policy';

export async function changeAssignmentVisibility(ctx: Context, input: VisibilityRequest) {
  const store = db(), classRef = store.doc(`classes/${input.classId}`);
  const refs = input.items.map(item => store.doc(`assignments/${item.id}`));
  const changedAt = new Date().toISOString();
  return store.runTransaction(async tx => {
    const [cls, ...tasks] = await tx.getAll(classRef, ...refs);
    if (!cls.exists) throw new ApiError(404, '학급을 찾을 수 없어요.', 'NOT_FOUND');
    if (!canManageClass(ctx.role, ctx.uid, cls.data()?.ownerUid)) throw new ApiError(403, '이 학급을 관리할 권한이 없어요.', 'FORBIDDEN');
    // Validate the entire selection before staging any writes. All tasks change together.
    const changes = tasks.map((task, index) => {
      if (!task.exists || task.data()?.classId !== input.classId) throw new ApiError(404, '이 학급의 과제를 다시 선택해 주세요.', 'NOT_FOUND');
      const patch = visibilityChange(task.data()!, input.items[index], input.action, ctx.uid, changedAt);
      return {task, patch};
    });
    return changes.map(({task, patch}) => {
      if (patch) tx.update(task.ref, patch);
      return {id: task.id, ...assignmentVisibility(patch ?? task.data())};
    });
  });
}

export async function handleAssignmentVisibility(request: Request) {
  const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'private,no-store'}});
  try {
    assertOrigin(request);
    const ctx = await requireTeacher(request);
    const input = visibilityRequest(await request.json().catch(() => null));
    return json({assignments: await changeAssignmentVisibility(ctx, input)});
  } catch (error) {
    if (error instanceof ApiError) return json({error: error.message, code: error.code}, error.status);
    console.error('Assignment visibility update failed');
    return json({error: '과제 표시 상태를 바꾸지 못했어요. 다시 시도해 주세요.', code: 'INTERNAL_ERROR'}, 500);
  }
}
