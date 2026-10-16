import PointsTeacher from '@/components/points-teacher';
export default async function TeacherPointsPage({searchParams}: {searchParams: Promise<{classId?: string}>}) {
  const query = await searchParams;
  return <PointsTeacher initialClassId={typeof query.classId === 'string' ? query.classId : ''}/>;
}
