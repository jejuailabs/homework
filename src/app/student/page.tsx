import AccessGate from '@/components/access-gate';
import StudentWorkspace from '@/components/student-workspace';
export default function StudentPage(){return <AccessGate role="student"><StudentWorkspace/></AccessGate>;}
