import AccessGate from '@/components/access-gate';
import TeacherNotebook from '@/modules/teacher-notebook/notebook';
export default function TeacherNotebookPage() {return <AccessGate role="teacher"><TeacherNotebook/></AccessGate>;}
