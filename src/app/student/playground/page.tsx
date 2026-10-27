import {notFound} from 'next/navigation';
import AccessGate from '@/components/access-gate';
import PlaygroundHub from '@/modules/playground/hub';
export default function StudentPlaygroundPage() {
  if (process.env.PLAYGROUND_DISABLED === 'true') notFound();
  return <AccessGate role="student"><PlaygroundHub/></AccessGate>;
}
