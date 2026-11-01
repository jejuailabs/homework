import AccessGate from '@/components/access-gate';
import TeacherWorkspace from '@/modules/teacher-workspace/workspace';
export default function TeacherWorkspacePage() {return <AccessGate role="teacher"><TeacherWorkspace/></AccessGate>;}
