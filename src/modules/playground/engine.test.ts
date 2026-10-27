import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addDays, answerScore, choicesFor, chosung, emptyScore, gradeBand, hintsFor, nextPlaySkill, normalizeAnswer, playDate, publicSession, rankRows, schoolYear, validateItem, validateSettings, weekStart} from './engine';
import {playBank} from './bank/index';
import {defaultPlaySettings, playKinds, type PlayItem, type PlaySession, type PlaySkill} from './types';
import {nextQuizSkill} from '../daily-quiz/engine';
import type {QuizAnswer, QuizQuestion, QuizSkill} from '../daily-quiz/types';

const item = playBank.find(row => row.kind === 'vocab')!;
const session: PlaySession = {id: 'issued-session', kind: item.kind, item, date: '2026-10-27', gradeBand: item.gradeBand, seed: 'class:pupil:2026-10-27', hintsUsed: 0, review: false, createdAt: '2026-10-27T00:00:00.000Z'};

test('answer normalization accepts Korean compatibility forms but preserves spelling boundaries', () => {
  assert.equal(normalizeAnswer(' “ 종 이 배! ” ', 'nonsense'), '종이배');
  assert.equal(normalizeAnswer('  ＡＢＣ~ ', 'riddle'), 'abc');
  assert.equal(normalizeAnswer(' ㄱㅏ ', 'vocab'), '가');
  assert.equal(normalizeAnswer(' “할 수 있다.” ', 'spelling'), '할 수 있다');
  assert.notEqual(normalizeAnswer('할 수 있다', 'spelling'), normalizeAnswer('할수 있다', 'spelling'));
  assert.notEqual(normalizeAnswer('너만큼', 'spelling'), normalizeAnswer('너 만큼', 'spelling'));
  assert.notEqual(normalizeAnswer('되요', 'spelling'), normalizeAnswer('돼요', 'spelling'));
});
test('chosung handles all 19 initial consonants, spaces, decomposed Hangul and non-Hangul', () => {
  assert.equal(chosung('가까나다따라마바빠사싸아자짜차카타파하'), 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ');
  assert.equal(chosung('그릇'), 'ㄱㄹ');
  assert.equal(chosung('역지 사지! 3'), 'ㅇㅈ ㅅㅈ! 3');
  assert.equal(chosung('한글'.normalize('NFD')), 'ㅎㄱ');
});
test('calendar uses Seoul midnight, Monday weeks and the March school year boundary', () => {
  assert.equal(playDate(new Date('2026-10-26T14:59:59Z')), '2026-10-26');
  assert.equal(playDate(new Date('2026-10-26T15:00:00Z')), '2026-10-27');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(weekStart('2026-10-25'), '2026-10-19');
  assert.equal(weekStart('2026-10-26'), '2026-10-26');
  assert.equal(schoolYear('2027-02-28'), 2026);
  assert.equal(schoolYear('2027-03-01'), 2027);
  for (const invalid of ['2026-02-30', '2026-13-01', '2026-1-2', '../secret', '']) assert.throws(() => weekStart(invalid));
  assert.throws(() => addDays('2026-10-27', NaN)); assert.throws(() => playDate(new Date('invalid')));
});
test('class grade accepts existing numeric strings but rejects coercion and out-of-range values', () => {
  assert.deepEqual([1,2,3,4,5,6].map(gradeBand), ['low','low','mid','mid','high','high']);
  assert.equal(gradeBand('3'), 'mid');
  for (const invalid of [0,7,-1,2.5,NaN,Infinity,null,undefined,true,[],{},'', ' 2 ', '2e0']) assert.throws(() => gradeBand(invalid));
});
test('choices are stable per issued seed, change across pupils and never expose original answer indices', () => {
  const original = structuredClone(item), first = choicesFor(item, 'pupil-a');
  assert.deepEqual(choicesFor(item, 'pupil-a'), first);
  assert.deepEqual(item, original);
  assert.equal(new Set(first.map(choice => choice.id)).size, first.length);
  assert(first.every(choice => /^c_[a-z0-9]+_[a-z0-9]+$/.test(choice.id)));
  assert.deepEqual(new Set(first.map(choice => choice.label)), new Set(item.choices));
  const permutations = new Set(Array.from({length: 24}, (_, i) => choicesFor(item, `pupil-${i}`).map(choice => choice.label).join('|')));
  assert(permutations.size > 3);
  assert.notDeepEqual(choicesFor(item, 'pupil-b').map(choice => choice.id), first.map(choice => choice.id));
});
test('public session reveals only hints that the server recorded and never the full bank item', () => {
  const before = publicSession(session);
  for (const privateField of ['item', 'answers', 'reveal', 'seed', 'date', 'gradeBand', 'review']) assert(!(privateField in before));
  assert.deepEqual(before.hints, []); assert.equal(before.maxHints, 3); assert.equal(before.result, undefined);
  const once = publicSession({...session, hintsUsed: 1});
  assert.deepEqual(once.hints, [hintsFor(item)[0]]); assert.equal(once.hintCount, 1);
  const twice = publicSession({...session, hintsUsed: 2});
  assert.deepEqual(twice.hints, hintsFor(item).slice(0, 2));
  const result = {answer: item.answers[0], correct: true, expected: item.answers[0], reveal: item.reveal, score: 10, practice: false, reward: 0};
  assert.deepEqual(publicSession({...session, result}).result, result);
  assert.equal(session.hintsUsed, 0);
});
test('vocabulary fallback hints reveal length, initials and first letter in order', () => {
  const vocab = {...item, answers: ['역지사지'], hints: []};
  assert.deepEqual(hintsFor(vocab), ['띄어쓰기를 빼면 4글자예요.', '초성은 ㅇㅈㅅㅈ예요.', '첫 글자는 ‘역’예요.']);
  assert.deepEqual(hintsFor({...vocab, hints: ['상대 처지에서 생각해요.']}), ['상대 처지에서 생각해요.']);
  assert.deepEqual(hintsFor({...vocab, kind: 'riddle'}), []);
});
test('first-answer scoring penalizes revealed hints and never rewards a wrong answer', () => {
  assert.deepEqual([0,1,2,3].map(hints => answerScore(true, hints)), [10,7,4,4]);
  assert.deepEqual([0,1,2,3].map(hints => answerScore(false, hints)), [0,0,0,0]);
  for (const invalid of [-1,0.5,NaN,Infinity]) assert.throws(() => answerScore(true, invalid));
});
test('spelling review matches daily-quiz recurrence across correctness, uncertainty, same-day repeats and 30-day cap', () => {
  const question: QuizQuestion = {id:'q',subject:'english',skillId:'review',skillLabel:'review',prompt:'p',choices:[],answer:'a',explanation:'e',kind:'text'};
  let quiz: QuizSkill | undefined, play: PlaySkill | undefined;
  const schedule = [
    ['2026-10-27',false,false], ['2026-10-27',true,false], ['2026-10-28',true,true],
    ['2026-10-31',true,false], ['2026-11-06',true,false], ['2026-11-18',true,false],
    ['2026-12-12',true,false], ['2026-12-12',true,true], ['2027-01-11',false,false],
  ] as const;
  for (const [date, correct, unsure] of schedule) {
    const answer: QuizAnswer = {answer:'a',correct,understanding:unsure?'unsure':'known',submittedAt:date};
    quiz = nextQuizSkill(question, answer, date, quiz);
    play = nextPlaySkill('review',correct,unsure,date,play);
    for (const field of ['dueDate','interval','attempts','correctStreak','lastDate'] as const) assert.equal(play[field], quiz[field], `${date}: ${field}`);
  }
  assert.equal(play!.errors, 2);
  assert.equal(nextPlaySkill('new',true,false,'2026-10-27').interval,7);
  assert.equal(nextPlaySkill('new',true,true,'2026-10-27').interval,3);
  let mastery = nextPlaySkill('master',true,false,'2026-10-27');
  for (let i=0;i<8;i++) mastery = nextPlaySkill('master',true,false,mastery.dueDate,mastery);
  assert.equal(mastery.interval,30);
});
test('weekly ranks share ties without mutating inputs and empty scores share no mutable days', () => {
  const rows = [{id:'b',name:'B',score:10},{id:'a',name:'A',score:10},{id:'c',name:'C',score:2}];
  assert.deepEqual(rankRows(rows).map(row => [row.id,row.rank]), [['a',1],['b',1],['c',3]]);
  assert.equal(rows[0].id,'b');
  const first = emptyScore(), second = emptyScore(); first.days.push('2026-10-27'); assert.deepEqual(second.days,[]);
});
test('initial bank has unique permanent IDs and prompts, one correct choice, explanations and playable grade pools', () => {
  assert.equal(playBank.length,660);
  assert.equal(new Set(playBank.map(row => row.id)).size,playBank.length);
  assert.equal(new Set(playBank.map(row => row.prompt)).size,playBank.length);
  for (const row of playBank) {
    assert.deepEqual(validateItem(row),row);
    assert.equal(row.source,'bank'); assert.equal(row.version,'bank-v1');
    assert((row.choices?.length || 0)>=2);
    assert.equal(row.choices!.filter(choice => row.answers.some(answer => normalizeAnswer(choice,row.kind)===normalizeAnswer(answer,row.kind))).length,1);
    assert(row.reveal.length>10);
  }
  for (const kind of playKinds) for (const band of ['low','mid','high']) assert(playBank.filter(row => row.kind===kind && row.gradeBand===band).length>=10,`${kind}/${band}`);
});
test('teacher item validation rejects duplicate answers, alternative correct distractors and unsupported data', () => {
  const base: PlayItem = {...item,id:'t_123',source:'teacher'};
  for (const invalid of [null,[],{...base,id:'../x'},{...base,kind:'other'},{...base,gradeBand:'all'},{...base,prompt:''},{...base,reveal:''},
    {...base,answers:[]},{...base,answers:['배',' 배!']},{...base,choices:['오답','오답2']},{...base,choices:[base.answers[0],base.answers[0]]},
    {...base,answers:[base.answers[0],'별칭'],choices:[base.answers[0],'별칭']},{...base,source:'ai-draft'},{...base,enabled:'false'},
    {...base,hints:['1','2','3','4']},{...base,choices:[base.answers[0]]},{...base,prompt:'x'.repeat(601)},
  ]) assert.throws(() => validateItem(invalid));
  assert.equal(validateItem({...base,id:'ignored'},'t_override').id,'t_override');
  assert.deepEqual(validateItem({...base,kind:'spelling',answers:['할 수 있다'],choices:['할 수 있다','할수 있다']}).choices,['할 수 있다','할수 있다']);
});
test('settings validate boolean flags, bounded rewards and nonoverlapping same-day time windows', () => {
  assert.deepEqual(validateSettings(defaultPlaySettings),defaultPlaySettings);
  assert.deepEqual(validateSettings({...defaultPlaySettings,timeWindows:[{start:'13:00',end:'14:00'},{start:'08:40',end:'09:00'}]}).timeWindows,[{start:'08:40',end:'09:00'},{start:'13:00',end:'14:00'}]);
  for (const invalid of [null,[],{...defaultPlaySettings,enabled:'true'},{...defaultPlaySettings,soloReward:4},{...defaultPlaySettings,duelReward:-1},{...defaultPlaySettings,soloReward:0.5},
    {...defaultPlaySettings,timeWindows:[{start:'9:00',end:'10:00'}]}, {...defaultPlaySettings,timeWindows:[{start:'22:00',end:'06:00'}]},
    {...defaultPlaySettings,timeWindows:[{start:'08:00',end:'10:00'},{start:'09:30',end:'11:00'}]},
  ]) assert.throws(() => validateSettings(invalid));
});
