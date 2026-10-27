import {notFound} from 'next/navigation';
import AccessGate from '@/components/access-gate';
import PlaygroundTeacher from '@/modules/playground/teacher';
export default function TeacherPlaygroundPage() {
  if (process.env.PLAYGROUND_DISABLED === 'true') notFound();
  return <AccessGate role="teacher"><PlaygroundTeacher/></AccessGate>;
}
