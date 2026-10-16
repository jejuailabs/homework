import AccessGate from '@/components/access-gate';
import SharedCanvasTool from '@/components/shared-canvas';
export default function StudentCanvasesPage(){return <AccessGate role="student"><SharedCanvasTool student/></AccessGate>;}
