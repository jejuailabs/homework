import {notFound} from 'next/navigation';
import {StudentCardsStudy} from '@/components/cards-student';

export default async function StudentCardsModePage({params}: {params: Promise<{distributionId: string; mode: string}>}) {
  const {distributionId, mode} = await params;
  if (mode !== 'memorize' && mode !== 'recall' && mode !== 'spell' && mode !== 'test') notFound();
  return <StudentCardsStudy distributionId={distributionId} mode={mode}/>;
}
