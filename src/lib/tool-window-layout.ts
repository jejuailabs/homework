/** Preferred working space, rather than a single size shared by every tool. */
export function toolWindowLayout(id:string){
  if(['canvas','board','pencils'].includes(id))return{kind:'board',width:1360,height:900,maximized:true};
  if(id==='handwriting')return{kind:'document',width:1440,height:960,maximized:false};
  if(id.startsWith('ai-')||['report','notes','neighborhood','matching'].includes(id))return{kind:'document',width:1240,height:900,maximized:false};
  if(['seats','bracket','manipulatives','video','ceremony','checklist','roles','vote','scoreboard'].includes(id))return{kind:'workspace',width:1120,height:820,maximized:false};
  if(id==='memo')return{kind:'compact',width:620,height:720,maximized:false};
  if(['clock','dice','coin','noise','memo'].includes(id))return{kind:'compact',width:560,height:560,maximized:false};
  return{kind:'standard',width:820,height:720,maximized:false};
}

export function initialToolWindow(id:string,viewport:{width:number;height:number},offset=0){
  const layout=toolWindowLayout(id),small=viewport.width<=700;
  const maximized=layout.maximized||small||(layout.kind==='document'&&(viewport.width<1180||viewport.height<820))||(layout.kind==='workspace'&&viewport.height<720)||(id==='timer'&&viewport.height<760);
  const width=Math.min(layout.width,viewport.width-24),height=Math.min(layout.height,viewport.height-80);
  return{maximized,x:Math.max(12,Math.min(viewport.width-width-12,(viewport.width-width)/2+offset)),y:Math.max(12,Math.min(viewport.height-height-68,(viewport.height-height)/2+offset))};
}
