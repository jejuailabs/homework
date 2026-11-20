import AccessGate from '@/components/access-gate';
import ToolsHub from '@/components/tools-hub';
import ClassScreenEntry from '@/modules/class-screen/entry';

export default function ToolsPage() {
  return <AccessGate role="teacher"><ClassScreenEntry/><ToolsHub/></AccessGate>;
}
