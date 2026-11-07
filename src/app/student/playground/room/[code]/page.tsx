import {notFound} from 'next/navigation';
import AccessGate from '@/components/access-gate';
import {roomEngineEnabled} from '@/modules/playground/flags';
import PlayRoomScreen from '@/modules/playground/room';
export default async function PlaygroundRoomPage({params,searchParams}:{params:Promise<{code:string}>;searchParams:Promise<{from?:string}>}) {
  if(!roomEngineEnabled())notFound();
  const [{code},query]=await Promise.all([params,searchParams]);if(!/^\d{4}$/.test(code))notFound();
  return <AccessGate role="student"><PlayRoomScreen codeOrId={code} fromCards={query.from==='cards'}/></AccessGate>;
}
