'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import {AlertTriangle, Check, Copy, LoaderCircle, Mic, RotateCcw, Save, Sparkles, Square, X} from 'lucide-react';
import type {ClassroomRosterEntry} from '@/components/classroom-shared';
import {analyzeAudio, type AudioAnalysis} from './audio';
import {alignReading, paceBand, speechMetrics, type ReadingResult, type SpeechMetrics} from './scoring';
import {micProblemText, startDeviceRecognition, deviceRecognitionAvailable, useRecorder, type Take} from './recorder';
import {REFERENCE_LIMIT, rubricName, speechModeName, SPEECH_MAX_SECONDS, type SpeechFeedback, type SpeechMode, type SpeechRecord, type TranscriptPart} from './policy';
import type {Book} from './books';

export type PracticePreset = {book: Book; page: number} | null;
type Source = 'ai' | 'device' | 'typed';
const sourceName: Record<Source, string> = {ai: 'AI 전사 · 별도 비용', device: '기기 음성 인식 (무료·참고용)', typed: '선생님이 들은 대로 입력'};
const topics = ['나의 꿈', '내가 좋아하는 계절', '주말에 있었던 일', '우리 반 자랑', '내가 아끼는 물건', '고마운 사람'];

export default function Practice({classId, roster, ai, preset, onSaved}: {
  classId: string; roster: ClassroomRosterEntry[]; ai: boolean; preset: PracticePreset; onSaved: (record: SpeechRecord) => void;
}) {
  const [mode, setMode] = useState<SpeechMode>(preset ? 'reading' : 'speech');
  const [studentId, setStudentId] = useState(''), [reference, setReference] = useState(preset ? preset.book.pages[preset.page]?.text ?? '' : '');
  const [topic, setTopic] = useState(''), [book, setBook] = useState<{id: string; title: string; page: number; level: number} | null>(preset ? {id: preset.book.id, title: preset.book.title, page: preset.page, level: preset.book.level} : null);
  const [deviceOk, setDeviceOk] = useState(false), [source, setSource] = useState<Source>(ai ? 'ai' : 'typed');
  const [take, setTake] = useState<Take | null>(null), [audio, setAudio] = useState<AudioAnalysis | null>(null);
  const [heard, setHeard] = useState(''), [machine, setMachine] = useState(''), [parts, setParts] = useState<TranscriptPart[]>([]), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'' | 'transcribe' | 'feedback' | 'save'>(''), [error, setError] = useState(''), [feedback, setFeedback] = useState<SpeechFeedback | null>(null), [saved, setSaved] = useState(false), [copied, setCopied] = useState(false);
  const device = useRef<{stop: () => void} | null>(null), deviceText = useRef('');

  useEffect(() => {
    if (!preset) return;
    setMode('reading'); setReference(preset.book.pages[preset.page]?.text ?? '');
    setBook({id: preset.book.id, title: preset.book.title, page: preset.page, level: preset.book.level}); reset();
  }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true;
    void deviceRecognitionAvailable().then(ok => {if (alive) {setDeviceOk(ok); if (!ai && ok) setSource('device');}});
    return () => {alive = false;};
  }, [ai]);
  useEffect(() => {if (!ai && source === 'ai') setSource(deviceOk ? 'device' : 'typed');}, [ai, deviceOk, source]);
  useEffect(() => () => {if (take) URL.revokeObjectURL(take.url);}, [take]);

  const recorder = useRecorder(next => {
    device.current?.stop(); device.current = null;
    setTake(next); setAudio(analyzeAudio(next.samples));
    if (source === 'device') {setHeard(deviceText.current); setMachine(deviceText.current);}
    if (source === 'ai') void transcribe(next);
  });
  function reset() {
    setTake(null); setAudio(null); setHeard(''); setMachine(''); setParts([]); setConfirmed(false); setFeedback(null); setSaved(false); setError(''); setCopied(false);
  }
  function begin() {
    reset();
    deviceText.current = '';
    void recorder.start().then(() => {
      if (source === 'device') device.current = startDeviceRecognition(text => {deviceText.current = text;});
    });
  }
  async function transcribe(current: Take) {
    setBusy('transcribe'); setError('');
    try {
      const response = await fetch(`/api/speech-studio/transcribe${classId ? `?classId=${encodeURIComponent(classId)}` : ''}`, {method: 'POST', headers: {'Content-Type': 'audio/wav'}, body: Uint8Array.from(current.wav).buffer});
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || '음성을 글로 옮기지 못했어요.');
      setHeard(String(data.text || '')); setMachine(String(data.text || '')); setParts(Array.isArray(data.parts) ? data.parts : []);
    } catch (reason) {setError(`${reason instanceof Error ? reason.message : '음성을 글로 옮기지 못했어요.'} 들은 내용을 직접 입력해도 돼요.`);}
    finally {setBusy('');}
  }

  const reading: ReadingResult | null = useMemo(() => {
    if (mode !== 'reading' || !confirmed || !reference.trim()) return null;
    try {return alignReading(reference, heard);} catch {return null;}
  }, [mode, confirmed, reference, heard]);
  const metrics: SpeechMetrics | null = useMemo(() => audio && confirmed ? speechMetrics(heard, audio, reading ?? undefined) : null, [audio, confirmed, heard, reading]);
  // How much of the recognizer's text was fixed: a check on the AI, never a score for the child.
  const corrections = useMemo(() => {
    if (!confirmed || !machine.trim() || source === 'typed') return null;
    try {return Math.round(100 - alignReading(heard, machine).accuracy);} catch {return null;}
  }, [confirmed, machine, heard, source]);

  async function askFeedback() {
    if (!metrics || busy) return;
    setBusy('feedback'); setError('');
    try {
      const response = await fetch('/api/speech-studio/feedback', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
        mode, transcript: heard, metrics: {...metrics, ...audioMetrics(audio!)}, accuracy: reading?.accuracy ?? null,
        ...(mode === 'reading' ? {reference: reference.slice(0, REFERENCE_LIMIT)} : {topic}), ...(classId ? {classId} : {}),
      })});
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || '피드백을 만들지 못했어요.');
      setFeedback(data.feedback);
    } catch (reason) {setError(reason instanceof Error ? reason.message : '피드백을 만들지 못했어요.');}
    finally {setBusy('');}
  }
  async function save() {
    if (!metrics || !classId || busy) return;
    setBusy('save'); setError('');
    try {
      const response = await fetch('/api/speech-studio/records', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
        classId, studentId, mode, source, confirmed: true, transcript: heard, topic: mode === 'speech' ? topic : '',
        bookId: mode === 'reading' ? book?.id ?? '' : '', bookTitle: mode === 'reading' ? book?.title ?? '' : '', page: mode === 'reading' ? book?.page ?? null : null, level: mode === 'reading' ? book?.level ?? null : null,
        accuracy: reading?.accuracy, counts: reading?.counts, repeats: reading?.repeats ?? 0,
        metrics: {...metrics, ...audioMetrics(audio!), ...(corrections != null ? {corrections} : {})}, feedback,
      })});
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || '기록을 저장하지 못했어요.');
      setSaved(true); onSaved(data.record);
    } catch (reason) {setError(reason instanceof Error ? reason.message : '기록을 저장하지 못했어요.');}
    finally {setBusy('');}
  }

  const recording = recorder.state === 'recording', canStart = recorder.state === 'idle' && !busy && (mode !== 'reading' || reference.trim());
  const problem = recorder.problem ? micProblemText[recorder.problem] : null;
  return <div className="ss-practice">
    <div className="ss-modes" role="tablist" aria-label="활동">
      {(Object.keys(speechModeName) as SpeechMode[]).map(m => <button key={m} type="button" role="tab" aria-selected={mode === m} disabled={recording} onClick={() => {setMode(m); reset();}}>{speechModeName[m]}</button>)}
    </div>
    <div className="ss-setup">
      {mode !== 'free' && <label className="ss-inline">학생<select value={studentId} onChange={e => setStudentId(e.target.value)} disabled={recording}><option value="">선택 안 함 (연습만)</option>{roster.map(s => <option key={s.id} value={s.id}>{s.number ? `${s.number}. ` : ''}{s.name}</option>)}</select></label>}
      <label className="ss-inline">글로 옮기기<select value={source} onChange={e => setSource(e.target.value as Source)} disabled={recording}>
        {ai && <option value="ai">{sourceName.ai}</option>}{deviceOk && <option value="device">{sourceName.device}</option>}<option value="typed">{sourceName.typed}</option>
      </select></label>
    </div>
    {mode === 'reading' && <label className="ss-field">읽을 글 {book && <small>{book.title} · {book.page + 1}쪽</small>}<textarea rows={4} value={reference} maxLength={REFERENCE_LIMIT} disabled={recording} onChange={e => {setReference(e.target.value); setBook(null); setConfirmed(false);}} placeholder="동화 서재에서 '이 쪽 따라 읽기 녹음'을 누르거나 글을 붙여 넣어 주세요."/></label>}
    {mode === 'speech' && <label className="ss-field">주제<input value={topic} maxLength={200} disabled={recording} onChange={e => setTopic(e.target.value)} placeholder="예) 나의 꿈"/><span className="ss-chips">{topics.map(t => <button key={t} type="button" className="ss-chip-btn" onClick={() => setTopic(t)}>{t}</button>)}</span></label>}
    {mode === 'free' && <p className="ss-note">말로 쓰기는 받아쓰기만 해요. 점수를 매기거나 서버에 저장하지 않아요.</p>}

    <div className={'ss-recorder' + (recording ? ' is-recording' : '')}>
      {recording ? <button type="button" className="ss-rec-btn is-stop" onClick={() => recorder.stop()}><Square size={22}/>녹음 마치기</button>
        : <button type="button" className="ss-rec-btn" disabled={!canStart} onClick={begin}>{recorder.state === 'starting' || recorder.state === 'processing' ? <LoaderCircle className="spin" size={22}/> : <Mic size={22}/>}{take ? '다시 녹음' : '녹음 시작'}</button>}
      <div className="ss-meter" aria-hidden="true"><i style={{transform: `scaleX(${recording ? recorder.level : 0})`}}/></div>
      <span className="ss-timer" role="timer">{recording ? `${recorder.seconds}초 / ${SPEECH_MAX_SECONDS}초` : take ? `${Math.round(take.seconds)}초 녹음` : `최대 ${SPEECH_MAX_SECONDS / 60}분`}</span>
      {recording && <button type="button" className="ss-text-btn" onClick={() => recorder.stop(true)}><X size={14}/>취소</button>}
    </div>
    {recording && mode === 'reading' && <p className="ss-prompter">{reference}</p>}
    {problem && <div className="ss-problem" role="alert"><AlertTriangle size={18}/><div><strong>{problem.title}</strong><ul>{problem.steps.map(s => <li key={s}>{s}</li>)}</ul></div><button type="button" className="ss-secondary" onClick={begin}>다시 시도</button></div>}
    {recorder.error && <p className="ss-error" role="alert">{recorder.error}</p>}

    {take && <div className="ss-result">
      <audio controls src={take.url} aria-label="녹음 다시 듣기"/>
      {busy === 'transcribe' ? <p className="ss-note"><LoaderCircle className="spin" size={14}/> 말한 내용을 글로 옮기는 중…</p> : <>
        <label className="ss-field">{mode === 'free' ? '받아 적은 글' : '알아들은 말'} <small>{source === 'typed' ? '녹음을 들으며 아이가 말한 그대로 적어 주세요.' : '잘못 알아들은 부분을 고친 뒤 확인을 눌러 주세요.'}</small>
          <textarea rows={4} value={heard} maxLength={3000} onChange={e => {setHeard(e.target.value); setConfirmed(false); setFeedback(null); setSaved(false);}}/></label>
        {parts.some(p => p.unsure) && <p className="ss-note">AI가 확신하지 못한 부분: {parts.filter(p => p.unsure).map(p => `"${p.text}"`).join(', ')}. 녹음과 비교해 주세요.</p>}
        {mode === 'free' ? <button type="button" className="ss-secondary" disabled={!heard.trim()} onClick={() => void navigator.clipboard.writeText(heard).then(() => setCopied(true))}>{copied ? <Check size={15}/> : <Copy size={15}/>}{copied ? '복사했어요' : '글 복사'}</button>
          : !confirmed && <button type="button" className="ss-primary" disabled={!heard.trim() && mode !== 'reading'} onClick={() => setConfirmed(true)}><Check size={16}/>확인하고 결과 보기</button>}
      </>}
      {confirmed && metrics && audio && <Results mode={mode} reading={reading} metrics={metrics} audio={audio} corrections={corrections}/>}
      {confirmed && metrics && <div className="ss-row ss-actions">
        {ai && !feedback && <button type="button" className="ss-secondary" disabled={Boolean(busy) || !heard.trim()} onClick={() => void askFeedback()}>{busy === 'feedback' ? <LoaderCircle className="spin" size={15}/> : <Sparkles size={15}/>}AI 피드백 · 별도 비용</button>}
        <button type="button" className="ss-primary" disabled={Boolean(busy) || saved || !classId} onClick={() => void save()}>{busy === 'save' ? <LoaderCircle className="spin" size={15}/> : saved ? <Check size={15}/> : <Save size={15}/>}{saved ? '기록에 저장했어요' : studentId ? '학생 기록에 저장' : '연습 기록에 저장'}</button>
        <button type="button" className="ss-text-btn" onClick={reset}><RotateCcw size={14}/>새로 하기</button>
      </div>}
      {feedback && <FeedbackCard feedback={feedback}/>}
    </div>}
    {error && <p className="ss-error" role="alert">{error}</p>}
  </div>;
}

