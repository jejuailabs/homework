import CardsSpotlight from '@/components/cards-spotlight';
export default async function CardSpotlightPage({params, searchParams}: {params: Promise<{setId: string}>; searchParams: Promise<{classId?: string}>}) {
  const [route, query] = await Promise.all([params, searchParams]);
  return <CardsSpotlight setId={route.setId} classId={typeof query.classId === 'string' ? query.classId : ''}/>;
}
