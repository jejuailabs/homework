'use client';
import dynamic from 'next/dynamic';
import {LoaderCircle} from 'lucide-react';
import type {ToolDefinition} from '@/lib/tool-catalog';
import type {ClassroomRosterEntry} from './classroom-shared';
import ToolAssistant from './tool-assistant';
const loading = () => <LoaderCircle className="spin"/>;
const SharedCanvasTool=dynamic(()=>import('./shared-canvas'),{loading});
const ClassPollTool=dynamic(()=>import('./class-poll'),{loading});
const ClassroomTools = dynamic(() => import('./classroom-tools'), {loading});
const MatchingMaker = dynamic(() => import('./matching-maker'), {loading});
const NeighborhoodTool = dynamic(() => import('./neighborhood-tool'), {loading});
const ClassReport = dynamic(() => import('./class-report'), {loading});
const AiToolbox = dynamic(() => import('./ai-toolbox'), {loading});
const HandwritingTool=dynamic(()=>import('./handwriting-tool'),{loading});
export default function ToolRunner({tool, locale, classId, uid, roster, instance = 'primary'}: {tool: ToolDefinition; locale: 'ko'|'en'; classId: string; uid: string; roster: ClassroomRosterEntry[]; instance?: string}) {
  const primary=instance==='primary'||instance==='1';
  const scope = primary ? `${uid}:${classId}` : `${uid}:${classId}:${instance}`;
  return <div className="tools-running">{tool.kind === 'handwriting'?<HandwritingTool locale={locale}/>:tool.kind === 'canvas' ? <SharedCanvasTool classId={classId} roster={roster}/> : tool.kind === 'poll' ? <ClassPollTool classId={classId}/> : tool.kind === 'ai' ? <AiToolbox initialTool={tool.id.slice(3) as 'resource'|'adapt'|'feedback'|'notice'|'conference'|'notes'}/> : tool.kind === 'matching' ? <MatchingMaker locale={locale} storageScope={primary?uid:`${uid}:${instance}`}/> : tool.kind === 'neighborhood' ? <NeighborhoodTool locale={locale} classId={classId} storageScope={scope}/> : tool.kind === 'report' ? <ClassReport locale={locale} classId={classId}/> : <><ClassroomTools toolId={tool.id} roster={roster} locale={locale} storageScope={scope}/>{tool.ai && <ToolAssistant name={tool[locale]} locale={locale}/>}</>}</div>;
}
