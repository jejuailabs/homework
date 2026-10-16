'use client';

import {useEffect, useRef, useState, type CSSProperties} from 'react';
import {calendarDayDifference, countdownRemaining, formatDuration} from '@/lib/classroom-tools';
import {ToolActions, ToolButton, ToolField, ToolHint, useClassroom, useClassroomAudio, useClassroomSaved, useWords} from './classroom-shared';

export function ClassroomTimer() {
  const w = useWords(); const audio = useClassroomAudio();
  const [minutes, setMinutes] = useClassroomSaved('timer-minutes', 5, (v): v is number => typeof v === 'number' && v > 0 && v <= 180);
  const [mode, setMode] = useClassroomSaved('timer-mode', 'digital');
  const [remaining, setRemaining] = useState(300); const [duration, setDuration] = useState(300);
  const [running, setRunning] = useState(false); const [started, setStarted] = useState(false); const [complete, setComplete] = useState(false); const [sound, setSound] = useClassroomSaved('timer-sound', true);
  const deadline = useRef(0); const pausedMilliseconds = useRef(0); const finished = useRef(false); const playRef = useRef(audio.play); playRef.current = audio.play;
  const soundRef = useRef(sound); soundRef.current = sound;
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const next = countdownRemaining(deadline.current, Date.now()); setRemaining(next);
      if (next === 0 && !finished.current) { finished.current = true; setRunning(false); setComplete(true); if (soundRef.current) void playRef.current('bell'); }
    };
    tick(); const interval = setInterval(tick, 200); document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, [running]);
  const shown = started ? remaining : Math.round(minutes * 60); const total = started ? duration : Math.round(minutes * 60); const ratio = total ? shown / total : 0;
  function start() { const fresh = !started || remaining === 0; const milliseconds = fresh ? Math.round(minutes * 60000) : pausedMilliseconds.current; const seconds = Math.ceil(milliseconds / 1000); void audio.unlock(); setStarted(true); setComplete(false); setDuration(fresh ? seconds : duration); setRemaining(seconds); deadline.current = Date.now() + milliseconds; finished.current = false; setRunning(true); }
  function reset() { setRunning(false); setStarted(false); setComplete(false); setRemaining(Math.round(minutes * 60)); finished.current = false; }
  const modes = [['digital', '디지털', 'Digital'], ['analog', '아날로그', 'Analog'], ['hourglass', '모래시계', 'Hourglass'], ['pie', '파이', 'Pie'], ['balloon', '풍선', 'Balloon']];
  return <div className="classroom-tool"><div className="classroom-tabs">{modes.map(([id, ko, en]) => <button type="button" key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>{w(ko, en)}</button>)}</div>
    <div className={'classroom-timer classroom-timer-' + mode} style={{'--timer-ratio': ratio, '--timer-angle': `${ratio * 360}deg`} as CSSProperties}>
      {(mode === 'analog' || mode === 'pie') && <div className="classroom-timer-disc" aria-hidden="true">{mode === 'analog' && <span className="classroom-timer-hand" style={{transform: `rotate(${(1 - ratio) * 360}deg)`}}/>}</div>}
      {mode === 'hourglass' && <div className="classroom-hourglass" aria-hidden="true"><div style={{background: `linear-gradient(to top, #eac67a ${ratio * 100}%, transparent ${ratio * 100}%)`}}/><div style={{background: `linear-gradient(to bottom, #eac67a ${(1 - ratio) * 100}%, transparent ${(1 - ratio) * 100}%)`}}/></div>}
      {mode === 'balloon' && <div className="classroom-balloon" style={{transform: `scale(${.3 + ratio * .7})`}} aria-hidden="true">✦</div>}
      <output className="classroom-time-value" aria-label={w('남은 시간', 'Time remaining')}>{formatDuration(shown)}</output>
    </div>
    <p className="classroom-status" role="status">{complete ? w('시간이 되었어요! 함께 마무리해요.', 'Time is up! Let’s wrap up.') : running ? w('활동 중이에요', 'Activity in progress') : started ? w('잠시 멈췄어요', 'Paused') : w('준비되면 시작해요', 'Start when you are ready')}</p>
    <ToolActions>{running ? <ToolButton primary onClick={() => {pausedMilliseconds.current = Math.max(0, deadline.current - Date.now()); setRemaining(Math.ceil(pausedMilliseconds.current / 1000)); setRunning(false);}}>{w('일시 정지', 'Pause')}</ToolButton> : <ToolButton primary onClick={start}>{w(started && remaining > 0 ? '계속' : '시작', started && remaining > 0 ? 'Resume' : 'Start')}</ToolButton>}<ToolButton onClick={reset}>{w('다시 설정', 'Reset')}</ToolButton></ToolActions>
    <div className="classroom-inline"><ToolField title={w('시간 (분)', 'Minutes')}><input type="number" min="0.25" max="180" step="0.25" value={minutes} disabled={started} onChange={e => setMinutes(Math.min(180, Math.max(.25, Number(e.target.value) || .25)))}/></ToolField><label className="classroom-check"><input type="checkbox" checked={sound} onChange={e => setSound(e.target.checked)}/>{w('끝나면 알림음', 'Play finish sound')}</label></div>
    <div className="classroom-chips">{[1, 3, 5, 10, 20, 40].map(value => <button type="button" key={value} disabled={started} onClick={() => setMinutes(value)}>{value}{w('분', 'm')}</button>)}</div>
  </div>;
}

