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

type LinkableArtwork = {id: string; title: string; artistName?: string; studentId?: string | null};
/** Artworks without a student whose artist name (or else title) is exactly one roster name not already linked in this room. */
export function linkableArtworks(artworks: LinkableArtwork[], students: Student[]) {
  const taken = new Set(artworks.map(artwork => artwork.studentId).filter(Boolean));
  return artworks.flatMap(artwork => {
    if (artwork.studentId) return [];
    const match = matchArtworkStudent(artwork.artistName?.trim() || artwork.title, students);
    if (!match.studentId || taken.has(match.studentId)) return [];
    taken.add(match.studentId);
    return [{artworkId: artwork.id, ...match}];
  });
}
