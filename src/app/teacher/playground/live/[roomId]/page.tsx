import {notFound} from 'next/navigation';
import AccessGate from '@/components/access-gate';
import {roomEngineEnabled} from '@/modules/playground/flags';
import LiveHost from '@/modules/playground/live-host';
export default async function PlaygroundLivePage({params,searchParams}:{params:Promise<{roomId:string}>;searchParams:Promise<{from?:string}>}) {
  if(!roomEngineEnabled())notFound();
  const [{roomId},query]=await Promise.all([params,searchParams]);if(!/^[a-f0-9]{64}$/.test(roomId))notFound();
  return <AccessGate role="teacher"><LiveHost roomId={roomId} fromCards={query.from==='cards'}/></AccessGate>;
}
