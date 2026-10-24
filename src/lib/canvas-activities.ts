import type {CanvasObject} from './canvas-document';
export type CanvasActivity='groups'|'wonder'|'story'|'compare';
export const CANVAS_ACTIVITIES=[
  {id:'groups',ko:'모둠 탐구',en:'Group inquiry',description:'모둠별로 사진·그림·생각을 모아요.',english:'Collect each group’s photos, drawings and ideas.'},
  {id:'wonder',ko:'알고·궁금·배운 것',en:'Know · wonder · learn',description:'질문에서 시작해 배운 것을 연결해요.',english:'Start with questions and connect what you learn.'},
  {id:'story',ko:'이야기 이어 만들기',en:'Build a story',description:'처음·가운데·끝을 함께 채워요.',english:'Create a beginning, middle and ending together.'},
  {id:'compare',ko:'비교하고 발견하기',en:'Compare & discover',description:'같은 점·다른 점에서 새 생각을 찾아요.',english:'Find new ideas through similarities and differences.'},
] as const;
export function canvasActivityObjects(activity:CanvasActivity,x:number,y:number,english=false):(Partial<CanvasObject>&{type:CanvasObject['type']})[]{
  const labels=activity==='groups'?Array.from({length:6},(_,i)=>english?`Group ${i+1}`:`${i+1}모둠`):activity==='wonder'?(english?['What we know','What we wonder','What we learned']:['알고 있는 것','궁금한 것','새롭게 배운 것']):activity==='story'?(english?['Beginning','Middle','Ending']:['처음','가운데','끝']):(english?['Similarities','Differences']:['같은 점','다른 점']);
  const colors=['#fef0b5','#dceee3','#e5dff5','#dcedfa','#f9e0d5','#f5dce7'],columns=activity==='groups'?3:labels.length,width=640,height=500,result:(Partial<CanvasObject>&{type:CanvasObject['type']})[]=[];
  labels.forEach((label,i)=>{const left=x+(i%columns)*(width+64),top=y+Math.floor(i/columns)*(height+80);result.push({type:'shape',shape:'frame',x:left,y:top,w:width,h:height,text:label,fill:colors[i],color:'#566b61',width:2,locked:true});result.push({type:'text',note:true,x:left+32,y:top+78,w:270,h:180,text:english?'Add an idea, a photo, or a question.':'우리의 생각·사진·질문을 모아 보세요.',fill:colors[i],color:'#344e45',fontSize:24,autoHeight:true});});return result;
}
