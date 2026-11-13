import AccessGate from '@/components/access-gate';
import SharingGardenDashboard from '@/modules/sharing-garden/dashboard';
export default function TeacherSharingGardenPage() {return <AccessGate role="teacher"><SharingGardenDashboard/></AccessGate>;}
