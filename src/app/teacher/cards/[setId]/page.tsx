import CardsTeacher from '@/components/cards-teacher';
export default async function TeacherCardSetPage({params, searchParams}: {params: Promise<{setId: string}>; searchParams: Promise<{classId?: string}>}) {
  const [route, query] = await Promise.all([params, searchParams]);
  return <CardsTeacher setId={route.setId} initialClassId={typeof query.classId === 'string' ? query.classId : ''}/>;
}
