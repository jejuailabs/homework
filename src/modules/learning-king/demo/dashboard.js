(()=>{
'use strict';
const R=globalThis.SoloRank,root=document.getElementById('solo-hall'),main=root.querySelector('[data-dashboard]'),me=R.roster.find(p=>p.id===R.myId);
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
function remainingText(){
  const elapsed=state.live?.status==='playing'?Date.now()-state.live.startedAt:0;
  return (Math.max(0,120000-elapsed)/1000).toFixed(1)+'초';
}
function updateClock(){
  const clock=root.querySelector('[data-clock]');
  if(clock)clock.textContent=remainingText();
}
function toTop(){window.scrollTo({top:0,behavior:'instant'});}
function render(){
  badgeLookup=new Map();
  const live=state.live;
  root.dataset.scene=live?(live.status==='done'?'result':live.status):'lobby';
  if(live){
    main.innerHTML=globalThis.LearningKingGame.render({live,model:R,best:state.best[live.subject],subjectNames});
    updateClock();
    root.querySelector('[data-question], [data-result-title]')?.focus({preventScroll:true});
    return;
  }
  const boards=R.boards(state.subject,state.best[state.subject]);
  main.innerHTML=`<div class="sh-page-head"><div><h1>기록의 전당</h1><p>혼자 쌓은 기록, 우리 모두의 순위.</p></div><div class="sh-filters"><div class="sh-subjects" role="group" aria-label="랭킹 과목">${Object.entries(subjectNames).map(([key,label])=>button((key==='math'?'× ':'Aa ')+label,`data-subject="${key}" aria-pressed="${state.subject===key}"`,'' )).join('')}</div><span class="sh-grade">초4 · 이번 주</span></div></div>${hero()}${affiliationDetail()}<div class="sh-overview"><h2>우리의 여섯 가지 리그</h2><span>상위 2개 + 나의 순위</span>${button(state.method?'점수 기준 접기':'점수는 어떻게 정해질까?',`data-method aria-expanded="${state.method}"`,'sh-link')}</div>${state.method?method():''}<div class="sh-boards" data-rankings>${boards.map(board).join('')}</div><p class="sh-privacy">소속 배지를 누르면 지역·학교·학급이 펼쳐져요. 순위는 닉네임으로 표시해요.</p>`;
  if(globalThis.lucide)globalThis.lucide.createIcons({attrs:{width:16,height:16}});
}
function finish(timedOut=false){
  const live=state.live;
  if(!live||live.status!=='playing')return;
  if(timedOut){
    const elapsed=Math.max(0,(Math.min(Date.now(),live.startedAt+120000)-live.questionAt)/1000);
    live.answers.push({answer:null,correct:false,seconds:elapsed});
    while(live.answers.length<5)live.answers.push({answer:null,correct:false,seconds:0});
  }
  const record=R.score(live.answers),best=state.best[live.subject];
  state.latest[live.subject]=record;
  live.recordUpdated=!best||record.score>best.score||(record.score===best.score&&record.totalSeconds<best.totalSeconds);
  if(live.recordUpdated)state.best[live.subject]=record;
  live.status='done';
  live.timedOut=timedOut;
  state.subject=live.subject;
  render();
  toTop();
}
function start(){
  if(state.live&&state.live.status!=='done')return;
  state.affiliation=null;
  state.live={subject:state.subject,prepareAt:Date.now(),startedAt:0,questionAt:0,currentId:R.questions[state.subject][0].id,answers:[],status:'countdown',timedOut:false};
  render();
  toTop();
}
function begin(){
  const live=state.live;
  if(!live||live.status!=='countdown')return;
  live.status='playing';
  live.startedAt=live.questionAt=Date.now();
  acceptAfter=live.questionAt+350;
  render();
}
function answer(value,questionId){
  if(busy||Date.now()<acceptAfter)return;
  const live=state.live;
  if(!live||live.status!=='playing')return;
  const now=Date.now();
  if(now-live.startedAt>=120000){finish(true);return;}
  const question=R.questions[live.subject][live.answers.length];
  if(question?.id!==questionId||!question.answers.includes(value))return;
  busy=true;
  live.answers.push({answer:value,correct:value===question.correct,seconds:Math.max(0,(now-live.questionAt)/1000)});
  if(live.answers.length===5)finish();
  else{
    live.currentId=R.questions[live.subject][live.answers.length].id;
    live.questionAt=Date.now();
    acceptAfter=live.questionAt+350;
    render();
  }
  busy=false;
}
root.addEventListener('click',event=>{
  const b=event.target.closest('button');
  if(!b||b.disabled||!root.contains(b))return;
  if(b.hasAttribute('data-answer')){answer(b.dataset.answer,b.dataset.questionId);return;}
  if(b.hasAttribute('data-start')){start();return;}
  if(b.hasAttribute('data-cancel')||b.hasAttribute('data-see-ranks')){
    state.live=null;
    render();
    toTop();
    root.querySelector('[data-start]')?.focus({preventScroll:true});
    return;
  }
  if(state.live)return;
  if(b.dataset.subject){state.subject=b.dataset.subject;state.affiliation=null;}
  else if(b.hasAttribute('data-method'))state.method=!state.method;
  else if(b.dataset.aff){state.affiliation=badgeLookup.get(b.dataset.aff)||null;render();root.querySelector('.sh-detail')?.scrollIntoView({block:'nearest',behavior:'instant'});return;}
  else if(b.hasAttribute('data-close-aff'))state.affiliation=null;
  render();
});
root.addEventListener('keydown',event=>{
  if(event.repeat||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||!['1','2','3'].includes(event.key))return;
  const live=state.live;
  if(!live||live.status!=='playing')return;
  const question=R.questions[live.subject][live.answers.length];
  event.preventDefault();
  answer(question.answers[Number(event.key)-1],question.id);
});
function tick(){
  const live=state.live;
  if(!live)return;
  if(live.status==='countdown'){
    if(Date.now()-live.prepareAt>=3000){begin();return;}
    const countdown=root.querySelector('[data-countdown]');
    if(countdown)countdown.textContent=String(Math.max(1,Math.ceil((live.prepareAt+3000-Date.now())/1000)));
  }else if(live.status==='playing'){
    if(Date.now()-live.startedAt>=120000){finish(true);return;}
    updateClock();
  }
}
render();
setInterval(tick,200);
})();
