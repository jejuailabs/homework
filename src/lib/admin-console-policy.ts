export const adminContent = {
  homework: {collection:'assignments', label:'숙제'},
  exhibitions: {collection:'exhibitions', label:'전시실'},
  boards: {collection:'participationBoards', label:'참여보드'},
  cards: {collection:'cardSets', label:'카드'},
  distributions: {collection:'cardClassSets', label:'학급 배포 카드'},
  canvases: {collection:'classCanvases', label:'함께캔버스'},
} as const;
export type AdminContentKind = keyof typeof adminContent;
export function contentKind(value:string):AdminContentKind {
  if (!Object.hasOwn(adminContent,value)) throw Error('INVALID_KIND');
  return value as AdminContentKind;
}
export function csvCell(value:unknown) {
  let text=value==null?'':String(value);
  if (/^[\s]*[=+@\-]/.test(text)) text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export function adminDate(value:string,end=false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('INVALID_DATE');
  const time=Date.parse(value+'T00:00:00+09:00');
  if (!Number.isFinite(time)||new Date(time+9*3600_000).toISOString().slice(0,10)!==value) throw Error('INVALID_DATE');
  return new Date(time+(end?86_400_000:0)).toISOString();
}
export function safeAccountChange(actor:{uid:string;role:string},target:{uid:string;role:string}) {
  return actor.uid!==target.uid&&target.role!=='superadmin'&&(target.role!=='admin'||actor.role==='superadmin');
}
export function storageKind(path:string) {
  if(path.startsWith('admin-quarantine/'))return 'quarantine';
  if(path.startsWith('assignment-materials/'))return 'materials';
  if(path.startsWith('exhibition-'))return 'exhibitions';
  if(path.startsWith('participation-'))return 'boards';
  if(path.startsWith('class-canvas-assets/'))return 'canvases';
  if(path.startsWith('submissions/')||path.startsWith('uploads/'))return 'homework';
  return 'other';
}