export const audioMetrics = (audio: AudioAnalysis) => ({steadiness: audio.steadiness, fades: audio.fades, tooQuiet: audio.tooQuiet, ...(audio.pitchRange != null ? {pitchRange: audio.pitchRange, monotone: Boolean(audio.monotone)} : {})});
const paceText = {slow: '천천히', steady: '알맞아요', fast: '빨라요'} as const;

function Results({mode, reading, metrics, audio, corrections}: {mode: SpeechMode; reading: ReadingResult | null; metrics: SpeechMetrics; audio: AudioAnalysis; corrections: number | null}) {
  const cards: {label: string; value: string; hint: string}[] = [];
  if (reading) cards.push({label: '읽기 정확도', value: `${reading.accuracy}%`, hint: `${reading.total}음절 중 ${reading.correct}음절`});
  if (metrics.cspm != null) cards.push({label: '분당 바르게 읽은 음절', value: String(metrics.cspm), hint: '지난 기록과 비교해 보세요'});
  cards.push({label: '말 빠르기', value: paceText[paceBand(metrics.rate)], hint: `분당 ${metrics.rate}음절`});
  cards.push({label: '쉼', value: `${metrics.pauses}번`, hint: metrics.longPauses ? `그중 긴 쉼 ${metrics.longPauses}번` : '긴 쉼 없음'});
  if (mode === 'speech') cards.push({label: '군말', value: `${metrics.fillers}번`, hint: '"음", "어" 같은 말'});
  cards.push({label: '목소리 크기', value: audio.tooQuiet ? '작아요' : audio.fades ? '점점 작아져요' : '고르게', hint: `고르기 ${audio.steadiness}/100`});
  if (audio.monotone != null) cards.push({label: '억양', value: audio.monotone ? '단조로워요' : '살아 있어요', hint: `높낮이 ${audio.pitchRange}반음`});
  return <div className="ss-results">
    {reading && <div className="ss-marked" aria-label="원문 표시">
      {reading.words.map((w, i) => <span key={i}>
        <span className={'ss-word is-' + w.status} title={w.status === 'changed' ? `알아들은 말: ${w.heard}` : w.status === 'missed' ? '빠뜨린 말' : undefined}>{w.text}</span>
        {w.status === 'changed' && <small className="ss-heard">{w.heard}</small>}
        {reading.inserted.filter(x => x.after === i).map(x => <small key={x.text} className="ss-inserted">+{x.text}</small>)}{' '}
      </span>)}
      <p className="ss-legend"><span className="ss-word is-missed">빠뜨림</span> <span className="ss-word is-changed">바꿔 읽음</span> <small className="ss-inserted">+덧붙임</small>{reading.repeats ? ` · 다시 읽은 곳 ${reading.repeats}번(감점 없음)` : ''}</p>
    </div>}
    <ul className="ss-cards">{cards.map(c => <li key={c.label}><small>{c.label}</small><strong>{c.value}</strong><span>{c.hint}</span></li>)}</ul>
    {corrections != null && <p className="ss-foot">AI가 알아들은 글 가운데 {corrections}%를 고쳤어요. 아이 점수가 아니라 AI가 이 목소리를 얼마나 잘 들었는지 보여 주는 값이에요.{corrections >= 15 ? ' 고친 부분이 많아 정확도는 참고로만 봐 주세요.' : ''}</p>}
  </div>;
}

export function FeedbackCard({feedback}: {feedback: SpeechFeedback}) {
  return <div className="ss-feedback">
    <div><h4>잘한 점</h4><ul>{feedback.strengths.map(s => <li key={s}>⭐ {s}</li>)}</ul></div>
    <div><h4>다음 목표</h4><p>🎯 {feedback.goal}</p></div>
    <dl className="ss-rubric">{(Object.keys(rubricName) as (keyof typeof rubricName)[]).map(k => <div key={k}><dt>{rubricName[k]}</dt><dd aria-label={`${feedback.rubric[k]}/4`}>{[1, 2, 3, 4].map(n => <i key={n} className={n <= feedback.rubric[k] ? 'on' : ''}/>)}</dd></div>)}</dl>
    {feedback.teacherNote && <p className="ss-foot">선생님께: {feedback.teacherNote}</p>}
  </div>;
}
