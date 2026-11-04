/**
 * Reading and speaking measures. Everything here is pure so the teacher tool, the server and a later
 * student page grade the same way. Korean is compared syllable by syllable; spacing never costs a point.
 */
export const REFERENCE_MAX_SYLLABLES = 1500;
const DIGITS = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const UNITS = ['', '십', '백', '천'];

/** Sino-Korean reading of a whole number, so "3마리" and "삼 마리" compare equal. Large numbers stay digit by digit. */
function readNumber(digits: string) {
  const value = digits.replace(/^0+(?=\d)/, '');
  if (value.length > 4) return [...value].map(d => DIGITS[+d]).join('');
  if (value === '0') return '영';
  return [...value].map((d, i) => {
    const unit = UNITS[value.length - 1 - i];
    if (d === '0') return '';
    return (d === '1' && unit ? '' : DIGITS[+d]) + unit;
  }).join('');
}

/** Letters only: numbers read aloud, punctuation and spacing removed, Latin lowercased. */
export function normalizeSpeech(text: string) {
  return text.normalize('NFC').replace(/\d+/g, readNumber).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}
const syllables = (text: string) => [...normalizeSpeech(text)];

export type WordStatus = 'ok' | 'changed' | 'missed';
export type ReadingWord = {text: string; status: WordStatus; heard: string};
export type ReadingResult = {
  accuracy: number; correct: number; total: number;
  words: ReadingWord[];
  /** Extra speech that matches no reference word, placed after reference word `after` (-1 = before the first). */
  inserted: {after: number; text: string}[];
  /** Reference words read twice in a row; shown, never counted against the reader. */
  repeats: number;
  counts: {missed: number; changed: number; inserted: number};
};

/**
 * Aligns what was heard against the reference text. A reference word is "ok" when all its syllables
 * were heard, "missed" when none were, otherwise "changed" with what was heard in its place.
 */
export function alignReading(reference: string, heard: string): ReadingResult {
  const words = reference.split(/\s+/).filter(word => normalizeSpeech(word));
  const owner: number[] = [], ref: string[] = [];
  words.forEach((word, index) => syllables(word).forEach(s => {ref.push(s); owner.push(index);}));
  if (ref.length > REFERENCE_MAX_SYLLABLES) throw new Error('REFERENCE_TOO_LONG');
  const said = syllables(heard).slice(0, REFERENCE_MAX_SYLLABLES * 2);
  const n = ref.length, m = said.length, width = m + 1;
  const cost = new Uint16Array((n + 1) * width);
  for (let j = 0; j <= m; j++) cost[j] = j;
  for (let i = 1; i <= n; i++) {
    cost[i * width] = i;
    for (let j = 1; j <= m; j++) {
      const diagonal = cost[(i - 1) * width + j - 1] + (ref[i - 1] === said[j - 1] ? 0 : 1);
      cost[i * width + j] = Math.min(diagonal, cost[(i - 1) * width + j] + 1, cost[i * width + j - 1] + 1);
    }
  }
  // Walk back: each reference syllable is matched, substituted or deleted; leftover heard syllables are inserted.
  const match = Array<number>(n).fill(-1), same = Array<boolean>(n).fill(false), extra: {at: number; s: string}[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const here = cost[i * width + j];
    if (i > 0 && j > 0 && here === cost[(i - 1) * width + j - 1] + (ref[i - 1] === said[j - 1] ? 0 : 1)) {
      match[i - 1] = j - 1; same[i - 1] = ref[i - 1] === said[j - 1]; i--; j--;
    } else if (i > 0 && here === cost[(i - 1) * width + j] + 1) i--;
    else {extra.push({at: i - 1, s: said[j - 1]}); j--;}
  }
  const result: ReadingWord[] = words.map(text => ({text, status: 'ok', heard: ''}));
  let correct = 0;
  words.forEach((_, index) => {
    const own = ref.map((_, k) => k).filter(k => owner[k] === index);
    const hits = own.filter(k => same[k]).length;
    correct += hits;
    const heardHere = own.map(k => match[k] >= 0 ? said[match[k]] : '').join('');
    result[index] = {text: words[index], status: hits === own.length ? 'ok' : own.every(k => match[k] < 0) ? 'missed' : 'changed', heard: heardHere};
  });
  // Group inserted syllables by the reference word they follow.
  const grouped = new Map<number, string>();
  for (const {at, s} of extra.reverse()) {
    const after = at < 0 ? -1 : owner[at];
    grouped.set(after, (grouped.get(after) ?? '') + s);
  }
  let repeats = 0;
  const inserted: ReadingResult['inserted'] = [];
  for (const [after, text] of grouped) {
    // "고래가 고래가": the insertion repeats the word just read (or the one about to be read).
    const around = [words[after], words[after + 1]].filter(Boolean).map(normalizeSpeech);
    if (around.some(word => word && (text === word || text === word.repeat(2)))) {repeats++; continue;}
    inserted.push({after, text});
  }
  inserted.sort((a, b) => a.after - b.after);
  return {
    accuracy: n ? Math.round(correct / n * 1000) / 10 : 0, correct, total: n, words: result, inserted, repeats,
    counts: {missed: result.filter(w => w.status === 'missed').length, changed: result.filter(w => w.status === 'changed').length, inserted: inserted.length},
  };
}

