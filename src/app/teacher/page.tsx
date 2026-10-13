import AccessGate from '@/components/access-gate';
import TeacherWorkspace from '@/components/teacher-workspace';
export default function TeacherPage(){return <AccessGate role="teacher"><TeacherWorkspace/></AccessGate>;}
