(()=>{
'use strict';
const R=globalThis.SoloRank,J=globalThis.MathJourney,root=document.getElementById('solo-hall'),main=root.querySelector('[data-dashboard]'),me=R.roster.find(p=>p.id===R.myId);
const subjectNames={math:'수학',english:'영어'},boardIcons={class:'users',school:'school',local:'map-pin',classes:'flag',schools:'trophy',regions:'globe'},boardTitles={class:'우리 반 개인',school:'우리 학교 개인',local:'제주 개인',classes:'반 대항',schools:'학교 대항',regions:'지역 대항'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=x=>Number(x).toLocaleString('ko-KR',{maximumFractionDigits:1});
const character=(name,cls='')=>`<div class="sh-character ${cls}" data-char="${name}" aria-hidden="true"></div>`;
const crest=name=>`<span class="sh-crest ${name}" aria-hidden="true"></span>`;
const button=(label,attrs='',cls='sh-secondary')=>`<button type="button" class="${cls} cursor-interaction" ${attrs}>${label}</button>`;
const weekKey=()=>{const date=new Date(Date.now()+9*3600000);date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));return date.toISOString().slice(0,10);};
let state={version:1,week:weekKey(),subject:'math',best:{math:null,english:null},latest:{math:null,english:null},live:null,method:false,affiliation:null};
let badgeLookup=new Map(),busy=false,acceptAfter=0;
function badge(row,large=false){const key=[row.region,row.school||'',row.classId||''].join('|');badgeLookup.set(key,row);const detail=[row.region,row.school,row.classId].filter(Boolean).join(' · ');return button(`${crest(row.crest)}<span><span class="sh-place">${esc(row.region)}</span><span class="sh-dot">·</span><strong>${row.school?esc(row.school)+(row.classId?' · '+esc(row.classId):''):(row.schoolCount||3)+'개 학교'}</strong></span>`,`data-aff="${esc(key)}" aria-label="${esc(detail)} 소속 배지 자세히"`,'sh-aff'+(large?' large':''));}
function hero(){const record=state.best[state.subject]||me[state.subject],playing=state.live?.status==='playing',latest=state.latest[state.subject];
return `<section class="sh-hero" aria-label="나의 대표 기록"><div class="sh-person">${character('comet')}<div><div class="sh-kicker">MY EXPLORER PASS</div><h2>${me.name}</h2>${badge(me,true)}<small>${state.best[state.subject]?'내가 직접 도전한 기록':'예시 기록으로 살펴보는 중'}</small></div></div><div class="sh-record"><div class="sh-record-top"><b>${record.score}</b><small>/ 1,000점 · 대표 기록</small></div><div class="sh-record-meta"><span>정확도 <strong>${record.accuracy}%</strong></span><span>문항 평균 <strong>${record.averageSeconds.toFixed(2)}초</strong></span></div><div class="sh-score-track" role="img" aria-label="정확도 ${record.accuracyPoints}점과 속도 ${Math.round(record.speedPoints)}점"><span class="accuracy" style="width:${record.accuracyPoints/10}%"></span><span class="speed" style="width:${record.speedPoints/10}%"></span></div><div class="sh-score-legend"><span>정확도 <b>${record.accuracyPoints}</b></span><span>＋</span><span>속도 <b>${Math.round(record.speedPoints)}</b></span></div></div><div class="sh-hero-action">${button('<i data-lucide="timer" aria-hidden="true"></i>'+(playing?'도전 진행 중':'솔로 기록 도전'),`data-start ${playing?'disabled':''}`,'sh-primary')}<p>동일 난도 5문제 · 120초 제한<br>정답을 차근차근, 속도는 보너스!</p>${latest?`<div class="sh-last">최근 ${latest.score}점 · ${latest.correct}/5 정답${record.score>latest.score?' · 최고 기록 유지':''}</div>`:''}</div></section>`;
}
function affiliationDetail(){const r=state.affiliation;if(!r)return '';const regionFull={제주:'제주특별자치도',부산:'부산광역시',서울:'서울특별시',경기:'경기도'}[r.region]||r.region;const schoolFull=r.school?r.school.replace(/초$/,'초등학교'):null;return `<section class="sh-detail" aria-label="선택한 소속 배지">${crest(r.crest)}<div><div class="sh-tag">배지 하나로 읽는 소속</div><h3>${esc(schoolFull||regionFull)}</h3><p>${esc(regionFull)}${schoolFull?' › '+esc(schoolFull):''}${r.classId?' › '+r.classId.split('-')[0]+'학년 '+r.classId.split('-')[1]+'반':''}<br>지역 문양 + 학교명 + 학급 표기</p></div>${button('닫기','data-close-aff')}</section>`;}
function method(){return `<section class="sh-method" aria-label="점수와 랭킹 기준"><div><strong>정답이 먼저, 속도는 보너스</strong><p>정답 1개 170점 + 정답 문항의 속도 최대 30점.<br>3초 이하는 30점, 20초 이상은 0점, 사이는 비례 계산.<br>4개 정답 최고 800점 &lt; 5개 정답 최저 850점.</p></div><div><strong>한 기록을 여섯 순위에 함께 반영</strong><p>같은 과목·학년·출제 세트끼리 비교해요.<br>개인은 대표 기록, 팀은 참가자 대표 점수의 평균이에요.<br>총점 → 정확도 → 평균 시간 순. 모두 같으면 공동 순위.</p></div></section>`;}
function board(b){
const chosen=b.rows.slice(0,2);if(b.myRow&&!chosen.some(r=>r.id===b.myRow.id))chosen.push(b.myRow);else if(b.rows.length>2)chosen.push(b.rows[2]);
const classGroup=b.id==='classes',isGroup=b.kind==='group';
const foot={class:'우리 반에서',school:'우리 학교에서',local:'제주에서',classes:'우리 반',schools:'우리 학교',regions:'우리 지역'}[b.id];
return `<section class="sh-board ${isGroup?'group':''}" aria-label="${boardTitles[b.id]} 랭킹"><div class="sh-board-head"><span class="sh-board-icon"><i data-lucide="${boardIcons[b.id]}" aria-hidden="true"></i></span><div><h3>${boardTitles[b.id]}</h3><small>${esc(isGroup?(b.id==='classes'?me.school:b.id==='schools'?'제주 3개 학교':'전국 4개 지역'):(b.id==='class'?me.school+' 4-2':b.id==='school'?me.school+' 4학년':'같은 학년 · 같은 과목'))}</small></div><span class="sh-count">${b.count}${isGroup?'팀':'명'}</span></div><div class="sh-rows">${chosen.map((r,i)=>`${i===2&&r.rank>3?'<div class="sh-row-gap" aria-hidden="true">···</div>':''}<div class="sh-row ${r.ours?'me':''}"><span class="sh-position ${r.rank===1?'first':''}">${r.rank}</span>${isGroup?crest(r.crest):character(r.character)}<div class="sh-identity"><div class="sh-nickname">${esc(classGroup?r.classId.split('-')[0]+'학년 '+r.classId.split('-')[1]+'반':r.name)}${r.ours?`<span class="sh-you">${isGroup?'우리':'나'}</span>`:''}</div>${badge(r)}</div><div class="sh-points"><b>${number(r.score)}</b><small>${isGroup?r.participants+'명 평균':number(r.accuracy)+'% · '+r.averageSeconds.toFixed(2)+'초'}</small></div></div>`).join('')}</div><div class="sh-board-foot"><span>${foot} <strong>${b.myRank}위</strong></span><span>${isGroup?'참여 '+b.myRow.participants+'/'+b.myRow.rosterCount+'명':'내 점수 '+b.myRow.score+'점'}</span></div></section>`;
}
const emptyJourney=()=>({version:1,grade:4,level:'gentle',nextSequence:0,totalAnswered:0,totalCorrect:0,completedLegs:0,bank:[],recent:[],active:null});
let journey=emptyJourney(),storageStatus='loading',storageReady=false,storageAvailable=false,storageConnected=false,sessionChanged=false,persistenceDisabled=false;
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
function validQuestion(q){return q&&typeof q.id==='string'&&q.id.length<200&&typeof q.q==='string'&&q.q.length<2000&&typeof q.explanation==='string'&&q.explanation.length<4000&&Array.isArray(q.answers)&&q.answers.length===3&&q.answers.every(a=>typeof a==='string'&&a.length<200)&&new Set(q.answers).size===3&&q.answers.includes(q.correct);}
function restoredJourney(value){
  if(!value||value.version!==1||!integer(value.grade,1,6)||!['gentle','standard'].includes(value.level))return emptyJourney();
  for(const key of ['nextSequence','totalAnswered','totalCorrect','completedLegs'])if(!integer(value[key],0,1000000000))return emptyJourney();
  if(value.totalCorrect>value.totalAnswered||!Array.isArray(value.bank)||!Array.isArray(value.recent))return emptyJourney();
  const clean={...emptyJourney(),...value,bank:value.bank.filter(validQuestion).slice(-300),recent:value.recent.filter(r=>r&&typeof r.q==='string'&&typeof r.answer==='string'&&typeof r.correctAnswer==='string'&&typeof r.explanation==='string'&&typeof r.correct==='boolean'&&Number.isFinite(r.seconds)&&r.seconds>=0).slice(-100),active:null};
  const a=value.active;
  if(a&&typeof a.id==='string'&&integer(a.grade,1,6)&&['gentle','standard'].includes(a.level)&&integer(a.sequence,0,1000000000)&&typeof a.date==='string'&&Array.isArray(a.questions)&&a.questions.length===20&&a.questions.every(validQuestion)&&Array.isArray(a.answers)&&a.answers.length<20&&a.answers.every((r,i)=>r&&a.questions[i].answers.includes(r.answer)&&Number.isFinite(r.seconds)&&r.seconds>=0)&&Number.isFinite(a.elapsedMs)&&a.elapsedMs>=0&&Number.isFinite(a.questionElapsedMs)&&a.questionElapsedMs>=0){
    clean.active={...a,answers:a.answers.map((r,i)=>({...r,correct:r.answer===a.questions[i].correct}))};
    clean.grade=a.grade;clean.level=a.level;
  }
  return clean;
}
function elapsedMs(live){return live.elapsedBefore+(live.status==='playing'?Date.now()-live.startedAt:0);}
function snapshotActive(){
  const l=state.live;
  if(!l||l.mode!=='journey'||l.status==='done')return;
  journey.active={id:l.id,grade:l.grade,level:l.level,date:l.date,sequence:l.sequence,questions:l.questions,answers:l.answers,elapsedMs:elapsedMs(l),questionElapsedMs:l.questionElapsedBefore+(l.status==='playing'?Date.now()-l.questionAt:0)};
}
function persistJourney(){
  snapshotActive();
  sessionChanged=true;
  // A late load must never replace new in-memory work or overwrite an older saved trip.
  if(!storageReady||!storageConnected||persistenceDisabled){if(storageReady)storageStatus='unavailable';return;}
  storageStatus=storageAvailable?'saving':'unavailable';
  window.parent.postMessage({type:'learning-king-journey-save',state:journey},'*');
}
function remainingText(){
  const l=state.live;
  if(l?.mode==='journey')return (elapsedMs(l)/1000).toFixed(1)+'초';
  const elapsed=l?.status==='playing'?Date.now()-l.startedAt:0;
  return (Math.max(0,120000-elapsed)/1000).toFixed(1)+'초';
}
function updateClock(){const clock=root.querySelector('[data-clock]');if(clock)clock.textContent=remainingText();}
function updateStorageNotice(){
  const note=root.querySelector('[data-game-storage]');if(!note)return;
  note.textContent=storageStatus==='unavailable'?'지금은 이 창에서만 기록돼요 · 창을 닫으면 사라질 수 있어요':storageStatus==='saving'?'풀이 기록을 저장하고 있어요':'이 브라우저에 저장됐어요 · 언제든 쉬어가요';
  note.classList.toggle('unavailable',storageStatus==='unavailable');
}
function toTop(){window.scrollTo({top:0,behavior:'instant'});}
function render(){
  badgeLookup=new Map();
  const live=state.live;
  root.dataset.scene=live?(live.status==='done'?'result':live.status):'lobby';
  if(live){
    main.innerHTML=globalThis.LearningKingGame.render({live,model:live.mode==='journey'?J:R,best:state.best[live.subject],subjectNames,journey:{...journey,bankCount:journey.bank.length}});
    updateClock();
    updateStorageNotice();
    root.querySelector('[data-question], [data-result-title]')?.focus({preventScroll:true});
    return;
  }
  const boards=R.boards(state.subject,state.best[state.subject]);
  const head=`<div class="sh-page-head"><div><h1>${state.subject==='math'?'수학 여행':'영어 체험'}</h1><p>${state.subject==='math'?'새 문제를 풀며 나만의 여행을 쌓아요.':'영어는 아직 고정 예제 5문항으로 체험해요.'}</p></div><div class="sh-filters"><div class="sh-subjects" role="group" aria-label="과목 선택">${Object.entries(subjectNames).map(([key,label])=>button((key==='math'?'× ':'Aa ')+label+(key==='english'?' 예시':''),`data-subject="${key}" aria-pressed="${state.subject===key}"`,'')).join('')}</div></div></div>`;
  main.innerHTML=head+(state.subject==='math'?globalThis.LearningKingGame.renderLobby({...journey,bankCount:journey.bank.length,storageStatus}):hero())+`${affiliationDetail()}<div class="sh-overview"><h2>통합 랭킹 미리보기</h2><span>초4 예시 기록 · 여행 점수와 별도</span>${button(state.method?'점수 기준 접기':'예시 점수 기준',`data-method aria-expanded="${state.method}"`,'sh-link')}</div>${state.method?method():''}<div class="sh-boards" data-rankings>${boards.map(board).join('')}</div><p class="sh-privacy">학생·학교 랭킹은 예시 데이터예요. 수학 여행은 학년별 연습 기록으로 쌓이며 이 순위에 반영되지 않아요.</p>`;
  if(globalThis.lucide)globalThis.lucide.createIcons({attrs:{width:16,height:16}});
}
function finish(timedOut=false){
  const live=state.live;
  if(!live||live.status!=='playing')return;
  if(live.mode==='journey'){
    live.elapsedBefore=elapsedMs(live);
    live.status='done';
    journey.completedLegs++;
    journey.active=null;
    persistJourney();
  }else{
    if(timedOut){
      const elapsed=Math.max(0,(Math.min(Date.now(),live.startedAt+120000)-live.questionAt)/1000);
      live.answers.push({answer:null,correct:false,seconds:elapsed});
      while(live.answers.length<live.questions.length)live.answers.push({answer:null,correct:false,seconds:0});
    }
    const record=R.score(live.answers),best=state.best[live.subject];
    state.latest[live.subject]=record;
    live.recordUpdated=!best||record.score>best.score||(record.score===best.score&&record.totalSeconds<best.totalSeconds);
    if(live.recordUpdated)state.best[live.subject]=record;
    live.status='done';live.timedOut=timedOut;
  }
  state.subject=live.subject;
  render();toTop();
}
function start(){
  if(state.live&&state.live.status!=='done')return;
  state.affiliation=null;
  if(state.subject==='math'){
    if(!storageReady)return;
    let pack=journey.active;
    if(!pack){
      pack=J.generate({grade:journey.grade,level:journey.level,date:J.dateKey(),sequence:journey.nextSequence,count:20,seen:journey.bank.map(q=>q.q)});
      journey.nextSequence++;
      journey.bank=[...journey.bank,...pack.questions.map(q=>({...q,grade:pack.grade,level:pack.level,date:pack.date,sequence:pack.sequence}))].slice(-300);
      pack={...pack,answers:[],elapsedMs:0,questionElapsedMs:0};
    }
    state.live={...pack,mode:'journey',subject:'math',prepareAt:Date.now(),startedAt:0,questionAt:0,elapsedBefore:pack.elapsedMs,questionElapsedBefore:pack.questionElapsedMs,currentId:pack.questions[pack.answers.length].id,status:'countdown',timedOut:false};
    persistJourney();
  }else{
    const questions=R.questions.english;
    state.live={subject:'english',questions,prepareAt:Date.now(),startedAt:0,questionAt:0,currentId:questions[0].id,answers:[],status:'countdown',timedOut:false};
  }
  render();toTop();
}
function begin(){
  const live=state.live;
  if(!live||live.status!=='countdown')return;
  live.status='playing';live.startedAt=live.questionAt=Date.now();acceptAfter=live.questionAt+350;
  render();
}
function answer(value,questionId){
  if(busy||Date.now()<acceptAfter)return;
  const live=state.live;
  if(!live||live.status!=='playing')return;
  const now=Date.now();
  if(live.mode!=='journey'&&now-live.startedAt>=120000){finish(true);return;}
  const question=live.questions[live.answers.length];
  if(question?.id!==questionId||!question.answers.includes(value))return;
  busy=true;
  const result={answer:value,correct:value===question.correct,seconds:Math.max(0,((live.questionElapsedBefore||0)+now-live.questionAt)/1000)};
  live.answers.push(result);
  if(live.mode==='journey'){
    journey.totalAnswered++;if(result.correct)journey.totalCorrect++;
    journey.recent=[...journey.recent,{id:question.id,q:question.q,...result,correctAnswer:question.correct,explanation:question.explanation,at:new Date(now).toISOString(),grade:live.grade,level:live.level}].slice(-100);
    live.questionElapsedBefore=0;
  }
  if(live.answers.length===live.questions.length)finish();
  else{
    live.currentId=live.questions[live.answers.length].id;
    live.questionAt=Date.now();acceptAfter=live.questionAt+350;
    if(live.mode==='journey')persistJourney();
    render();
  }
  busy=false;
}
root.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b||b.disabled||!root.contains(b))return;
  if(b.hasAttribute('data-answer')){answer(b.dataset.answer,b.dataset.questionId);return;}
  if(b.hasAttribute('data-start')||b.hasAttribute('data-next-leg')){start();return;}
  if(b.hasAttribute('data-cancel')||b.hasAttribute('data-see-ranks')){
    if(state.live?.mode==='journey'&&state.live.status!=='done')persistJourney();
    state.live=null;render();toTop();root.querySelector('[data-start]')?.focus({preventScroll:true});return;
  }
  if(state.live)return;
  if(b.hasAttribute('data-discard')){journey.active=null;persistJourney();}
  else if(b.dataset.grade||b.dataset.level){
    if(!storageReady||journey.active)return;
    if(b.dataset.grade&&integer(Number(b.dataset.grade),1,6))journey.grade=Number(b.dataset.grade);
    if(['gentle','standard'].includes(b.dataset.level))journey.level=b.dataset.level;
    persistJourney();
  }else if(b.dataset.subject){state.subject=b.dataset.subject;state.affiliation=null;}
  else if(b.hasAttribute('data-method'))state.method=!state.method;
  else if(b.dataset.aff){state.affiliation=badgeLookup.get(b.dataset.aff)||null;render();root.querySelector('.sh-detail')?.scrollIntoView({block:'nearest',behavior:'instant'});return;}
  else if(b.hasAttribute('data-close-aff'))state.affiliation=null;
  render();
});
root.addEventListener('keydown',event=>{
  if(event.repeat||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||!['1','2','3'].includes(event.key))return;
  const live=state.live;if(!live||live.status!=='playing')return;
  const question=live.questions[live.answers.length];event.preventDefault();answer(question.answers[Number(event.key)-1],question.id);
});
window.addEventListener('message',event=>{
  if(event.source!==window.parent||!event.data||typeof event.data!=='object')return;
  if(event.data.type==='learning-king-journey-state'&&!storageConnected&&!persistenceDisabled){
    if(sessionChanged){persistenceDisabled=true;storageStatus='unavailable';if(!state.live)render();return;}
    journey=restoredJourney(event.data.state);storageReady=true;storageConnected=true;storageAvailable=event.data.available===true;storageStatus=storageAvailable?'saved':'unavailable';render();
  }else if(event.data.type==='learning-king-journey-saved'){
    storageAvailable=event.data.ok===true;storageStatus=storageAvailable?'saved':'unavailable';
    if(!state.live)render();else updateStorageNotice();
  }
});
window.addEventListener('pagehide',()=>{if(state.live?.mode==='journey')persistJourney();});
function tick(){
  const live=state.live;if(!live)return;
  if(live.status==='countdown'){
    if(Date.now()-live.prepareAt>=3000){begin();return;}
    const countdown=root.querySelector('[data-countdown]');if(countdown)countdown.textContent=String(Math.max(1,Math.ceil((live.prepareAt+3000-Date.now())/1000)));
  }else if(live.status==='playing'){
    if(live.mode!=='journey'&&Date.now()-live.startedAt>=120000){finish(true);return;}
    updateClock();
  }
}
render();
window.parent.postMessage({type:'learning-king-journey-load'},'*');
setTimeout(()=>{if(!storageReady){storageReady=true;storageStatus='unavailable';render();}},2000);
setInterval(tick,200);
})();
