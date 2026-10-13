import AccessGate from '@/components/access-gate';
import ExhibitionWorkspace from '@/components/exhibition-workspace';

export default function TeacherExhibitionsPage() {
  return <AccessGate role="teacher"><ExhibitionWorkspace role="teacher"/></AccessGate>;
}
