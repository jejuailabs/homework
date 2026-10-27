import {notFound} from 'next/navigation';
import AccessGate from '@/components/access-gate';
import PlaygroundSolo from '@/modules/playground/solo';
import {playKinds, type PlayKind} from '@/modules/playground/types';
export default async function PlaygroundKindPage({params, searchParams}: {params: Promise<{kind: string}>; searchParams: Promise<{review?: string}>}) {
  if (process.env.PLAYGROUND_DISABLED === 'true') notFound();
  const {kind} = await params, {review} = await searchParams;
  if (!playKinds.includes(kind as PlayKind)) notFound();
  return <AccessGate role="student"><PlaygroundSolo key={`${kind}:${review}`} kind={kind as PlayKind} review={kind === 'spelling' && review === '1'}/></AccessGate>;
}
