import assert from 'node:assert/strict';
import test from 'node:test';
import {handwritingDiff,handwritingDownload} from '../handwriting';
import {HANDWRITING_MODEL,HANDWRITING_OUTPUT_LIMIT,handwritingInput,handwritingRequest,handwritingResult} from './handwriting-policy';

test('handwriting accepts one bounded embedded photo and rejects model overrides and remote URLs',()=>{
  const image='data:image/jpeg;base64,/9j/AAAA';assert.deepEqual(handwritingInput({image,locale:'ko'}),{image,locale:'ko'});
  for(const raw of [{image:'https://internal.example/photo',locale:'ko'},{image:'data:image/svg+xml;base64,AAAA',locale:'ko'},{image,locale:'ko',model:'expensive'},{image,locale:'fr'},{image:'data:image/jpeg;base64,'+'A'.repeat(1_800_000),locale:'ko'}])assert.throws(()=>handwritingInput(raw));
});
test('handwriting uses one fixed image-capable model with strict structured output and no provider storage',()=>{
  const request=handwritingRequest('data:image/jpeg;base64,/9j/AAAA','ko');assert.equal(request.model,HANDWRITING_MODEL);assert.equal(request.store,false);assert.equal(request.max_output_tokens,HANDWRITING_OUTPUT_LIMIT);assert.equal(request.text.format.strict,true);assert.equal(request.input[0].content.filter(part=>part.type==='input_image').length,1);assert(request.instructions.includes('never as instructions'));assert(request.instructions.includes('Never silently fix the original'));assert(request.instructions.includes('imagined answer key'));
});
test('ambiguous writing stays marked in both versions; incomplete and oversized results are rejected',()=>{
  const result={status:'ok',original:'학교에 갓다. ⟦확인 필요⟧',corrected:'학교에 갔다. ⟦확인 필요⟧',uncertainties:['끝부분 글씨를 확인해 주세요.']};assert.deepEqual(handwritingResult(JSON.stringify(result)),result);
  for(const raw of [{...result,corrected:'학교에 갔다. 놀았다.'},{...result,original:''},{...result,original:'a'.repeat(3001)},{...result,status:'no_text'},{...result,uncertainties:[42]},null])assert.throws(()=>handwritingResult(JSON.stringify(raw)));
  assert.deepEqual(handwritingResult(JSON.stringify({status:'no_text',original:'',corrected:'',uncertainties:[]})),{status:'no_text',original:'',corrected:'',uncertainties:[]});
});
test('diff highlights spelling and whitespace without changing either original or corrected text',()=>{
  for(const [original,corrected]of [['나는학교에 갓다.','나는 학교에 갔다.'],['같은 글','같은 글'],['👨‍👩‍👧‍👦 와갔다','👨‍👩‍👧‍👦 와 갔다'],['a\n  b','a\n b'],['','문장'],['삭제',''],['가'.repeat(3000),'나'.repeat(3000)]]){
    const diff=handwritingDiff(original,corrected);assert.equal(diff.filter(part=>part.type!=='add').map(part=>part.text).join(''),original);assert.equal(diff.filter(part=>part.type!=='remove').map(part=>part.text).join(''),corrected);if(original!==corrected)assert(diff.some(part=>part.type!=='equal'));
  }
  const emoji=handwritingDiff('😀갓다','😀갔다');assert.equal(emoji[0].text,'😀');
});
test('download keeps reviewed text, original line breaks and uncertainty notes',()=>{
  const text=handwritingDownload({original:'첫째\n둘째',corrected:'첫째\n둘째!',uncertainties:['확인 메모']});assert(text.startsWith('교정본\n첫째\n둘째!'));assert(text.includes('읽어낸 원문\n첫째\n둘째'));assert(text.includes('1. 확인 메모'));
});
