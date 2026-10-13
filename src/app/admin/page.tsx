import AccessGate from '@/components/access-gate';
import AdminWorkspace from '@/components/admin-workspace';
export default function AdminPage(){return <AccessGate role="admin"><AdminWorkspace/></AccessGate>;}
