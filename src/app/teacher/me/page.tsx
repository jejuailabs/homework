import AccessGate from '@/components/access-gate';
import TeacherMyPage from '@/modules/teacher-notebook/my-page';
export default function TeacherMyPageRoute() {return <AccessGate role="teacher"><TeacherMyPage/></AccessGate>;}
