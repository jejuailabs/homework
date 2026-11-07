// 원어민 읽어주기 음성 미리 만들기. 카드 세트나 기본 단어장 JSON의 글을 모아 Cloud Storage tts/v1/에 없는 것만 만든다.
// 서버(/api/tts)와 같은 규칙(src/lib/tts.ts)으로 캐시 키를 만들므로, 여기서 만든 음성은 모든 반이 그대로 쓴다.
//
// 기본은 미리보기(돈이 들지 않음): 글 수·글자 수·예상 비용만 보여 준다. --check를 붙이면 저장소에 이미 있는지도 센다.
// --apply를 붙여야 실제로 Google Text-to-Speech를 부르고(비용 발생) 파일을 저장하며, aiJobs에 글자 수와 예상 비용을 남긴다.
//
//   node scripts/tts-pregenerate.mjs --sets <setId,setId> [--fields front,back,example] [--check] [--apply] [--max-chars 200000]
//   node scripts/tts-pregenerate.mjs --json <vocab.json>   (배열: 문자열 또는 {front, back, example} 객체, 또는 {cards: [...]})
//
// 환경: .env.local의 FIREBASE_SERVICE_ACCOUNT_JSON(값을 출력하지 않는다), GOOGLE_TTS_FAMILY(chirp3-hd|neural2), GOOGLE_TTS_VOICE_KO/EN.
// 운영 프로젝트(book-9b8ce)에서 --apply는 비용이 드는 작업이다. 소유자 승인 후에만 실행한다.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {cert, initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {detectTtsLang, normalizeTtsText, TTS_TEXT_LIMIT, ttsCacheMaterial, ttsFamily, ttsLanguageCode, ttsModelName, ttsObjectPath, ttsVoiceName} from '../src/lib/tts.ts';

const args = process.argv.slice(2), flag = name => args.includes(name), value = name => {const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined;};
const apply = flag('--apply'), check = flag('--check') || apply;
const fields = (value('--fields') || 'front,back').split(',').map(item => item.trim()).filter(Boolean);
const maxChars = Number(value('--max-chars') || 200_000);
const USD_PER_MILLION = {'chirp3-hd': 30, neural2: 16};
if (!value('--sets') && !value('--json')) {console.error('--sets <id,id> 또는 --json <file>을 주세요.'); process.exit(1);}

try {process.loadEnvFile('.env.local');} catch {}
const family = ttsFamily(process.env.GOOGLE_TTS_FAMILY?.trim()), model = ttsModelName(family);
const needsFirebase = check || Boolean(value('--sets'));
let app;
if (needsFirebase) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {console.error('FIREBASE_SERVICE_ACCOUNT_JSON이 없어요.'); process.exit(1);}
  app = initializeApp({credential: cert(JSON.parse(raw)), projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET});
}

const texts = new Set();
const add = text => {const clean = normalizeTtsText(text); if (clean && clean.length <= TTS_TEXT_LIMIT && detectTtsLang(clean)) texts.add(clean);};
const addCard = card => {if (typeof card === 'string') add(card); else if (card && typeof card === 'object') for (const field of fields) add(card[field]);};
if (value('--json')) {
  const data = JSON.parse(await readFile(value('--json'), 'utf8'));
  for (const card of Array.isArray(data) ? data : Array.isArray(data?.cards) ? data.cards : []) addCard(card);
}
if (value('--sets')) {
  for (const setId of value('--sets').split(',').map(item => item.trim()).filter(Boolean)) {
    const snapshot = await getFirestore(app).doc(`cardSets/${setId}`).get();
    if (!snapshot.exists) {console.warn(`세트 없음: ${setId}`); continue;}
    for (const card of snapshot.data().cards ?? []) addCard(card);
  }
}

const plans = [...texts].map(text => {
  const lang = detectTtsLang(text), voice = ttsVoiceName(lang, family, 'bright', process.env[`GOOGLE_TTS_VOICE_${lang.toUpperCase()}`]);
  const key = createHash('sha256').update(ttsCacheMaterial(text, lang, voice, model)).digest('hex');
  return {text, lang, voice, path: ttsObjectPath(key)};
});
const bucket = check ? getStorage(app).bucket() : null;
let missing = plans;
if (bucket) {
  missing = [];
  for (const plan of plans) if (!(await bucket.file(plan.path).exists())[0]) missing.push(plan);
}
const chars = list => list.reduce((sum, plan) => sum + plan.text.length, 0);
console.log(`모델 ${model} · 글 ${plans.length}개 · ${check ? `없는 것 ${missing.length}개 · ` : ''}만들 글자 ${chars(missing)}자 · 예상 $${(chars(missing) / 1e6 * USD_PER_MILLION[family]).toFixed(4)}`);
if (!apply) {console.log(check ? '미리보기만 했어요. --apply로 만들어요.' : '미리보기만 했어요. --check로 저장소를 확인하고 --apply로 만들어요.'); process.exit(0);}
if (chars(missing) > maxChars) {console.error(`--max-chars ${maxChars}자를 넘어요. 범위를 줄이거나 값을 올려 주세요.`); process.exit(1);}

const token = (await app.options.credential.getAccessToken()).access_token;
let made = 0, spent = 0;
for (const plan of missing) {
  const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'}, body: JSON.stringify({input: {text: plan.text}, voice: {languageCode: ttsLanguageCode(plan.lang), name: plan.voice}, audioConfig: {audioEncoding: 'MP3'}}), signal: AbortSignal.timeout(30_000)});
  if (!response.ok) {console.error(`실패 ${response.status}: ${response.status === 403 ? 'Text-to-Speech API 사용 설정·권한을 확인해 주세요.' : '잠시 후 다시 실행해 주세요.'}`); await response.body?.cancel(); break;}
  const {audioContent} = await response.json();
  try {await bucket.file(plan.path).save(Buffer.from(audioContent, 'base64'), {resumable: false, contentType: 'audio/mpeg', metadata: {cacheControl: 'private,max-age=86400'}, preconditionOpts: {ifGenerationMatch: 0}});}
  catch (error) {if (error?.code !== 412) throw error;}
  made++; spent += plan.text.length;
}
const createdAt = new Date().toISOString(), estimatedUsd = spent / 1e6 * USD_PER_MILLION[family];
if (made) await getFirestore(app).collection('aiJobs').add({actorUid: 'tts-pregenerate', classId: '', meteringVersion: 2, tool: 'tts', model, status: 'done', createdAt, completedAt: createdAt, usage: {inputTokens: null, cachedInputTokens: null, outputTokens: null, totalTokens: null, audioSeconds: null, characters: spent, webSearchCalls: 0, serviceTier: null, estimatedUsd, pricingDate: '2026-10-24'}});
console.log(`만든 음성 ${made}개 · ${spent}자 · 예상 $${estimatedUsd.toFixed(4)}`);