export function ClassroomClock() {
  const {en} = useClassroom(); const w = useWords(); const [now, setNow] = useState<Date | null>(null); const [analog, setAnalog] = useClassroomSaved('clock-analog', false);
  useEffect(() => { setNow(new Date()); const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return <div className="classroom-tool classroom-center"><ToolButton onClick={() => setAnalog(!analog)}>{w(analog ? '디지털로 보기' : '아날로그로 보기', analog ? 'Digital clock' : 'Analog clock')}</ToolButton>{now && <><p className="classroom-date">{now.toLocaleDateString(en ? 'en-US' : 'ko-KR', {dateStyle: 'full'})}</p>{analog ? <div className="classroom-clockface" role="img" aria-label={now.toLocaleTimeString(en ? 'en-US' : 'ko-KR')}>{Array.from({length: 12}, (_, i) => <span key={i} style={{transform: `translate(-50%, -50%) rotate(${i * 30}deg) translateY(-125px) rotate(${-i * 30}deg)`}}>{i || 12}</span>)}<i className="hours" style={{transform: `rotate(${now.getHours() * 30 + now.getMinutes() / 2}deg)`}}/><i className="minutes" style={{transform: `rotate(${now.getMinutes() * 6}deg)`}}/><i className="seconds" style={{transform: `rotate(${now.getSeconds() * 6}deg)`}}/></div> : <output className="classroom-time-value">{now.toLocaleTimeString(en ? 'en-GB' : 'ko-KR', {hour12: false})}</output>}<ToolHint>{w('이 기기의 현재 시간입니다.', 'The current time on this device.')}</ToolHint></>}</div>;
}

export function ClassroomDday() {
  const w = useWords(); const [date, setDate] = useClassroomSaved('dday-date', ''); const [title, setTitle] = useClassroomSaved('dday-title', ''); const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);
  const difference = now ? calendarDayDifference(date, now) : null;
  return <div className="classroom-tool"><div className="classroom-display"><p>{title || w('함께 기다리는 날', 'A day to look forward to')}</p><output className="classroom-big">{difference === null ? 'D–?' : difference === 0 ? 'D-DAY' : `D${difference > 0 ? '−' : '+'}${Math.abs(difference)}`}</output></div><ToolField title={w('행사 이름', 'Event name')}><input value={title} maxLength={80} onChange={e => setTitle(e.target.value)}/></ToolField><ToolField title={w('날짜', 'Date')}><input type="date" value={date} onChange={e => setDate(e.target.value)}/></ToolField></div>;
}

export function ClassroomSounds() {
  const w = useWords(); const audio = useClassroomAudio(); const [volume, setVolume] = useClassroomSaved('sounds-volume', .4, (v): v is number => typeof v === 'number' && v >= 0 && v <= 1);
  const [status, setStatus] = useState(''); const sounds = [['bell', '🔔', '마무리 종', 'Finish bell'], ['success', '🌟', '참 잘했어요', 'Well done'], ['start', '🚀', '출발!', 'Let’s start'], ['attention', '👂', '여기 집중', 'Listen up'], ['drum', '🥁', '두근두근', 'Drumroll'], ['sparkle', '✨', '반짝 발견', 'A discovery']] as const;
  return <div className="classroom-tool"><div className="classroom-sound-grid">{sounds.map(([id, icon, ko, en]) => <button type="button" key={id} onClick={() => {void audio.play(id, volume); setStatus(w(ko, en));}}><span aria-hidden="true">{icon}</span><strong>{w(ko, en)}</strong></button>)}</div><ToolField title={w('소리 크기', 'Volume')}><input type="range" min="0" max="1" step="0.05" value={volume} onChange={e => setVolume(Number(e.target.value))}/></ToolField><ToolButton onClick={() => {void audio.stop(); setStatus('');}}>{w('모든 소리 멈추기', 'Stop all sounds')}</ToolButton><p role="status">{status}</p><ToolHint>{w('우리 도구를 위해 만든 짧은 전자음이에요. 기기의 음량도 확인해 주세요.', 'Original synthesized classroom cues. Also check your device volume.')}</ToolHint></div>;
}

export function ClassroomNoise() {
  const w = useWords(); const [level, setLevel] = useState(0); const [active, setActive] = useState(false); const [pending, setPending] = useState(false); const [error, setError] = useState(''); const [threshold, setThreshold] = useClassroomSaved('noise-threshold', 55, (v): v is number => typeof v === 'number' && v >= 10 && v <= 100);
  const stream = useRef<MediaStream | null>(null); const context = useRef<AudioContext | null>(null); const frame = useRef(0); const generation = useRef(0);
  function release() { cancelAnimationFrame(frame.current); stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; void context.current?.close().catch(() => {}); context.current = null; }
  useEffect(() => () => {generation.current++; release();}, []);
  async function start() {
    if (pending || active) return; setPending(true); setError(''); const attempt = ++generation.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}});
      if (attempt !== generation.current) {media.getTracks().forEach(track => track.stop()); return;}
      stream.current = media; const audio = new AudioContext(); context.current = audio; await audio.resume();
      if (attempt !== generation.current) return;
      const analyser = audio.createAnalyser(); analyser.fftSize = 2048; audio.createMediaStreamSource(media).connect(analyser); const samples = new Float32Array(analyser.fftSize);
      const update = () => {analyser.getFloatTimeDomainData(samples); const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length); setLevel(Math.min(100, Math.round(Math.max(0, (20 * Math.log10(Math.max(rms, .00001)) + 65) / 65 * 100)))); frame.current = requestAnimationFrame(update);}; update(); setActive(true);
    } catch {if (attempt === generation.current) {release(); setError(w('마이크를 시작할 수 없어요. 브라우저 권한과 연결을 확인해 주세요.', 'Could not start the microphone. Check browser permission and your device.'));}}
    finally {if (attempt === generation.current) setPending(false);}
  }
  return <div className="classroom-tool classroom-center"><div className={'classroom-noise-orb' + (active && level > threshold ? ' loud' : '')} aria-hidden="true">{active ? level > threshold ? '🤫' : '🌿' : '🎙️'}</div><output className="classroom-big">{active ? level : '—'}<small>/ 100</small></output><meter min="0" max="100" value={level} aria-label={w('상대 소음 크기', 'Relative sound level')}/><p role="status">{active ? level > threshold ? w('목소리를 조금 낮춰 볼까요?', 'Let’s lower our voices a little.') : w('좋은 소리 크기예요', 'A comfortable sound level') : w('시작하면 마이크 사용 권한을 요청해요', 'Starting asks for microphone access')}</p><ToolActions><ToolButton primary disabled={pending} onClick={() => {if (active) {generation.current++; release(); setActive(false); setLevel(0);} else void start();}}>{pending ? w('연결 중…', 'Connecting…') : active ? w('측정 멈추기', 'Stop listening') : w('소음 측정 시작', 'Start listening')}</ToolButton></ToolActions><ToolField title={w('알림 기준', 'Alert threshold')}><input type="range" min="10" max="100" value={threshold} onChange={e => setThreshold(Number(e.target.value))}/></ToolField>{error && <p role="alert">{error}</p>}<ToolHint>{w('마이크의 상대적인 소리 크기입니다. 공인 데시벨 측정값이 아니며 녹음·업로드하지 않습니다.', 'Relative microphone level, not calibrated decibels. Audio is never recorded or uploaded.')}</ToolHint></div>;
}
