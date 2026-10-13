/** Class administration belongs to the teacher dashboard, independent of homework. */
export function classStudentsHref(classId?: string) {
  const query = new URLSearchParams();
  if (classId) query.set('classId', classId);
  query.set('view', 'students');
  return `/teacher?${query}`;
}
