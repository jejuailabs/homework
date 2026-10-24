'use client';
import {ArrowLeft,RefreshCw,Settings2,Users} from 'lucide-react';
import type {ReactNode} from 'react';
import type {CanvasPeer} from './canvas-editor';
/** Session controls share one row; their panels never consume board height. */
export default function CanvasSessionBar({title,connected,saving,name,peers,english,onBack,onReconnect,settings}:{title:string;connected:boolean;saving:boolean;name?:string;peers:CanvasPeer[];english:boolean;onBack:()=>void;onReconnect:()=>void;settings?:ReactNode}){
  const w=(ko:string,en:string)=>english?en:ko;
  return <header className="canvas-session-bar"><button type="button" className="button canvas-session-back" onClick={onBack} aria-label={w('캔버스 목록','All canvases')} title={w('캔버스 목록','All canvases')}><ArrowLeft size={17}/></button><h2 title={title}>{title}</h2><span className={`shared-canvas-connection${connected?' is-online':''}`} role="status">{connected?saving?w('저장 중','Saving'):w('저장됨','Saved'):w('연결 중','Connecting')}</span><div className="canvas-session-controls"><details className="canvas-session-people"><summary aria-label={w('참여자 목록','Participants')}><Users size={15}/><span>{peers.length+1}</span></summary><div><span>{name} {w('(나)','(me)')}</span>{peers.map(peer=><span key={peer.id} style={{borderLeftColor:peer.color}}>{peer.name}</span>)}</div></details><button type="button" className="button canvas-session-reconnect" onClick={onReconnect} aria-label={w('다시 연결','Reconnect')} title={w('다시 연결','Reconnect')}><RefreshCw size={15}/></button>{settings&&<details className="shared-canvas-settings"><summary aria-label={w('수업 설정·저장·기록','Lesson settings, save & history')}><Settings2 size={15}/><span>{w('수업 설정·저장·기록','Lesson settings, save & history')}</span></summary>{settings}</details>}</div></header>;
}
