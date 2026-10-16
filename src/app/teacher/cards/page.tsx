import CardsTeacher from '@/components/cards-teacher';
export default async function TeacherCardsPage({searchParams}: {searchParams: Promise<{classId?: string}>}) {
  const query = await searchParams;
  return <CardsTeacher initialClassId={typeof query.classId === 'string' ? query.classId : ''}/>;
}
