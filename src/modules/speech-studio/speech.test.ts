import assert from 'node:assert/strict';
import test from 'node:test';
import {alignReading, countFillers, estimateLevel, normalizeSpeech, paceBand, readingProfile, speechMetrics} from './scoring';
import {analyzeAudio, SPEECH_RATE} from './audio';
import {pagesFromText, sampleBooks} from './books';

test('normalizing ignores spacing and punctuation and reads numbers aloud', () => {
  assert.equal(normalizeSpeech('고래 3마리가, 헤엄쳐요!'), normalizeSpeech('고래삼마리가 헤엄쳐요'));
  assert.equal(normalizeSpeech('12시'), '십이시');
  assert.equal(normalizeSpeech('2026년'), '이천이십육년');
  assert.equal(normalizeSpeech('Hello World'), 'helloworld');
});

test('a perfect reading scores 100 regardless of spacing', () => {
  const result = alignReading('토끼가 깡충깡충 뛰어요.', '토끼가깡충 깡충 뛰어요');
  assert.equal(result.accuracy, 100);
  assert.deepEqual(result.counts, {missed: 0, changed: 0, inserted: 0});
  assert(result.words.every(w => w.status === 'ok'));
});

test('missed, changed and inserted words are told apart', () => {
  const result = alignReading('옛날에 착한 나무꾼이 살았어요', '옛날에 나무꾼이 정말 살았어요');
  assert.equal(result.words[1].status, 'missed');
  assert.equal(result.words[2].status, 'ok');
  assert.deepEqual(result.inserted, [{after: 2, text: '정말'}]);
  const changed = alignReading('고래가 바다에 살아요', '고래가 바다에 사라요');
  assert.equal(changed.words[2].status, 'changed');
  assert.equal(changed.words[2].heard, '사라요');
  assert(changed.accuracy > 60 && changed.accuracy < 100);
});

test('reading a word twice is a repeat, not an error', () => {
  const result = alignReading('고래가 친구를 찾아요', '고래가 고래가 친구를 찾아요');
  assert.equal(result.accuracy, 100);
  assert.equal(result.repeats, 1);
  assert.equal(result.inserted.length, 0);
});

test('silence against a reference marks every word missed', () => {
  const result = alignReading('해와 달이 되었어요', '');
  assert.equal(result.accuracy, 0);
  assert(result.words.every(w => w.status === 'missed'));
  assert.throws(() => alignReading('가'.repeat(1600), '가'), /REFERENCE_TOO_LONG/);
});

test('fillers count only as whole words', () => {
  assert.equal(countFillers('음 그러니까 어 제 작품은 음악 시간에 어머니와 만든 거예요'), 3);
});

test('metrics: pace, sentence length and correct syllables per minute', () => {
  const reading = alignReading('토끼가 뛰어요. 거북이가 걸어요.', '토끼가 뛰어요. 거북이가 걸어요.');
  const metrics = speechMetrics('토끼가 뛰어요. 거북이가 걸어요.', {durationSeconds: 6, speakingSeconds: 4, pauses: 1, longPauses: 0}, reading);
  assert.equal(metrics.syllables, 13);
  assert.equal(metrics.rate, 195);
  assert.equal(metrics.cspm, 130);
  assert.equal(metrics.sentenceWords, 2);
  assert.equal(paceBand(120), 'slow');
  assert.equal(paceBand(250), 'steady');
  assert.equal(paceBand(400), 'fast');
});

test('book level rises with longer sentences and words', () => {
  const easy = estimateLevel('나는 사과를 먹어요. 엄마가 웃어요. 강아지가 뛰어요.');
  const hard = estimateLevel('산신령은 정직한 나무꾼의 이야기를 끝까지 들은 다음, 반짝이는 금도끼와 은도끼를 모두 선물로 건네주며 앞으로도 정직하게 살아가라고 당부했습니다.');
  assert(easy < hard, `${easy} < ${hard}`);
  assert(easy >= 1 && hard <= 6);
});

test('reading profile moves up, stays or steps back and flags a falling reader', () => {
  const day = (n: number) => `2026-11-${String(n).padStart(2, '0')}`;
  const strong = readingProfile([96, 98, 97].map((accuracy, i) => ({accuracy, level: 2, createdAt: day(i + 1)})));
  assert.equal(strong.advice, 'up');
  assert.equal(strong.nextLevel, 3);
  const weak = readingProfile([85, 88].map((accuracy, i) => ({accuracy, level: 1, createdAt: day(i + 1), counts: {missed: 3, changed: 1, inserted: 0}})));
  assert.equal(weak.advice, 'down');
  assert.equal(weak.nextLevel, 1);
  assert.equal(weak.commonError, 'missed');
  const falling = readingProfile([97, 94, 91, 88].map((accuracy, i) => ({accuracy, level: 3, createdAt: day(i + 1)})));
  assert.equal(falling.needsHelp, true);
  assert.equal(falling.trend, 'down');
  assert.equal(readingProfile([]).sessions, 0);
});

function tone(seconds: number, hz: number, amplitude = 0.3) {
  return Float32Array.from({length: Math.round(seconds * SPEECH_RATE)}, (_, i) => amplitude * Math.sin(2 * Math.PI * hz * i / SPEECH_RATE));
}
const join = (...parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const p of parts) {out.set(p, at); at += p.length;}
  return out;
};
const silence = (seconds: number) => new Float32Array(Math.round(seconds * SPEECH_RATE)).map(() => (Math.random() - 0.5) * 0.0005);

