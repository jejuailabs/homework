import {Suspense} from 'react';
import {LoaderCircle} from 'lucide-react';
import AccessGate from '@/components/access-gate';
import TeacherWorkspace from '@/components/teacher-workspace';

export default function TeacherHomeworkPage() {
  return <AccessGate role="teacher"><Suspense fallback={<div className="center-state" role="status" aria-busy="true"><LoaderCircle className="spin"/></div>}><TeacherWorkspace/></Suspense></AccessGate>;
}
