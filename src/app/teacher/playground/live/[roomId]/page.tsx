import {notFound} from 'next/navigation';
import AccessGate from '@/components/access-gate';
import LiveHost from '@/modules/playground/live-host';
export default async function PlaygroundLivePage({params}:{params:Promise<{roomId:string}>}) {
  if(process.env.PLAYGROUND_DISABLED==='true'||process.env.PLAYGROUND_LIVE_DISABLED==='true')notFound();
  const {roomId}=await params;if(!/^[a-f0-9]{64}$/.test(roomId))notFound();
  return <AccessGate role="teacher"><LiveHost roomId={roomId}/></AccessGate>;
}
