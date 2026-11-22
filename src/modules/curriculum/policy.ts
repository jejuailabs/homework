/**
 * 숨겨서 만드는 동안의 공개 범위. 교무수첩과 같은 3단 스위치(off → allowlist → all)이고 기본은 off다.
 * off여도 플랫폼 관리자는 확인을 위해 열 수 있다. CURRICULUM_DISABLED=true는 관리자까지 모두 끈다.
 */
export type CurriculumAccessMode = 'off' | 'allowlist' | 'all';
export type CurriculumAccess = {mode: CurriculumAccessMode; teacherUids: string[]};
const ID = /^[A-Za-z0-9_-]{1,128}$/;

export function curriculumAccess(value: unknown): CurriculumAccess {
  const data = (value ?? {}) as Partial<CurriculumAccess>;
  const mode = data.mode === 'all' || data.mode === 'allowlist' ? data.mode : 'off';
  return {mode, teacherUids: Array.isArray(data.teacherUids) ? data.teacherUids.filter((uid): uid is string => typeof uid === 'string' && ID.test(uid)).slice(0, 500) : []};
}

export function curriculumAllowed(config: CurriculumAccess, uid: string, role: string, killSwitch?: string) {
  if (killSwitch === 'true' || role === 'student') return false;
  if (role === 'admin' || role === 'superadmin') return true;
  return config.mode === 'all' || config.mode === 'allowlist' && config.teacherUids.includes(uid);
}
