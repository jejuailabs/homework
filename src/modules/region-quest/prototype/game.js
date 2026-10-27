(() => {
  'use strict';
  const M = globalThis.RegionQuestModel, A = globalThis.RQ_ASSETS;
  const $ = id => document.getElementById(id);
  const canvas = $('world'), ctx = canvas.getContext('2d'), mini = $('minimap'), mctx = mini.getContext('2d');
  const dialogue = $('conversation'), panel = $('panel');
  const {world, locations: {home, guide, letter, mailbox}} = globalThis.RegionQuestWorld;
  const directions = ['down','left','right','up'];
  const quest = {
    meet: {title:'우체부 모모를 만나 봐요',text:'파란 모자를 쓴 모모가 기다리고 있어요.',step:1},
    find: {title:'보라색 편지를 찾아요',text:'광장에 놓인 편지를 찾아 가방에 넣어요.',step:2},
    deliver: {title:'빨간 우체통에 편지를 전해요',text:'오른쪽 정류장 옆 우체통으로 가 볼까요?',step:3},
    done: {title:'첫 번째 심부름, 성공!',text:'이야기 카드를 받았어요. 자유롭게 걸어 보세요.',step:4},
  };
  let state = M.createState(), images = {}, path = [], arrival = null, keys = new Set(), loaded = false;
  let view = {width:0,height:0,scale:1,x:0,y:0}, lastTime = 0, walking = false, lastSave = 0;
  let toastTimer = 0, pointerHeld = null, inspectorWalk = true, inspectorCanvases = [];
  let loadReceived = false, panelKind = '', targetRing = null;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const active = () => !dialogue.open && !panel.open && !state.atHome;
  function send(message) {if (window.parent !== window) window.parent.postMessage(message, '*');}
  function save() {if (!loaded || !loadReceived) return; send({type:'rq-save',state});lastSave=performance.now();}
  function toast(message) {$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2600);}
  function stop() {path=[];arrival=null;keys.clear();pointerHeld=null;walking=false;}
  function focusWorld() {canvas.focus({preventScroll:true});}
  function refresh() {
    const q=quest[state.phase];
    $('quest-title').textContent=state.atHome?'학교에서 잠깐 쉬는 중':q.title;
    $('quest-description').textContent=state.atHome?'탐험 계속을 누르면 아까 있던 곳으로 돌아가요.':q.text;
    $('quest-step').textContent=state.atHome?'귀환한 동안에도 미션은 그대로':'첫 번째 이야기 · 작은 편지';
    $('progress-label').textContent=q.step+' / 4';$('progress-fill').style.width=(q.step/4*100)+'%';
    $('home-label').textContent=state.atHome?'탐험 계속':'학교로';
    $('guide-button').textContent=state.atHome?'탐험 계속 ↗':state.phase==='done'?'모모에게 ↗':'길 안내 ↗';
    $('card-count').textContent=state.phase==='done'?'1':'0';
  }
  function change(event) {state=M.advanceQuest(state,event,world);refresh();save();}
  function showDialogue(text,choices,name='우체부 모모') {
    stop();$('dialogue-name').textContent=name;$('dialogue-text').textContent=text;
    $('portrait').src=A.npc;$('portrait').alt=name;$('choices').replaceChildren();
    choices.forEach(({label,action})=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);$('choices').append(b);});
    if(!dialogue.open)dialogue.showModal();$('choices').querySelector('button')?.focus();
  }
  function closeDialogue() {dialogue.close();focusWorld();}
  function talk() {
    if(state.atHome)return;
    if(state.phase==='meet')showDialogue('안녕! 나는 우체부 모모야.\n광장에 있는 보라색 편지를 우체통에 전해 줄래?',[
      {label:'내가 해 볼게요!',action:()=>{change('accept');closeDialogue();toast('광장에 놓인 보라색 편지를 찾아보세요.');}},
      {label:'어떻게 움직여요?',action:()=>showDialogue('바닥을 누르면 그곳으로 걸어가!\n방향키로도 움직일 수 있어. 가까이 와서 E를 눌러 봐.',[{label:'알겠어요, 시작할게요!',action:()=>{change('accept');closeDialogue();}}])},
    ]);
    else if(state.phase==='find')showDialogue('광장 가운데 작은 편지가 보여?\n편지에 가까이 가서 찾아봐.',[{label:'편지 쪽으로 갈게요',action:()=>{closeDialogue();goTo(letter,'letter');}},{label:'조금 더 둘러볼게요',action:closeDialogue}]);
    else if(state.phase==='deliver')showDialogue('편지를 찾았구나! 이제 정류장 옆\n빨간 우체통에 넣으면 돼.',[{label:'우체통으로 갈게요',action:()=>{closeDialogue();goTo(mailbox,'mailbox');}},{label:'알겠어요',action:closeDialogue}]);
    else showDialogue('덕분에 편지가 출발할 수 있겠어. 고마워!\n이야기 카드를 보거나 마을을 더 걸어 봐.',[{label:'이야기 카드 보기',action:()=>{closeDialogue();openBook();}},{label:'산책을 계속할게요',action:closeDialogue}]);
  }
  function interact(kind) {
    if(!active())return;
    if(kind==='guide')return talk();
    if(kind==='letter'&&state.phase==='find')return showDialogue('작은 보라색 편지를 찾았어요!\n우체통까지 안전하게 가져가 볼까요?',[{label:'가방에 넣을게요',action:()=>{change('collect');closeDialogue();toast('편지를 챙겼어요. 빨간 우체통을 찾아가세요.');}}],'보라색 편지');
    if(kind==='mailbox') {
      if(state.phase==='deliver')showDialogue('빨간 우체통 앞에 도착했어요.\n어떻게 하면 편지가 출발할 수 있을까요?',[
        {label:'우체통에 넣어요',action:()=>{change('deliver');showDialogue('잘했어! 첫 번째 심부름을 마쳤구나.\n작은 친절 이야기 카드를 받았어.',[{label:'카드 볼래요!',action:()=>{closeDialogue();openBook();}},{label:'더 걸어 볼래요',action:closeDialogue}]);}},
        {label:'다시 가방에 넣어요',action:()=>showDialogue('가방에만 있으면 편지가 기다리겠지?\n우체통에 넣으면 모모가 가져갈 수 있어.',[{label:'그럼 우체통에 넣을게요',action:()=>{change('deliver');closeDialogue();toast('심부름 완료! 이야기 카드가 생겼어요.');}},{label:'잠깐 더 생각할래요',action:closeDialogue}])},
      ],'빨간 우체통');
      else toast(state.phase==='done'?'편지를 잘 전했어요!':'먼저 모모의 부탁을 들어 보세요.');
    }
  }
  function nearest() {
    const candidates=[{kind:'guide',point:guide,label:'모모와 이야기하기'},{kind:'mailbox',point:mailbox,label:'우체통 살펴보기'}];
    if(state.phase==='find')candidates.push({kind:'letter',point:letter,label:'보라색 편지 줍기'});
    return candidates.filter(p=>distance(state.position,p.point)<125).sort((a,b)=>distance(state.position,a.point)-distance(state.position,b.point))[0];
  }
  function goTo(point,kind=null) {
    if(state.atHome){toast('먼저 탐험 계속을 눌러 주세요.');return;}
    const goal=kind==='guide'?{x:guide.x,y:guide.y+70}:kind==='mailbox'?{x:mailbox.x-40,y:mailbox.y+45}:point;
    if(!M.isWalkable(goal,world)){toast('사람이나 건물이 있는 곳이에요. 옆의 빈 바닥을 눌러 주세요.');return;}
    if(kind&&distance(state.position,point)<100){interact(kind);return;}
    const route=M.findPath(state.position,goal,world);
    if(!route.length){toast('다른 바닥을 눌러 보세요.');return;}
    keys.clear();pointerHeld=null;path=route;arrival=kind;targetRing={...goal,at:performance.now()};focusWorld();
  }
  function guideToQuest() {
    if(state.atHome)return returnOrResume();
    const kind=state.phase==='find'?'letter':state.phase==='deliver'?'mailbox':'guide';
    goTo({guide,letter,mailbox}[kind],kind);
  }
  function returnOrResume() {
    stop();if(dialogue.open)dialogue.close();if(panel.open)panel.close();
    if(state.atHome){state=M.resumeAdventure(state,world);toast('아까 하던 탐험을 이어 가요.');}
    else {state=M.returnHome(state,home,world);toast('학교에 돌아왔어요. 진행 중인 미션은 그대로예요.');}
    refresh();save();focusWorld();
  }
  function openPanel(title,kind) {stop();save();panelKind=kind;inspectorCanvases=[];$('panel-title').textContent=title;$('panel-content').replaceChildren();if(!panel.open)panel.showModal();}
  function paragraph(text) {const p=document.createElement('p');p.className='body-copy';p.textContent=text;return p;}
  function openCharacter() {
    openPanel('앞모습도, 뒷모습도 같은 친구','character');
    $('panel-content').append(paragraph('3D 모델 없이 만든 2D 캐릭터예요. 방향마다 3장의 그림을 바꿔서 걷고 있어요. 네 방향의 얼굴·옷·가방과 발 움직임을 비교해 보세요.'));
    const grid=document.createElement('div');grid.className='character-grid';
    ['앞모습','왼쪽','오른쪽','뒷모습'].forEach((label,row)=>{const cell=document.createElement('div');cell.className='character-cell';const c=document.createElement('canvas');c.width=160;c.height=210;const text=document.createElement('span');text.textContent=label;cell.append(c,text);grid.append(cell);inspectorCanvases.push({c,row});});
    $('panel-content').append(grid);const controls=document.createElement('div');controls.className='pill-row';
    [true,false].forEach(walk=>{const b=document.createElement('button');b.textContent=walk?'걸어 보기':'멈춰 보기';b.className=inspectorWalk===walk?'active':'';b.onclick=()=>{inspectorWalk=walk;controls.querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active');};controls.append(b);});$('panel-content').append(controls);
  }
  function openBook() {
    openPanel('나의 첫 번째 이야기 카드','book');
    const card=document.createElement('article');card.className='book-card';
    const icon=document.createElement('div');icon.className='big';icon.textContent=state.phase==='done'?'✉':'♧';
    const title=document.createElement('h3');title.textContent=state.phase==='done'?'작은 친절, 첫 번째 배달':'아직 빈 페이지예요';
    const p=document.createElement('p');p.textContent=state.phase==='done'?'모모의 부탁을 듣고 편지를 찾아 우체통에 전했어요. 다음 모험에서는 진짜 우리 동네의 이야기를 만나요.':'모모와 이야기하고, 편지를 찾아 빨간 우체통에 전해 보세요.';
    const note=document.createElement('small');note.textContent='가상 마을의 조작 테스트용 이야기';card.append(icon,title,p,note);$('panel-content').append(card);
  }
  function openMap() {
    openPanel('바람마을 지도','map');$('panel-content').append(paragraph('학교, 모모, 편지, 우체통의 위치를 확인해 보세요. 지도에서 선택하면 해당 바닥으로 걸어갑니다.'));
    const c=document.createElement('canvas');c.width=800;c.height=500;c.className='map-large';drawMap(c.getContext('2d'),800,500);c.addEventListener('click',e=>{const r=c.getBoundingClientRect();const p={x:(e.clientX-r.left)/r.width*1600,y:(e.clientY-r.top)/r.height*1000};panel.close();goTo(p);});$('panel-content').append(c);
  }
  function openHelp() {
    openPanel('천천히, 마음껏 걸어 보세요','help');$('panel-content').append(paragraph('이번 테스트는 장난감 마을 느낌과 2D 캐릭터의 방향별 움직임을 확인하는 작은 실험이에요. 실제 애월의 장소나 학습 내용은 아직 넣지 않았어요.'));
    const list=document.createElement('div');list.className='help-list';
    [['걷기','방향키 · WASD · 화면 방향 버튼'],['클릭 이동','빈 바닥 또는 목표물을 누르세요'],['대화와 조사','가까이 다가가 E 또는 화면 버튼'],['귀환과 이어하기','학교로 → 탐험 계속. 미션은 유지돼요']].forEach(([title,text])=>{const d=document.createElement('div');const b=document.createElement('b');b.textContent=title;d.append(b,document.createTextNode(text));list.append(d);});$('panel-content').append(list);
    $('panel-content').append(paragraph('진행은 이 브라우저에만 저장해요. 학급 계정·포인트·외부 API에 연결하지 않습니다. 새로고침해 이어하기도 시험해 보세요.'));
  }
  function resize() {const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);view.width=r.width;view.height=r.height;view.scale=Math.min(r.width/1600,r.height/1000);view.x=(r.width-1600*view.scale)/2;view.y=(r.height-1000*view.scale)/2;view.dpr=d;}
  function roundBox(c,x,y,w,h,r,fill) {c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();}
  function label(text,p,color='#7968aa') {ctx.font='bold 17px "Malgun Gothic",sans-serif';const width=ctx.measureText(text).width+30;roundBox(ctx,p.x-width/2,p.y,width,33,15,'#fffffff2');ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(text,p.x,p.y+23);}
  function shadow(p,w=40) {ctx.fillStyle='#57526a24';ctx.beginPath();ctx.ellipse(p.x,p.y,w,10,0,0,Math.PI*2);ctx.fill();}
  function drawPlayer(c,p,facing,frame,height=139) {const s=A.sprites,w=height*s.frameWidth/s.frameHeight;const row=directions.indexOf(facing);c.drawImage(images.player,frame*s.frameWidth,row*s.frameHeight,s.frameWidth,s.frameHeight,p.x-w/2,p.y-height+height*0.04,w,height);}
  function drawEnvelope(t) {
    const y=letter.y-(reducedMotion?0:Math.sin(t/300)*3);shadow(letter,27);ctx.save();ctx.translate(letter.x,y-23);ctx.rotate(-.12);roundBox(ctx,-25,-18,50,36,5,'#c9b1ef');ctx.strokeStyle='#a48bc9';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-23,-15);ctx.lineTo(0,3);ctx.lineTo(23,-15);ctx.stroke();ctx.fillStyle='#fff2c9';ctx.beginPath();ctx.arc(0,3,5,0,7);ctx.fill();ctx.restore();label('작은 편지',{x:letter.x,y:y+13});
  }
  function drawMap(c,w,h) {c.clearRect(0,0,w,h);c.drawImage(images.background,0,0,w,h);const dot=(p,color,r)=>{c.beginPath();c.arc(p.x/1600*w,p.y/1000*h,r,0,Math.PI*2);c.fillStyle=color;c.fill();c.strokeStyle='white';c.lineWidth=2;c.stroke();};dot(home,'#76b7aa',4);dot(guide,'#65a2c4',4);if(state.phase==='find')dot(letter,'#bc89da',4);dot(mailbox,'#dd8c8d',4);dot(state.position,'#8470cf',6);}
  function render(t) {
    const d=view.dpr;ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,view.width,view.height);ctx.save();ctx.translate(view.x,view.y);ctx.scale(view.scale,view.scale);ctx.drawImage(images.background,0,0,1600,1000);
    if(path.length){ctx.strokeStyle='#ffffffa0';ctx.lineWidth=5;ctx.setLineDash([2,18]);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(state.position.x,state.position.y);for(const p of path)ctx.lineTo(p.x,p.y);ctx.stroke();ctx.setLineDash([]);}
    if(targetRing&&t-targetRing.at<4500){ctx.strokeStyle='#9f85d8aa';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(targetRing.x,targetRing.y,22,9,0,0,7);ctx.stroke();}
    if(state.phase==='find')drawEnvelope(t);
    label('우리 학교',{x:home.x,y:home.y-9},'#679b8e');
    const drawGuide=()=>{shadow(guide,36);const h=146;ctx.drawImage(images.npc,guide.x-h*images.npc.width/images.npc.height/2,guide.y-h,h*images.npc.width/images.npc.height,h);label('모모',{x:guide.x,y:guide.y+14},'#6891ab');if(state.phase==='meet'){const y=guide.y-180-(reducedMotion?0:Math.sin(t/350)*4);roundBox(ctx,guide.x-17,y,34,37,14,'#fff6cf');ctx.fillStyle='#c49b3c';ctx.font='bold 25px sans-serif';ctx.textAlign='center';ctx.fillText('!',guide.x,y+28);}};
    const frame=walking?[1,0,2,0][Math.floor(t/150)%4]:0;
    if(state.position.y<guide.y){shadow(state.position,33);drawPlayer(ctx,state.position,state.facing,frame);drawGuide();}else{drawGuide();shadow(state.position,33);drawPlayer(ctx,state.position,state.facing,frame);}
    if(state.phase==='deliver')label('편지 넣는 곳',{x:mailbox.x-5,y:mailbox.y-92},'#be777e');ctx.restore();drawMap(mctx,240,150);
    const near=active()?nearest():null;$('interact').hidden=!near;if(near)$('interact-label').textContent=near.label;
    if(panel.open&&panelKind==='character')for(const {c,row} of inspectorCanvases){const cc=c.getContext('2d');cc.clearRect(0,0,c.width,c.height);drawPlayer(cc,{x:80,y:200},directions[row],inspectorWalk?[1,0,2,0][Math.floor(t/220)%4]:0,190);}
  }
  function tick(t) {
    const dt=Math.min((t-lastTime)/1000||0,.04),wasWalking=walking;lastTime=t;walking=false;
    if(loaded&&active()) {
      let dx=(keys.has('right')?1:0)-(keys.has('left')?1:0),dy=(keys.has('down')?1:0)-(keys.has('up')?1:0);
      if(pointerHeld){dx=pointerHeld==='right'?1:pointerHeld==='left'?-1:0;dy=pointerHeld==='down'?1:pointerHeld==='up'?-1:0;}
      if(dx||dy){path=[];arrival=null;const n=Math.hypot(dx,dy);dx=dx/n*220*dt;dy=dy/n*220*dt;}
      else if(path.length){const p=path[0],dist=distance(state.position,p),speed=220*dt;if(dist<=Math.max(speed,1)){dx=p.x-state.position.x;dy=p.y-state.position.y;path.shift();}else{dx=(p.x-state.position.x)/dist*speed;dy=(p.y-state.position.y)/dist*speed;}}
      if(dx||dy){const before=state.position;const next=M.move(before,{x:dx,y:dy},world);walking=distance(next,before)>.05;state.position=next;state.facing=M.directionForDelta(dx,dy,state.facing);if(!walking&&path.length){path=[];arrival=null;}}
      if(!path.length&&arrival){const kind=arrival;arrival=null;if(distance(state.position,{guide,letter,mailbox}[kind])<130)interact(kind);}
      if(walking&&t-lastSave>2000)save();
    }
    if(wasWalking&&!walking)save();
    if(loaded)render(t);requestAnimationFrame(tick);
  }
  const keyMap={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'};
  window.addEventListener('keydown',e=>{const key=keyMap[e.key]||keyMap[e.key.toLowerCase()];if(key&&active()){e.preventDefault();keys.add(key);}else if(e.key.toLowerCase()==='e'&&active()){e.preventDefault();const n=nearest();if(n)interact(n.kind);}else if(e.key.toLowerCase()==='h'&&!panel.open){e.preventDefault();returnOrResume();}});
  window.addEventListener('keyup',e=>{const key=keyMap[e.key]||keyMap[e.key.toLowerCase()];if(key){keys.delete(key);save();}});
  window.addEventListener('blur',()=>{keys.clear();pointerHeld=null;save();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();save();}});
  document.querySelectorAll('[data-direction]').forEach(b=>{b.addEventListener('pointerdown',e=>{if(!active())return;e.preventDefault();pointerHeld=b.dataset.direction;path=[];arrival=null;b.setPointerCapture(e.pointerId);});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>{pointerHeld=null;save();});});
  canvas.addEventListener('pointerdown',e=>{if(!active())return;const r=canvas.getBoundingClientRect(),p={x:(e.clientX-r.left-view.x)/view.scale,y:(e.clientY-r.top-view.y)/view.scale};const candidate=[{kind:'guide',p:guide},{kind:'mailbox',p:mailbox},...(state.phase==='find'?[{kind:'letter',p:letter}]:[])].find(v=>distance(p,{x:v.p.x,y:v.p.y-40})<80);goTo(candidate?candidate.p:p,candidate?.kind);});
  $('interact').onclick=()=>{const n=nearest();if(n)interact(n.kind);};$('guide-button').onclick=guideToQuest;$('home-button').onclick=returnOrResume;$('character-button').onclick=openCharacter;$('book-button').onclick=openBook;$('minimap-button').onclick=openMap;$('help').onclick=openHelp;$('close-dialogue').onclick=closeDialogue;$('close-panel').onclick=()=>panel.close();
  for(const d of [dialogue,panel]){d.addEventListener('close',()=>{keys.clear();pointerHeld=null;focusWorld();save();});d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});}
  window.addEventListener('message',e=>{
    if(e.source!==window.parent||!e.data||typeof e.data!=='object')return;
    if(e.data.type==='rq-load'){stop();state=M.normalizeState(e.data.state,world);if(!M.isWalkable(state.position,world))state.position={x:400,y:700};if(state.resume&&!M.isWalkable(state.resume,world))state.resume={x:400,y:700,facing:'down'};if(dialogue.open)dialogue.close();if(panel.open)panel.close();loadReceived=true;refresh();$('save-status').textContent=e.data.state?'저장한 모험을 불러왔어요':'이 기기에서 이어하기';}
    if(e.data.type==='rq-saved'){$('save-status').textContent=e.data.ok?'방금 이 기기에 저장했어요':'저장하지 못했어요 · 창을 닫기 전 확인';$('save-status').classList.toggle('error',!e.data.ok);}
  });
  window.addEventListener('resize',resize);new ResizeObserver(resize).observe(canvas);
  async function init(){try{await Promise.all(['background','player','npc'].map(key=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{images[key]=im;resolve();};im.onerror=reject;im.src=A[key];})));loaded=true;resize();refresh();$('loading').remove();send({type:'rq-ready'});if(window.parent===window){loadReceived=true;$('save-status').textContent='미리보기 직접 실행 · 저장 없음';}focusWorld();requestAnimationFrame(tick);}catch{$('loading').querySelector('h2').textContent='마을 그림을 불러오지 못했어요';$('loading').querySelector('p').textContent='로컬 서버를 다시 실행한 뒤 새로고침해 주세요.';}}
  init();
})();