test('audio: speaking time and pauses come from loudness', () => {
  const result = analyzeAudio(join(silence(0.5), tone(1.5, 220), silence(0.5), tone(1, 220), silence(1), tone(1, 220), silence(0.3)));
  assert(Math.abs(result.speakingSeconds - 3.5) < 0.2, String(result.speakingSeconds));
  assert.equal(result.pauses, 2);
  assert.equal(result.longPauses, 1);
  assert.equal(result.tooQuiet, false);
  assert.equal(analyzeAudio(silence(2)).speakingSeconds, 0);
});

test('audio: a steady single note sounds monotone, a moving voice does not', () => {
  const flat = analyzeAudio(join(tone(1, 220), silence(0.4), tone(1, 220)));
  assert.equal(flat.monotone, true);
  const lively = analyzeAudio(join(tone(0.7, 180), tone(0.7, 260), silence(0.4), tone(0.7, 330), tone(0.7, 200)));
  assert.equal(lively.monotone, false);
  const fading = analyzeAudio(join(tone(0.6, 220, 0.5), silence(0.4), tone(0.6, 220, 0.5), silence(0.4), tone(0.6, 220, 0.05), silence(0.4), tone(0.6, 220, 0.04)));
  assert.equal(fading.fades, true);
  assert(fading.steadiness < flat.steadiness);
});

test('pasted text splits into pages and the sample books are ready', () => {
  const pages = pagesFromText('첫 문단이에요. 짧아요.\n\n둘째 문단이에요.');
  assert.equal(pages.length, 2);
  assert.equal(sampleBooks.length, 3);
  assert(sampleBooks.every(book => book.pages.length >= 4 && book.level >= 1 && book.license === 'own-work'));
});

import {cleanFeedback, cleanRecord, feedbackInput, speechTranscript, speechWavSeconds, SPEECH_MAX_BYTES} from './policy';
import {pcmWav} from '../voice-caption/wav';

test('recordings must be canonical 16kHz mono PCM within two minutes', () => {
  assert.equal(speechWavSeconds(pcmWav(new Float32Array(16000 * 3))), 3);
  assert.throws(() => speechWavSeconds(new Uint8Array(SPEECH_MAX_BYTES + 2)), /AUDIO_SIZE/);
  const bad = pcmWav(new Float32Array(16000));
  bad[0] = 0;
  assert.throws(() => speechWavSeconds(bad), /AUDIO_FORMAT/);
  assert.throws(() => speechWavSeconds(pcmWav(new Float32Array(100))), /AUDIO_DURATION/);
});

test('unsure recognizer segments are marked and plain text still works', () => {
  const result = speechTranscript({segments: [
    {start: 0, end: 2, text: ' 토끼가 뛰어요 ', avg_logprob: -0.2, no_speech_prob: 0.01},
    {start: 2, end: 3, text: '음음음', avg_logprob: -1.6, no_speech_prob: 0.1},
    {start: 3, end: 9, text: '거북이가', avg_logprob: -0.3, no_speech_prob: 0.9},
  ]}, 5)!;
  assert.equal(result.text, '토끼가 뛰어요 음음음 거북이가');
  assert.deepEqual(result.parts.map(p => p.unsure), [false, true, true]);
  assert.equal(result.parts[2].end, 5);
  assert.deepEqual(speechTranscript({text: '안녕하세요'}, 2), {text: '안녕하세요', parts: [{start: 0, end: 2, text: '안녕하세요', unsure: false}]});
  assert.equal(speechTranscript({text: ''}, 2), null);
});

test('saved practices keep only bounded numbers and text', () => {
  const record = cleanRecord({classId: 'c1', studentId: 's1', mode: 'reading', source: 'ai', transcript: '토끼', accuracy: 140, counts: {missed: 2, changed: -1, inserted: 'x'}, metrics: {rate: 9999, fades: true, audio: 'blob'}, feedback: {strengths: ['또렷해요'], goal: '쉼 지키기', rubric: {clarity: 9}}, level: 7, page: 2, extra: 'ignored'});
  assert.equal(record.accuracy, 100);
  assert.deepEqual(record.counts, {missed: 2, changed: 0, inserted: 0});
  assert.deepEqual(record.metrics, {rate: 1000, fades: true});
  assert.equal(record.level, null);
  assert.equal(record.page, 2);
  assert.equal(record.feedback!.rubric.clarity, 4);
  assert.equal('extra' in record, false);
  assert.throws(() => cleanRecord({classId: '../x', studentId: '', mode: 'reading', source: 'ai'}), /classId/);
  assert.throws(() => cleanRecord({classId: 'c1', studentId: '', mode: 'sing', source: 'ai'}), /mode/);
  const free = cleanRecord({classId: 'c1', studentId: '', mode: 'free', source: 'device', accuracy: 90, feedback: {strengths: ['a'], goal: 'b'}});
  assert.equal(free.accuracy, null);
  assert.equal(free.feedback, null);
  assert.equal(cleanFeedback({strengths: [], goal: 'x'}), null);
});

test('feedback prompt carries measures but never a name field', () => {
  const prompt = feedbackInput({mode: 'speech', transcript: '제 꿈은 수의사예요. 동물을 좋아해서예요.', topic: '나의 꿈', metrics: {rate: 240, pauses: 3, longPauses: 1, fillers: 2, steadiness: 80, fades: true, monotone: false}});
  assert.match(prompt, /주제: 나의 꿈/);
  assert.match(prompt, /분당 240음절/);
  assert.match(prompt, /끝으로 갈수록 작아짐/);
  assert.match(prompt, /문장 수 2/);
});
