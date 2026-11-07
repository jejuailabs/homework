import CardsScreen from '@/components/cards-screen';
export default async function CardScreenPage({params, searchParams}: {params: Promise<{setId: string}>; searchParams: Promise<{classId?: string}>}) {
  const [route, query] = await Promise.all([params, searchParams]);
  return <CardsScreen setId={route.setId} classId={typeof query.classId === 'string' ? query.classId : ''}/>;
}
