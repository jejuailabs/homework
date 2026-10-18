import AccessGate from '@/components/access-gate';
import MySpace from '@/modules/my-space/workspace';
export default function MySpacePage(){return <AccessGate role="student"><MySpace/></AccessGate>;}
