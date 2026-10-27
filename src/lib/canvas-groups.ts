/** Group canvases: one activity, one canvas per group, each pupil in at most one group of that activity. */
export const CANVAS_GROUP_MIN = 2, CANVAS_GROUP_MAX = 12, CANVAS_GROUP_MEMBER_MAX = 40, CANVAS_MISSION_MAX = 600;
export type CanvasGroupDraft = {name: string; studentIds: string[]};
export class CanvasGroupError extends Error {constructor(message: string, readonly status = 400) {super(message);}}

export function canvasGroupName(index: number, english = false) {return english ? `Group ${index + 1}` : `${index + 1}모둠`;}

/** Number order, dealt round-robin so groups differ in size by at most one. */
export function splitIntoGroups<T extends {id: string; number: number}>(roster: readonly T[], count: number): string[][] {
  const size = Math.max(CANVAS_GROUP_MIN, Math.min(CANVAS_GROUP_MAX, Math.floor(count)));
  const groups: string[][] = Array.from({length: size}, () => []);
  [...roster].sort((a, b) => a.number - b.number).forEach((person, index) => groups[index % size].push(person.id));
  return groups;
}

export function validateCanvasGroups(value: unknown, rosterIds: ReadonlySet<string>): CanvasGroupDraft[] {
  if (!Array.isArray(value) || value.length < CANVAS_GROUP_MIN || value.length > CANVAS_GROUP_MAX) throw new CanvasGroupError(`모둠은 ${CANVAS_GROUP_MIN}~${CANVAS_GROUP_MAX}개로 나눠 주세요.`);
  const seen = new Set<string>();
  return value.map((group, index) => {
    const raw = group && typeof group === 'object' ? group as Record<string, unknown> : {};
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 30) : canvasGroupName(index);
    const ids = raw.studentIds;
    if (!Array.isArray(ids) || !ids.length) throw new CanvasGroupError(`${name}에 학생을 한 명 이상 넣어 주세요.`);
    if (ids.length > CANVAS_GROUP_MEMBER_MAX) throw new CanvasGroupError(`${name}에는 ${CANVAS_GROUP_MEMBER_MAX}명까지 넣을 수 있어요.`);
    for (const id of ids) {
      if (typeof id !== 'string' || !rosterIds.has(id)) throw new CanvasGroupError('우리 반 학생을 선택해 주세요.');
      if (seen.has(id)) throw new CanvasGroupError('한 학생은 한 모둠에만 넣을 수 있어요.', 409);
      seen.add(id);
    }
    return {name, studentIds: [...ids] as string[]};
  });
}

/** Moving a pupil into one group must not leave them in another group of the same activity. */
export function assertNoOverlap(canvasId: string, studentIds: readonly string[], siblings: readonly {id: string; studentIds?: readonly string[]}[]) {
  const taken = new Set(siblings.filter(other => other.id !== canvasId).flatMap(other => other.studentIds || []));
  if (studentIds.some(id => taken.has(id))) throw new CanvasGroupError('같은 활동의 다른 모둠에 이미 있는 학생이에요. 그 모둠에서 먼저 빼 주세요.', 409);
}

export function canvasMission(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new CanvasGroupError('미션을 다시 적어 주세요.');
  const mission = value.replace(/\r\n?/g, '\n').trim();
  if (mission.length > CANVAS_MISSION_MAX) throw new CanvasGroupError(`미션은 ${CANVAS_MISSION_MAX}자까지 적을 수 있어요.`);
  return mission;
}
