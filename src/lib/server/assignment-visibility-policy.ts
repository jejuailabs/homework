import {ApiError, id} from './policy';

type AssignmentData = {visibility?: unknown; visibilityVersion?: unknown; hiddenAt?: unknown; hiddenBy?: unknown};
export type VisibilityItem = {id: string; visibilityVersion: number};
export type VisibilityRequest = {classId: string; action: 'hide' | 'restore'; items: VisibilityItem[]};

/** Missing fields are old, visible assignments; no backfill is needed. */
export function assignmentVisibility(value?: AssignmentData) {
  return {
    visibility: value?.visibility === 'hidden' ? 'hidden' as const : 'visible' as const,
    visibilityVersion: typeof value?.visibilityVersion === 'number' && Number.isSafeInteger(value.visibilityVersion) && value.visibilityVersion >= 0 ? value.visibilityVersion : 0,
    hiddenAt: typeof value?.hiddenAt === 'string' ? value.hiddenAt : null,
    hiddenBy: typeof value?.hiddenBy === 'string' ? value.hiddenBy : null,
  };
}

export function assertAssignmentVisible(value?: AssignmentData) {
  if (assignmentVisibility(value).visibility === 'hidden') throw new ApiError(409, '선생님이 보관한 과제예요. 다시 표시한 뒤 이용할 수 있어요.', 'ASSIGNMENT_HIDDEN');
}

export function visibilityRequest(raw: unknown): VisibilityRequest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError(400, '숨길 과제를 다시 골라 주세요.', 'VISIBILITY_INPUT');
  const value = raw as Record<string, unknown>;
  if (value.action !== 'hide' && value.action !== 'restore') throw new ApiError(400, '과제 표시 방법을 확인해 주세요.', 'VISIBILITY_ACTION');
  if (!Array.isArray(value.items) || !value.items.length || value.items.length > 100) throw new ApiError(400, '과제는 한 번에 1~100개까지 선택해 주세요.', 'VISIBILITY_SIZE');
  const items = value.items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !Number.isSafeInteger(item.visibilityVersion) || item.visibilityVersion < 0) throw new ApiError(400, '과제 목록을 새로 확인해 주세요.', 'VISIBILITY_VERSION');
    return {id: id(item.id), visibilityVersion: item.visibilityVersion as number};
  });
  if (new Set(items.map(item => item.id)).size !== items.length) throw new ApiError(400, '같은 과제가 두 번 선택됐어요.', 'VISIBILITY_DUPLICATE');
  return {classId: id(value.classId), action: value.action, items};
}

/** Retry the immediately completed operation safely, but never overwrite a newer opposite action. */
export function visibilityChange(value: AssignmentData, item: VisibilityItem, action: VisibilityRequest['action'], actorUid: string, changedAt: string) {
  const current = assignmentVisibility(value), desired = action === 'hide' ? 'hidden' : 'visible';
  const sameState = current.visibility === desired;
  if (current.visibilityVersion !== item.visibilityVersion && !(sameState && current.visibilityVersion === item.visibilityVersion + 1)) throw new ApiError(409, '다른 화면에서 과제 표시 상태가 바뀌었어요. 목록을 새로 확인해 주세요.', 'VISIBILITY_CONFLICT');
  if (sameState) return null;
  return {visibility: desired, visibilityVersion: current.visibilityVersion + 1, hiddenAt: desired === 'hidden' ? changedAt : null, hiddenBy: desired === 'hidden' ? actorUid : null};
}
