import AccessGate from '@/components/access-gate';
import AiToolbox from '@/components/ai-toolbox';
import '@/styles/ai.css';

export default function ToolsPage() {
  return <AccessGate role="teacher"><AiToolbox/></AccessGate>;
}
