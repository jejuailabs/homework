'use strict';
globalThis.ContinuousWorld = (() => {
  const data = globalThis.RQ_DATA, scale = 6, padding = 180, e = data.extent;
  const project = p => ({x: (p.x-e.minX)*scale+padding, y: (p.y-e.minY)*scale+padding});
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const roads = data.roads.map(r => ({...r, points:r.points.map(project), visualWidth: ['tertiary','secondary','primary'].includes(r.highway)?92:64}));
  const route = data.route.points.map(project), stops = data.stops.map(s=>({...s,point:project(s.point)}));
  const world = {width:(e.maxX-e.minX)*scale+padding*2,height:(e.maxY-e.minY)*scale+padding*2,cellSize:20,roads:roads.map(r=>({...r,width:r.visualWidth-18})),obstacles:[],spawn:project(data.spawn)};
  const landmarks = data.landmarks.map(l=>({...l,point:project(l.point),roadPoint:project(l.roadPoint)}));
  const sea = data.seaPolygons.map(p=>p.points.map(project));
  // Freedom to explore changes collision rules, never the source geography.
  // Use source building footprints and water; decorative image bases only add
  // small local obstacles. Both travel modes use the same ground-level radius.
  world.freeRoam=true;
  world.actorRadius=8;
  world.water=sea;
  world.solids=data.buildings.map(b=>b.points.map(project));
  function inPolygon(p,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
  const isSea = p => sea.some(poly=>inPolygon(p,poly));
  function roadDistance(p){let best=Infinity;for(const r of roads)for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],dx=b.x-a.x,dy=b.y-a.y;const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t)-r.visualWidth/2);}return best;}
  const school=landmarks.find(l=>l.id==='school'),post=landmarks.find(l=>l.id==='post');
  // Landmark coordinates never move for the artwork. Tall images are billboards
  // anchored at those coordinates; nearby actors fade foreground occlusion.
  const objects=[{key:'school',point:school.point,height:310,label:school.name,kind:'landmark'},{key:'postoffice',point:post.point,height:260,label:post.name,kind:'landmark'}];
  const houseKeys=['homeLavender','homePeach','shop','homeTeal'];
  for(const b of data.buildings){const pts=b.points.map(project);const center={x:pts.reduce((s,p)=>s+p.x,0)/pts.length,y:pts.reduce((s,p)=>s+p.y,0)/pts.length};if(center.x<0||center.y<0||center.x>world.width||center.y>world.height||distance(center,school.point)<130||distance(center,post.point)<100)continue;let height=190+Number(b.id)%45;while(height>95&&[-1,1].some(side=>isSea({x:center.x+side*height*.43,y:center.y})||isSea({x:center.x+side*height*.3,y:center.y-height*.14})))height-=15;objects.push({key:houseKeys[Number(b.id)%4],point:center,height,kind:'building',osmId:b.id});}
  for(const o of objects)if(o.kind==='building'){const gap=Math.min(...objects.filter(other=>other!==o).map(other=>distance(o.point,other.point)));o.height=Math.min(o.height,Math.max(125,gap*1.4));}
  let seed=371530161;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  // Greenery and street furniture are decorative; they never create new roads
  // or stand in for unverified institutions or cultural landmarks.
  for(let y=200;y<world.height-120;y+=125)for(let x=180;x<world.width-120;x+=125){const p={x:x+random()*85-42,y:y+random()*85-42};if(isSea(p)||roadDistance(p)<68||objects.some(o=>o.kind!=='plant'&&distance(p,o.point)<110))continue;if(random()>.6)continue;objects.push({key:random()>.28?'tree':'mandarin',point:p,height:115+random()*70,kind:'plant'});}
  let traversed=0,nextProp=50;
  for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],len=distance(a,b);while(nextProp<=traversed+len){const t=(nextProp-traversed)/len,n={x:-(b.y-a.y)/len,y:(b.x-a.x)/len};for(const side of [-1,1]){const p={x:a.x+(b.x-a.x)*t+n.x*side*78,y:a.y+(b.y-a.y)*t+n.y*side*78};if(!isSea(p)&&roadDistance(p)>23&&!objects.some(o=>distance(p,o.point)<75)){const index=Math.round(nextProp/140);objects.push({key:index%4===0?'lamp':index%4===1?'planter':index%4===2?'tree':'bench',point:p,height:index%4===0?135:index%4===1?64:index%4===2?140:65,kind:'prop'});}}nextProp+=145;}traversed+=len;}
  function npcAt(stop){const idx=stop.routeIndex,a=route[Math.max(0,idx-1)],b=route[Math.min(route.length-1,idx+1)],len=distance(a,b)||1;const candidates=[-1,1].map(side=>({x:stop.point.x-(b.y-a.y)/len*77*side,y:stop.point.y+(b.x-a.x)/len*77*side}));const score=p=>(isSea(p)?10000:0)+objects.reduce((sum,o)=>sum+(Math.abs(p.x-o.point.x)<o.height*.5&&p.y>o.point.y-o.height&&p.y<o.point.y+45?o.kind==='building'||o.kind==='landmark'?100:1:0),0);return candidates.sort((a,b)=>score(a)-score(b))[0];}
  const npcs=[{id:'school',name:'모모',point:{x:world.spawn.x-117.82,y:world.spawn.y+54.94},target:world.spawn},{id:'coast',name:'해안의 모모',point:npcAt(stops[2]),target:stops[2].point}];
  for(let i=objects.length-1;i>=0;i--)if(['plant','prop'].includes(objects[i].kind)&&npcs.some(n=>distance(n.point,objects[i].point)<85))objects.splice(i,1);
  world.obstacles=npcs.map(n=>({x:n.point.x-33,y:n.point.y-19,width:66,height:38}));
  for(const o of objects){
    const available=roadDistance(o.point)-world.actorRadius-4;
    if(available<=3)continue;
    if(o.kind==='building'||o.kind==='landmark'){
      const halfWidth=o.height*.28,halfDepth=o.height*.08;
      const factor=Math.min(1,available/Math.hypot(halfWidth,halfDepth));
      world.obstacles.push({x:o.point.x-halfWidth*factor,y:o.point.y-halfDepth*factor,width:halfWidth*factor*2,height:halfDepth*factor*2});
    }else{
      // Collide with tree trunks and furniture bases, not their tall canopies.
      const radius=Math.min(available,o.key==='lamp'?5:o.key==='bench'?17:o.key==='planter'?14:11);
      world.obstacles.push({x:o.point.x,y:o.point.y,radius});
    }
  }
  return {data,scale,padding,project,world,roads,route,stops,landmarks,sea,objects,npcs,isSea,roadDistance};
})();
