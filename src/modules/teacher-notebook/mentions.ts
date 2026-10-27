import type {NotebookRosterClass, NotebookStudentRef} from './types';

export const studentKey = (ref: NotebookStudentRef) => `${ref.classId}_${ref.studentId}`;
const PARTICLE = /^(이가|이는|이를|이의|이도|이랑|이와|이에게|이한테|에게|한테|이|가|은|는|을|를|의|와|과|도|랑)(?![0-9A-Za-z가-힣])/;
/** Students whose name appears as "@name" in the text. Names shared by two students are ambiguous and left for the teacher to pick. */
export function findMentions(text: string, roster: NotebookRosterClass[]): {found: NotebookStudentRef[]; ambiguous: string[]} {
  const byName = new Map<string, NotebookStudentRef[]>();
  for (const cls of roster) for (const student of cls.students) {
    const name = student.name.trim(); if (!name) continue;
    byName.set(name, [...(byName.get(name) ?? []), {classId: cls.id, studentId: student.id}]);
  }
  // Longest names first so "@김민준호" is not read as "@김민준"; a Korean particle may follow the name.
  const names = [...byName.keys()].sort((a, b) => b.length - a.length), found: NotebookStudentRef[] = [], ambiguous: string[] = [], seen = new Set<string>();
  const endsName = (after: string) => !/^[0-9A-Za-z가-힣]/.test(after) || PARTICLE.test(after);
  for (let index = text.indexOf('@'); index !== -1; index = text.indexOf('@', index + 1)) {
    const rest = text.slice(index + 1), name = names.find(candidate => rest.startsWith(candidate) && endsName(rest.slice(candidate.length)));
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const refs = byName.get(name)!;
    if (refs.length === 1) found.push(refs[0]); else ambiguous.push(name);
  }
  return {found, ambiguous};
}
/** The "@query" being typed right before the caret, if any. */
export function mentionQuery(text: string, caret: number): {start: number; query: string} | null {
  const before = text.slice(0, caret), at = before.lastIndexOf('@');
  if (at === -1 || (at > 0 && /[0-9A-Za-z._-]/.test(before.charAt(at - 1)))) return null;
  const query = before.slice(at + 1);
  return /\s/.test(query) || query.length > 20 ? null : {start: at, query};
}
