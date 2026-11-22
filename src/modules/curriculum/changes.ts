import type {Plan} from './engine';

/** 바뀐 것을 사람이 읽을 한 줄로: 재구성 내역·되돌아보기에 쓴다. 학생 정보는 없다. */
export function changeSummary(before: Plan, after: Plan) {
  const parts: string[] = [];
  for (const semester of [1, 2] as const) {
    const key = (slot: {weekday: number; period: number; subject: string}) => `${slot.weekday}:${slot.period}:${slot.subject}`;
    const old = new Set(before.templates[semester].map(key)), now = new Set(after.templates[semester].map(key));
    const moved = [...now].filter(entry => !old.has(entry)).length + [...old].filter(entry => !now.has(entry)).length;
    if (moved) parts.push(`${semester}학기 기초시간표 ${Math.ceil(moved / 2)}칸`);
  }
  const standards = after.subjects.filter(subject => {const prev = before.subjects.find(entry => entry.key === subject.key); return !prev || prev.standard[1] !== subject.standard[1] || prev.standard[2] !== subject.standard[2];}).length;
  if (standards) parts.push(`기준시수 ${standards}개 교과`);
  const dayKey = (day: Plan['days'][number]) => `${day.date}:${day.kind}:${day.name}:${day.periods ?? ''}`;
  const oldDays = new Set(before.days.map(dayKey)), newDays = new Set(after.days.map(dayKey));
  const dayChanges = [...newDays].filter(entry => !oldDays.has(entry)).length + [...oldDays].filter(entry => !newDays.has(entry)).length;
  if (dayChanges) parts.push(`학사일정 ${dayChanges}건`);
  const changeKey = (change: NonNullable<Plan['overrides']>[number]) => `${change.date}:${change.period}:${change.subject ?? '-'}`;
  const oldChanges = new Set((before.overrides ?? []).map(changeKey)), newChanges = new Set((after.overrides ?? []).map(changeKey));
  const swapped = [...newChanges].filter(entry => !oldChanges.has(entry)).length + [...oldChanges].filter(entry => !newChanges.has(entry)).length;
  if (swapped) parts.push(`하루 시간표 바꾸기 ${swapped}건`);
  if (before.className !== after.className || before.schoolName !== after.schoolName || before.grade !== after.grade || before.startsOn !== after.startsOn || before.semester2On !== after.semester2On || before.endsOn !== after.endsOn || before.periodsPerDay !== after.periodsPerDay || before.daysRequired !== after.daysRequired) parts.push('반 정보');
  return parts.join(' · ');
}
