import AccessGate from '@/components/access-gate';
import TeacherDashboard from '@/components/teacher-dashboard';
export default function TeacherPage(){return <AccessGate role="teacher"><TeacherDashboard/></AccessGate>;}
