export type ToolCategory = 'focus' | 'random' | 'play' | 'materials' | 'class' | 'prepare';
export type ToolDefinition = {id: string; ko: string; en: string; category: ToolCategory; icon: string; color: string; ai?: boolean; kind?: 'ai' | 'matching' | 'neighborhood' | 'report' | 'poll' | 'canvas' | 'handwriting'};
export const toolCategories: {id: ToolCategory; ko: string; en: string}[] = [
  {id: 'focus', ko: '시간·집중', en: 'Time & focus'}, {id: 'random', ko: '뽑기·모둠', en: 'Pick & group'},
  {id: 'play', ko: '놀이·활동', en: 'Games & activities'}, {id: 'materials', ko: '판서·자료', en: 'Board & materials'},
  {id: 'class', ko: '학급 운영', en: 'Classroom'}, {id: 'prepare', ko: '수업 준비·기록', en: 'Plan & reflect'},
];
// A module can be removed here or disabled with TOOLS_DISABLED without removing saved work.
export const toolCatalog: ToolDefinition[] = [
  {id:'canvas',ko:'함께캔버스',en:'Together Canvas',category:'materials',icon:'PanelsTopLeft',color:'mint',kind:'canvas'},
  {id:'vote',ko:'우리 반 투표',en:'Class poll',category:'class',icon:'Vote',color:'lavender',kind:'poll'},
  {id:'timer',ko:'타이머',en:'Timer',category:'focus',icon:'Timer',color:'peach',ai:true},
  {id:'clock',ko:'시계',en:'Clock',category:'focus',icon:'Clock3',color:'sky'},
  {id:'dday',ko:'디데이',en:'Countdown',category:'focus',icon:'CalendarDays',color:'lavender'},
  {id:'sounds',ko:'효과음',en:'Sound cues',category:'focus',icon:'Volume2',color:'yellow'},
  {id:'noise',ko:'소음 측정',en:'Sound meter',category:'focus',icon:'AudioLines',color:'mint'},
  {id:'draw',ko:'랜덤 뽑기',en:'Random picker',category:'random',icon:'Ticket',color:'peach'},
  {id:'wheel',ko:'돌림판',en:'Spin wheel',category:'random',icon:'Disc3',color:'lavender'},
  {id:'dice',ko:'주사위',en:'Dice',category:'random',icon:'Dices',color:'sky'},
  {id:'coin',ko:'동전 던지기',en:'Coin toss',category:'random',icon:'CircleDollarSign',color:'yellow'},
  {id:'race',ko:'뽑기 레이스',en:'Pick a racer',category:'random',icon:'Flag',color:'mint'},
  {id:'seats',ko:'자리·모둠',en:'Seats & teams',category:'random',icon:'Armchair',color:'pink',ai:true},
  {id:'scoreboard',ko:'점수판',en:'Scoreboard',category:'play',icon:'Trophy',color:'yellow'},
  {id:'bracket',ko:'대진표',en:'Tournament',category:'play',icon:'GitFork',color:'sky'},
  {id:'manipulatives',ko:'디지털 교구',en:'Math objects',category:'play',icon:'Shapes',color:'mint',ai:true},
  {id:'matching',ko:'같은 그림 찾기',en:'Picture match',category:'play',icon:'ScanEye',color:'peach',ai:true,kind:'matching'},
  {id:'memo',ko:'메모',en:'Memo',category:'materials',icon:'StickyNote',color:'yellow'},
  {id:'board',ko:'판서',en:'Classroom board',category:'materials',icon:'Presentation',color:'sky'},
  {id:'notes',ko:'노트',en:'Notebook',category:'materials',icon:'NotebookPen',color:'lavender',ai:true},
  {id:'handwriting',ko:'사진 글 정리',en:'Photo writing',category:'materials',icon:'FileText',color:'mint',ai:true,kind:'handwriting'},
  {id:'qr',ko:'QR 코드',en:'QR code',category:'materials',icon:'QrCode',color:'mint'},
  {id:'video',ko:'영상 재생',en:'Video player',category:'materials',icon:'Clapperboard',color:'peach'},
  {id:'thermometer',ko:'학급 온도계',en:'Class check-in',category:'class',icon:'ThermometerSun',color:'peach'},
  {id:'ceremony',ko:'국민의례',en:'Ceremony',category:'class',icon:'Flag',color:'sky'},
  {id:'air',ko:'미세먼지',en:'Air quality',category:'class',icon:'Wind',color:'mint'},
  {id:'checklist',ko:'체크리스트',en:'Checklist',category:'class',icon:'ListChecks',color:'lavender',ai:true},
  {id:'roles',ko:'1인 1역',en:'Class jobs',category:'class',icon:'BadgeCheck',color:'yellow',ai:true},
  {id:'neighborhood',ko:'우리 동네 탐험',en:'Our neighborhood',category:'prepare',icon:'MapPinned',color:'mint',ai:true,kind:'neighborhood'},
  {id:'report',ko:'학급·수업 리포트',en:'Class report',category:'prepare',icon:'ChartNoAxesCombined',color:'sky',ai:true,kind:'report'},
  {id:'ai-resource',ko:'수업자료',en:'Lesson draft',category:'prepare',icon:'BookOpen',color:'peach',ai:true,kind:'ai'},
  {id:'ai-adapt',ko:'수준 맞추기',en:'Adapt a text',category:'prepare',icon:'Languages',color:'mint',ai:true,kind:'ai'},
  {id:'ai-feedback',ko:'피드백',en:'Feedback',category:'prepare',icon:'MessageCircleHeart',color:'pink',ai:true,kind:'ai'},
  {id:'ai-notice',ko:'안내문',en:'Class notice',category:'prepare',icon:'Megaphone',color:'yellow',ai:true,kind:'ai'},
  {id:'ai-conference',ko:'상담 준비',en:'Conference',category:'prepare',icon:'HeartHandshake',color:'lavender',ai:true,kind:'ai'},
  {id:'ai-notes',ko:'관찰·회의 기록',en:'Observation notes',category:'prepare',icon:'FileText',color:'sky',ai:true,kind:'ai'},
];
export const toolIds = toolCatalog.map(tool => tool.id);
export type ToolPreferences = {favorites: string[]; hidden: string[]; recent: string[]};
export const defaultToolPreferences: ToolPreferences = {favorites: ['timer','draw','sounds','matching','neighborhood','report'], hidden: [], recent: []};
export function normalizeToolPreferences(value: unknown): ToolPreferences {
  const input = value && typeof value === 'object' ? value as Partial<ToolPreferences> : {};
  const list = (v: unknown, fallback: string[], limit: number, legacy=false) => Array.isArray(v) ? [...new Set(v.map(id=>id==='pencils'&&legacy?'board':id).filter((id): id is string => typeof id === 'string' && toolIds.includes(id)))].slice(0,limit) : [...fallback];
  return {favorites:list(input.favorites,defaultToolPreferences.favorites,toolCatalog.length,true),hidden:list(input.hidden,[],toolCatalog.length),recent:list(input.recent,[],8,true)};
}
