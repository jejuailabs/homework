import {test} from 'node:test';
import assert from 'node:assert/strict';
import {duplicateOf, playAiDrafts, playAiRequest} from './ai-questions';
import {playBank} from './bank/index';

let counter = 0;
const ids = () => `t_test-${String(++counter).padStart(8, '0')}`;
const row = (prompt: string, answer: string, distractors = ['보기하나', '보기둘', '보기셋']) => ({prompt, answer, distractors, hint: '천천히 생각해 봐요.', reveal: '이렇게 풀어요.'});

test('AI drafts become valid class items and duplicates of the bank or each other are dropped', () => {
  const bankAnswer = playBank.find(item => item.kind === 'riddle')!;
  const text = JSON.stringify({items: [
    row('밤하늘에서 반짝이는 작은 빛은?', '별빛새'),
    row(`${bankAnswer.prompt}`, '전혀다른답'),
    row('바다에 사는 아주 큰 동물은 무엇일까?', bankAnswer.answers[0]),
    row('물에 동동 뜨는 노란 장난감은?', '고무오리'),
    row('같은 정답 다른 문제는?', '고무오리'),
    row('보기가 정답과 같은 문제는?', '모자', ['모자', '장갑']),
    {prompt: '', answer: '빈 문제', distractors: ['a', 'b'], hint: '', reveal: '설명'},
  ]});
  const result = playAiDrafts(text, 'riddle', 'mid', playBank, ids);
  assert.deepEqual(result.items.map(item => item.answers[0]), ['별빛새', '고무오리']);
  assert.equal(result.dropped, 5);
  for (const item of result.items) {
    assert.equal(item.source, 'ai-approved'); assert.equal(item.kind, 'riddle'); assert.equal(item.gradeBand, 'mid');
    assert.equal(item.choices![0], item.answers[0]); assert.equal(item.choices!.length, 4); assert.match(item.id, /^t_/);
  }
});
test('duplicate checks ignore spacing and punctuation and stay within one kind', () => {
  const [item] = playAiDrafts(JSON.stringify({items: [row('사과가 웃으면?', '풋 사과!')]}), 'riddle', 'low', [], ids).items;
  const nonsense = playBank.find(value => value.kind === 'nonsense' && value.answers[0] === '풋사과');
  assert(nonsense, 'bank has 풋사과 under nonsense');
  assert.equal(duplicateOf(item, playBank), undefined, 'same answer in another kind is allowed');
  assert(duplicateOf({...item, kind: 'nonsense'}, playBank), 'same answer in the same kind is not');
});
test('unreadable AI output is reported, and the request lists existing questions as data', () => {
  assert.throws(() => playAiDrafts('not json', 'nonsense', 'low', [], ids), /AI 응답/);
  const request = playAiRequest({kind: 'spelling', gradeBand: 'high', count: 10, topic: '받침', existing: playBank}, 'test-model');
  const text = request.input[0].content[0].text;
  assert.match(text, /받침/); assert.match(text, /설거지/);
  assert(!text.includes(playBank.find(item => item.kind === 'nonsense')!.prompt.slice(0, 30)), 'only the same kind is sent');
  assert.match(request.instructions, /exactly 10 questions/);
  assert.equal(request.text.format.strict, true);
});
