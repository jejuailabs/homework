type Student = {id: string; name: string};

/** Only a unique roster name may be preselected; manual choices take precedence in the UI. */
export function matchArtworkStudent(name: string, students: Student[]) {
  const normalized = name.replace(/\s/g, '');
  const matches = normalized ? students.filter(student => student.name.replace(/\s/g, '') === normalized) : [];
  return {artistName: matches.length === 1 ? matches[0].name : name, studentId: matches.length === 1 ? matches[0].id : ''};
}

export function hasDuplicateArtworkStudents(photos: {studentId: string}[]) {
  const assigned = photos.map(photo => photo.studentId).filter(Boolean);
  return new Set(assigned).size !== assigned.length;
}
