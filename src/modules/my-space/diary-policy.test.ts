import test from 'node:test';
import assert from 'node:assert/strict';
import {starterSpaceIds} from './catalog';
import {validateDiary} from './policy';
import {diaryCalendarDays,diaryToday,moveDiaryMonth} from './diary-calendar';

const page={version:0,schemaVersion:2,title:'나의 하루',date:'2026-10-27',paper:'paper-cream',mood:'calm',layers:[]};
const position={id:'one',itemId:'',x:50,y:50,size:100,rotation:0,flip:false};
test('calendar civil dates respect Korean midnight, leap days and year transitions',()=>{
  assert.equal(diaryToday(Date.parse('2026-10-26T15:00:00Z')),'2026-10-27');
  assert.equal(diaryToday(Date.parse('2026-10-26T14:59:59Z')),'2026-10-26');
  assert.equal(diaryCalendarDays('2024-02').filter(Boolean).length,29);
  assert.equal(diaryCalendarDays('2026-02').filter(Boolean).length,28);
  assert.equal(diaryCalendarDays('2026-11')[0],'2026-11-01');
  assert.equal(moveDiaryMonth('2026-12',1),'2027-01');assert.equal(moveDiaryMonth('2026-01',-1),'2025-12');
  assert.throws(()=>diaryCalendarDays('2026-13'));
});
test('versioned diary retains Korean spacing, pressure, decoration order and mood',()=>{
  const layers=[{...position,kind:'text',text:'  오늘은\n행복했어.  ',fontSize:32,align:'center'}, {...position,id:'ink',kind:'ink',brush:'pencil',width:4,opacity:.8,color:'#558866',points:[[12.25,34.5,.2],[22,46,.9]]}, {...position,id:'heart',kind:'sticker',itemId:'diary-heart',size:25,rotation:30,flip:true}];
  const result=validateDiary({...page,layers},starterSpaceIds);
  assert.equal(result.layers[0].text,'  오늘은\n행복했어.  ');assert.deepEqual(result.layers[1].points,[[12.25,34.5,.2],[22,46,.9]]);
  assert.equal(result.layers[2].rotation,30);assert.equal(result.layers[2].flip,true);assert.equal(result.mood,'calm');
});
test('untrusted imported pages cannot introduce paid ownership, invalid ink or future schema',()=>{
  const check=(patch:Record<string,unknown>)=>validateDiary({...page,...patch},starterSpaceIds);
  assert.throws(()=>check({layers:[{...position,kind:'sticker',itemId:'diary-moon'}]}));
  assert.throws(()=>check({layers:[{...position,kind:'ink',points:[[NaN,2,.5]]}]}));
  assert.throws(()=>check({layers:[{...position,kind:'ink',points:[[721,2,.5]]}]}));
  assert.throws(()=>check({schemaVersion:3}));assert.throws(()=>check({date:'2026-02-30'}));
  assert.throws(()=>check({mood:'<script>'}));
  assert.throws(()=>check({layers:[{...position,kind:'text',text:'a'.repeat(6001)}]}));
  assert.equal(check({layers:[{...position,kind:'text',text:'가'.repeat(6000)}]}).layers[0].text?.length,6000);
});
test('page ink budgets are bounded across all strokes, not only per stroke',()=>{
  const layers=Array.from({length:11},(_,n)=>({...position,id:'ink'+n,kind:'ink',points:Array.from({length:2000},()=>[10,20,.5])}));
  assert.throws(()=>validateDiary({...page,layers},starterSpaceIds));
  assert.throws(()=>validateDiary({...page,layers:[{...position,kind:'ink',points:Array.from({length:2001},()=>[10,20,.5])}]},starterSpaceIds));
});
