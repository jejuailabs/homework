import AccessGate from '@/components/access-gate';
import ExhibitionWorkspace from '@/components/exhibition-workspace';

export default function StudentExhibitionsPage() {
  return <AccessGate role="student"><ExhibitionWorkspace role="student"/></AccessGate>;
}
