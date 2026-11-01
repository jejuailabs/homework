import AccessGate from '@/components/access-gate';
import BerryConnections from '@/modules/berry-connector/connections';
export default function TeacherConnectionsPage() {return <AccessGate role="teacher"><BerryConnections/></AccessGate>;}