/** Hesitation sounds counted only as whole words, so "어머니" or "음악" never count. */
const FILLERS = new Set(['음', '음음', '으음', '어', '어어', '으', '에', '아', '저기', '그니까', '그러니까', '막', '뭐지', '뭐더라']);
export function countFillers(transcript: string) {
  return transcript.split(/[\s,.!?…~]+/).filter(token => FILLERS.has(token)).length;
}
export const syllableCount = (text: string) => syllables(text).length;
export function sentences(text: string) {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?。…])\s+|\n+/).map(s => s.trim()).filter(s => normalizeSpeech(s));
}

export type SpeechMetrics = {
  syllables: number; speakingSeconds: number; durationSeconds: number;
  /** Syllables per minute of speaking time (pauses excluded). */
  rate: number; fillers: number; pauses: number; longPauses: number; sentenceWords: number;
  /** Correct syllables per minute of the whole recording; reading only. */
  cspm?: number;
};
export function speechMetrics(transcript: string, audio: {durationSeconds: number; speakingSeconds: number; pauses: number; longPauses: number}, reading?: ReadingResult): SpeechMetrics {
  const count = syllableCount(transcript), list = sentences(transcript);
  const speaking = audio.speakingSeconds > 0.5 ? audio.speakingSeconds : audio.durationSeconds;
  const words = list.reduce((sum, s) => sum + s.split(' ').length, 0);
  return {
    syllables: count, speakingSeconds: round1(speaking), durationSeconds: round1(audio.durationSeconds),
    rate: speaking > 0 ? Math.round(count / speaking * 60) : 0,
    fillers: countFillers(transcript), pauses: audio.pauses, longPauses: audio.longPauses,
    sentenceWords: list.length ? round1(words / list.length) : 0,
    ...(reading && audio.durationSeconds > 0 ? {cspm: Math.round(reading.correct / audio.durationSeconds * 60)} : {}),
  };
}
const round1 = (value: number) => Math.round(value * 10) / 10;

/** Plain-language pace band for children; numbers alone mean little to them. */
export function paceBand(rate: number): 'slow' | 'steady' | 'fast' {
  return rate < 160 ? 'slow' : rate > 330 ? 'fast' : 'steady';
}

/**
 * Book difficulty 1–6 from sentence length and word length. A starting point the teacher can change,
 * not a validated readability formula.
 */
export function estimateLevel(text: string) {
  const list = sentences(text);
  if (!list.length) return 1;
  const words = list.flatMap(s => s.split(' ').filter(Boolean));
  const perSentence = words.length / list.length, perWord = words.reduce((sum, w) => sum + syllableCount(w), 0) / Math.max(1, words.length);
  const longWords = words.filter(w => syllableCount(w) >= 5).length / Math.max(1, words.length);
  const score = perSentence * 0.45 + perWord * 0.9 + longWords * 6;
  return Math.max(1, Math.min(6, Math.round(score - 2.4)));
}

export type ReadingRecord = {accuracy?: number; cspm?: number; level?: number; createdAt: string; counts?: {missed: number; changed: number; inserted: number}};
export type ReadingProfile = {
  sessions: number; recentAccuracy: number | null; trend: 'up' | 'down' | 'flat' | null;
  /** Level the next book should be at, from the level actually read and how well it went. */
  nextLevel: number | null; advice: 'up' | 'stay' | 'down' | null;
  commonError: 'missed' | 'changed' | 'inserted' | null; needsHelp: boolean;
};
/**
 * Five most recent readings decide the next step: 95%+ moves up a level, under 90% steps back,
 * anything between stays. Three falls in a row flag the reader for the teacher.
 */
export function readingProfile(records: ReadingRecord[]): ReadingProfile {
  const readings = records.filter(r => typeof r.accuracy === 'number').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!readings.length) return {sessions: 0, recentAccuracy: null, trend: null, nextLevel: null, advice: null, commonError: null, needsHelp: false};
  const recent = readings.slice(0, 5), mean = recent.reduce((sum, r) => sum + r.accuracy!, 0) / recent.length;
  const half = Math.ceil(recent.length / 2), newer = recent.slice(0, half), older = recent.slice(half);
  const avg = (list: ReadingRecord[]) => list.reduce((sum, r) => sum + r.accuracy!, 0) / list.length;
  const trend = older.length ? (avg(newer) - avg(older) >= 3 ? 'up' : avg(older) - avg(newer) >= 3 ? 'down' : 'flat') : null;
  const advice = mean >= 95 ? 'up' : mean < 90 ? 'down' : 'stay';
  const level = recent.find(r => r.level)?.level ?? null;
  const totals = {missed: 0, changed: 0, inserted: 0};
  for (const r of recent) if (r.counts) for (const key of ['missed', 'changed', 'inserted'] as const) totals[key] += r.counts[key] || 0;
  const top = (Object.entries(totals) as [keyof typeof totals, number][]).sort((a, b) => b[1] - a[1])[0];
  const falling = readings.length >= 4 && readings.slice(0, 4).every((r, i, list) => i === 3 || r.accuracy! < list[i + 1].accuracy!);
  return {
    sessions: readings.length, recentAccuracy: Math.round(mean * 10) / 10, trend,
    nextLevel: level ? Math.max(1, Math.min(6, level + (advice === 'up' ? 1 : advice === 'down' ? -1 : 0))) : null,
    advice, commonError: top[1] ? top[0] : null, needsHelp: falling || mean < 80,
  };
}
