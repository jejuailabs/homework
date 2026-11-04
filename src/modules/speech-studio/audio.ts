/**
 * Voice measures computed in the browser from the recorded samples: when the child was speaking,
 * where they paused, how steady the volume stayed and how much the pitch moved. No audio leaves the
 * device for these numbers, so they work even when AI transcription is switched off.
 */
export const SPEECH_RATE = 16000;
const FRAME_SECONDS = 0.03;
/** A gap this long between words counts as a pause; longer than LONG_PAUSE is a long pause. */
export const PAUSE_SECONDS = 0.35, LONG_PAUSE_SECONDS = 0.8;

export type AudioAnalysis = {
  durationSeconds: number; speakingSeconds: number;
  pauses: number; longPauses: number; pauseList: {start: number; end: number}[];
  /** 0–100: 100 means every phrase was spoken at the same loudness. */
  steadiness: number;
  /** True when the last third was clearly quieter than the first (voice fading away). */
  fades: boolean;
  /** Pitch movement in semitones across voiced speech; under 2 sounds flat. Null when too little voice. */
  pitchRange: number | null; monotone: boolean | null;
  tooQuiet: boolean;
};

const db = (rms: number) => 20 * Math.log10(Math.max(rms, 1e-6));

/** Pitch of one frame by autocorrelation, 75–600 Hz (children speak higher than adults). */
function framePitch(samples: Float32Array, start: number, length: number, rate: number) {
  const minLag = Math.floor(rate / 600), maxLag = Math.min(Math.floor(rate / 75), length - 1);
  let energy = 0;
  for (let i = 0; i < length; i++) energy += samples[start + i] ** 2;
  if (!energy) return null;
  let best = 0, bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < length; i++) sum += samples[start + i] * samples[start + i + lag];
    const score = sum / energy;
    if (score > best) {best = score; bestLag = lag;}
  }
  return best > 0.5 && bestLag ? rate / bestLag : null;
}

export function analyzeAudio(samples: Float32Array, rate = SPEECH_RATE): AudioAnalysis {
  const frame = Math.max(1, Math.round(rate * FRAME_SECONDS)), count = Math.floor(samples.length / frame);
  const durationSeconds = samples.length / rate;
  const levels: number[] = [];
  for (let f = 0; f < count; f++) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += samples[i] ** 2;
    levels.push(db(Math.sqrt(sum / frame)));
  }
  const empty: AudioAnalysis = {durationSeconds, speakingSeconds: 0, pauses: 0, longPauses: 0, pauseList: [], steadiness: 0, fades: false, pitchRange: null, monotone: null, tooQuiet: true};
  if (!count) return empty;
  // Voice is anything well above the room's quiet floor, with an absolute minimum so hiss never counts.
  const sorted = [...levels].sort((a, b) => a - b), floor = sorted[Math.floor(sorted.length * 0.1)], peak = sorted[Math.floor(sorted.length * 0.95)];
  const threshold = Math.max(-50, floor + Math.max(8, (peak - floor) * 0.3));
  const voiced = levels.map(level => level > threshold);
  // Bridge tiny gaps inside a word so syllable breaks are not taken as pauses.
  const bridge = Math.round(0.12 / FRAME_SECONDS);
  for (let f = 0; f < count; f++) if (!voiced[f]) {
    let end = f; while (end < count && !voiced[end]) end++;
    if (f > 0 && end < count && end - f <= bridge) for (let k = f; k < end; k++) voiced[k] = true;
    f = end;
  }
  const first = voiced.indexOf(true), last = voiced.lastIndexOf(true);
  if (first < 0 || peak < -45) return empty;
  const pauseList: AudioAnalysis['pauseList'] = [];
  let speakingFrames = 0;
  for (let f = first; f <= last; f++) {
    if (voiced[f]) {speakingFrames++; continue;}
    let end = f; while (end <= last && !voiced[end]) end++;
    if ((end - f) * FRAME_SECONDS >= PAUSE_SECONDS) pauseList.push({start: round2(f * FRAME_SECONDS), end: round2(end * FRAME_SECONDS)});
    f = end - 1;
  }
  // Loudness of each spoken phrase (pause to pause), compared with each other.
  const phrases: number[] = [];
  let run: number[] = [];
  for (let f = first; f <= last + 1; f++) {
    if (f <= last && voiced[f]) {run.push(levels[f]); continue;}
    if (run.length * FRAME_SECONDS >= 0.25) phrases.push(run.reduce((a, b) => a + b, 0) / run.length);
    run = [];
  }
  const mean = phrases.length ? phrases.reduce((a, b) => a + b, 0) / phrases.length : peak;
  const spread = phrases.length > 1 ? Math.sqrt(phrases.reduce((sum, p) => sum + (p - mean) ** 2, 0) / phrases.length) : 0;
  const third = Math.max(1, Math.floor(phrases.length / 3));
  const head = phrases.slice(0, third), tail = phrases.slice(-third);
  const fades = phrases.length >= 3 && head.reduce((a, b) => a + b, 0) / head.length - tail.reduce((a, b) => a + b, 0) / tail.length > 6;
  // Pitch on a half-rate copy every fourth frame: plenty for a range estimate, fast on a 3-minute take.
  const half = new Float32Array(Math.floor(samples.length / 2));
  for (let i = 0; i < half.length; i++) half[i] = (samples[2 * i] + samples[2 * i + 1]) / 2;
  const pitches: number[] = [], window = Math.round(rate / 2 * 0.04), step = frame / 2;
  for (let f = first; f <= last; f += 4) if (voiced[f] && levels[f] > threshold + 6 && Math.floor(f * step) + window < half.length) {
    const pitch = framePitch(half, Math.floor(f * step), window, rate / 2);
    if (pitch) pitches.push(pitch);
  }
  let pitchRange: number | null = null;
  if (pitches.length >= 12) {
    const semis = pitches.map(p => 12 * Math.log2(p / 100)).sort((a, b) => a - b);
    pitchRange = round1(semis[Math.floor(semis.length * 0.9)] - semis[Math.floor(semis.length * 0.1)]);
  }
  return {
    durationSeconds: round2(durationSeconds), speakingSeconds: round2(speakingFrames * FRAME_SECONDS),
    pauses: pauseList.length, longPauses: pauseList.filter(p => p.end - p.start >= LONG_PAUSE_SECONDS).length, pauseList,
    steadiness: Math.max(0, Math.min(100, Math.round(100 - spread * 8))), fades,
    pitchRange, monotone: pitchRange === null ? null : pitchRange < 2, tooQuiet: mean < -38,
  };
}
const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;
