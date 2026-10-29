import test from 'node:test';
import assert from 'node:assert/strict';
import {BOARD_PAGE_LIMIT,BOARD_TEXT_LIMIT,cleanBoardSettings,cleanBoardStore,newBoardPage,saveBoardPage} from './chalkboard';

test('board imports reject duplicate identities, excessive pages and oversized content',()=>{
  const draft=newBoardPage();
  const store={version:1,draft,pages:[draft],autoSave:false};
  assert.equal(cleanBoardStore(store)?.autoSave,false);
  assert.equal(cleanBoardStore({...store,pages:[draft,draft]}),null);
  assert.equal(cleanBoardStore({...store,pages:Array.from({length:BOARD_PAGE_LIMIT+1},newBoardPage)}),null);
  assert.equal(cleanBoardStore({...store,draft:{...draft,text:'x'.repeat(BOARD_TEXT_LIMIT+1)}}),null);
  assert.equal(cleanBoardStore({...store,version:99}),null);
  assert.equal(cleanBoardStore({...store,draft:{...draft,id:'../../something'}}),null);
});
test('saving an existing board at capacity replaces only that board; new boards cannot evict old lessons',()=>{
  const pages=Array.from({length:BOARD_PAGE_LIMIT},newBoardPage),draft={...pages[10],title:'수정한 수업',text:'오늘의 과제'};
  const result=saveBoardPage(pages,draft);
  assert.equal(result.length,50);assert.equal(result[0].title,'수정한 수업');
  assert.equal(result.filter(p=>p.id===draft.id).length,1);
  assert.deepEqual(result.slice(1).map(p=>p.id),pages.filter(p=>p.id!==draft.id).map(p=>p.id));
  assert.throws(()=>saveBoardPage(pages,newBoardPage()),/BOARD_FULL/);
});
test('board appearance accepts bounded colors and readable finite text settings only',()=>{
  const value=cleanBoardSettings({background:'url(https://example.com)',color:'#123456',fontSize:Infinity,fontFamily:'evil',align:'justify',lineHeight:100});
  assert.equal(value.background,'#123e35');assert.equal(value.color,'#123456');assert.equal(value.fontSize,48);
  assert.equal(value.fontFamily,'sans');assert.equal(value.align,'left');assert.equal(value.lineHeight,2.5);
});
