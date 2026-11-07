import {notFound} from 'next/navigation';
import {StudentCardsStudy} from '@/components/cards-student';

export default async function StudentCardsModePage({params, searchParams}: {params: Promise<{distributionId: string; mode: string}>; searchParams: Promise<{[key: string]: string | string[] | undefined}>}) {
  const {distributionId, mode} = await params, {from, to} = await searchParams;
  if (mode !== 'memorize' && mode !== 'recall' && mode !== 'spell' && mode !== 'test' && mode !== 'chunk') notFound();
  return <StudentCardsStudy distributionId={distributionId} mode={mode} from={typeof from === 'string' ? from : undefined} to={typeof to === 'string' ? to : undefined}/>;
}
