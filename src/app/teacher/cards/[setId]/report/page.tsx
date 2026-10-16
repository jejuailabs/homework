import CardsReport from '@/components/cards-report';
export default async function CardReportPage({params, searchParams}: {params: Promise<{setId: string}>; searchParams: Promise<{classId?: string; distributionId?: string}>}) {
  const [route, query] = await Promise.all([params, searchParams]);
  return <CardsReport setId={route.setId} initialClassId={typeof query.classId === 'string' ? query.classId : ''} initialDistributionId={typeof query.distributionId === 'string' ? query.distributionId : ''}/>;
}
