import AccessGate from '@/components/access-gate';
import ToolsHub from '@/components/tools-hub';

export default function ToolsPage() {
  return <AccessGate role="teacher"><ToolsHub/></AccessGate>;
}
