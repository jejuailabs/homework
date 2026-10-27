import {notFound} from 'next/navigation';
import AccessGate from '@/components/access-gate';
import PlayRoomScreen from '@/modules/playground/room';
export default async function PlaygroundRoomPage({params}:{params:Promise<{code:string}>}) {
  if(process.env.PLAYGROUND_DISABLED==='true'||process.env.PLAYGROUND_LIVE_DISABLED==='true')notFound();
  const {code}=await params;if(!/^\d{4}$/.test(code))notFound();
  return <AccessGate role="student"><PlayRoomScreen codeOrId={code}/></AccessGate>;
}
