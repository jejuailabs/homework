'use client';

import {ClassroomContext, type ClassroomRosterEntry} from './classroom-shared';
import {ClassroomClock, ClassroomDday, ClassroomNoise, ClassroomSounds, ClassroomTimer} from './classroom-time';
import {ClassroomArrange, ClassroomBracket, ClassroomDice, ClassroomDraw, ClassroomRace, ClassroomWheel} from './classroom-random';
import {ClassroomAir, ClassroomCeremony, ClassroomChecklist, ClassroomRoles, ClassroomScoreboard, ClassroomThermometer} from './classroom-management';
import {ClassroomBoard, ClassroomManipulatives, ClassroomMemo, ClassroomNotes, ClassroomQr, ClassroomVideo} from './classroom-creative';
import '@/styles/classroom-tools.css';

export const CLASSROOM_TOOL_IDS = ['timer', 'clock', 'dday', 'sounds', 'noise', 'draw', 'wheel', 'dice', 'coin', 'race', 'seats', 'scoreboard', 'bracket', 'manipulatives', 'memo', 'board', 'pencils', 'notes', 'qr', 'video', 'thermometer', 'ceremony', 'air', 'checklist', 'roles'] as const;

function ToolContent({toolId}: {toolId: string}) {
  switch (toolId) {
    case 'timer': return <ClassroomTimer/>;
    case 'clock': return <ClassroomClock/>;
    case 'dday': return <ClassroomDday/>;
    case 'sounds': return <ClassroomSounds/>;
    case 'noise': return <ClassroomNoise/>;
    case 'draw': return <ClassroomDraw/>;
    case 'wheel': return <ClassroomWheel/>;
    case 'dice': return <ClassroomDice/>;
    case 'coin': return <ClassroomDice coin/>;
    case 'race': return <ClassroomRace/>;
    case 'seats': return <ClassroomArrange seats/>;
    case 'scoreboard': return <ClassroomScoreboard/>;
    case 'bracket': return <ClassroomBracket/>;
    case 'manipulatives': return <ClassroomManipulatives/>;
    case 'memo': return <ClassroomMemo/>;
    case 'board': return <ClassroomBoard/>;
    case 'pencils': return <ClassroomBoard pencils/>;
    case 'notes': return <ClassroomNotes/>;
    case 'qr': return <ClassroomQr/>;
    case 'video': return <ClassroomVideo/>;
    case 'thermometer': return <ClassroomThermometer/>;
    case 'ceremony': return <ClassroomCeremony/>;
    case 'air': return <ClassroomAir/>;
    case 'checklist': return <ClassroomChecklist/>;
    case 'roles': return <ClassroomRoles/>;
    default: return null;
  }
}

export default function ClassroomTools({toolId, roster, locale = 'ko', storageScope}: {toolId: string; roster?: ClassroomRosterEntry[]; locale?: string; storageScope?: string}) {
  return <ClassroomContext.Provider key={`${storageScope || 'session'}:${toolId}`} value={{en: locale === 'en', scope: storageScope, roster}}><ToolContent toolId={toolId}/></ClassroomContext.Provider>;
}
