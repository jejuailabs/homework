import {notFound} from 'next/navigation';
import AccessGate from '@/components/access-gate';
import ToolsHub from '@/components/tools-hub';
import {toolIds} from '@/lib/tool-catalog';
export default async function ToolPage({params,searchParams}:{params:Promise<{toolId:string}>;searchParams:Promise<{classId?:string;instance?:string}>}) {
  const query=await searchParams;const safe=(value?:string)=>value&&/^[A-Za-z0-9_-]{1,200}$/.test(value)?value:undefined;
  const {toolId}=await params;
  if(!toolIds.includes(toolId)) notFound();
  return <AccessGate role="teacher"><ToolsHub initialTool={toolId} initialClassId={safe(query.classId)} instanceId={safe(query.instance)}/></AccessGate>;
}
