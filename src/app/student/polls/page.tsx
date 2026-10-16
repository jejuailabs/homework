import AccessGate from '@/components/access-gate';
import ClassPollTool from '@/components/class-poll';
export default function StudentPollsPage(){return <AccessGate role="student"><ClassPollTool student/></AccessGate>;}
