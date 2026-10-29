export const BOARD_TEXT_LIMIT = 10000;
export const BOARD_PAGE_LIMIT = 50;
export const boardThemes = [
  {name:'숲 칠판',en:'Forest',color:'#123e35',ink:'#fff9e9'},
  {name:'밤 칠판',en:'Midnight',color:'#252b38',ink:'#f9f6ed'},
  {name:'바다 칠판',en:'Ocean',color:'#153e56',ink:'#fff9e9'},
  {name:'포도 칠판',en:'Plum',color:'#44314e',ink:'#fff6e9'},
  {name:'크림 칠판',en:'Cream',color:'#faf3df',ink:'#303c35'},
  {name:'하얀 칠판',en:'White',color:'#ffffff',ink:'#263b35'},
] as const;
export type BoardSettings = {background:string;color:string;fontSize:number;fontFamily:'sans'|'serif'|'mono';lineHeight:number;align:'left'|'center'|'right'};
export type BoardPage = {id:string;title:string;html:string;text:string;settings:BoardSettings;updatedAt:string};
export type BoardStore = {version:1;draft:BoardPage;pages:BoardPage[];autoSave:boolean};
export const boardDefaults: BoardSettings = {background:'#123e35',color:'#fff9e9',fontSize:48,fontFamily:'sans',lineHeight:1.6,align:'left'};
export const boardFonts = {sans:'Arial, "Noto Sans KR", sans-serif',serif:'Georgia, "Noto Serif KR", serif',mono:'"Courier New", monospace'};
const record=(v:unknown):Record<string,unknown>=>v && typeof v==='object' && !Array.isArray(v)?v as Record<string,unknown>:{};
const color=(v:unknown,fallback:string)=>typeof v==='string'&&/^#[a-f\d]{6}$/i.test(v)?v:fallback;
export function cleanBoardSettings(value:unknown):BoardSettings {
  const v=record(value);
  return {background:color(v.background,boardDefaults.background),color:color(v.color,boardDefaults.color),fontSize:typeof v.fontSize==='number'&&Number.isFinite(v.fontSize)?Math.max(16,Math.min(120,v.fontSize)):48,fontFamily:v.fontFamily==='serif'||v.fontFamily==='mono'?v.fontFamily:'sans',lineHeight:typeof v.lineHeight==='number'&&Number.isFinite(v.lineHeight)?Math.max(1.1,Math.min(2.5,v.lineHeight)):1.6,align:v.align==='center'||v.align==='right'?v.align:'left'};
}
export function newBoardPage():BoardPage {return {id:crypto.randomUUID(),title:'',html:'',text:'',settings:{...boardDefaults},updatedAt:new Date().toISOString()};}
export function cleanBoardPage(value:unknown):BoardPage|null {
  const v=record(value);
  if(typeof v.id!=='string'||!/^[\w-]{1,100}$/.test(v.id)||typeof v.html!=='string'||v.html.length>400000||typeof v.text!=='string'||v.text.length>BOARD_TEXT_LIMIT)return null;
  return {id:v.id,title:typeof v.title==='string'?v.title.slice(0,100):'',html:v.html,text:v.text,settings:cleanBoardSettings(v.settings),updatedAt:typeof v.updatedAt==='string'&&Number.isFinite(Date.parse(v.updatedAt))?v.updatedAt:new Date().toISOString()};
}
export function cleanBoardStore(value:unknown):BoardStore|null {
  const v=record(value),draft=cleanBoardPage(v.draft);
  if(v.version!==1||!draft||!Array.isArray(v.pages)||v.pages.length>BOARD_PAGE_LIMIT)return null;
  const pages=v.pages.map(cleanBoardPage);
  if(pages.some(p=>!p)||new Set(pages.map(p=>p!.id)).size!==pages.length)return null;
  return {version:1,draft,pages:pages as BoardPage[],autoSave:v.autoSave!==false};
}
export function saveBoardPage(pages:BoardPage[],page:BoardPage):BoardPage[] {
  if(!pages.some(p=>p.id===page.id)&&pages.length>=BOARD_PAGE_LIMIT)throw Error('BOARD_FULL');
  return [page,...pages.filter(p=>p.id!==page.id)];
}
export function boardTitle(page:BoardPage) {return page.title.trim()||page.text.trim().split('\n')[0]?.slice(0,60)||'새 칠판';}
