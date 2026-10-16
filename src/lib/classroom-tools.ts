/** Classroom algorithms are independent of rendering and never use AI for a draw. */
export function randomInteger(max: number): number {
  if (!Number.isSafeInteger(max) || max < 1 || max > 0x100000000) throw new Error('Invalid random range');
  const limit = Math.floor(0x100000000 / max) * max;
  const word = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(word); } while (word[0] >= limit);
  return word[0] % max;
}

export function shuffle<T>(items: readonly T[], random = randomInteger): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function parseParticipants(text: string): string[] {
  return text.split(/\r?\n/).map(line => line.trim().slice(0, 80)).filter(Boolean).slice(0, 100);
}

export function makeGroups<T>(items: readonly T[], count: number, random = randomInteger): T[][] {
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('Invalid group count');
  const groups: T[][] = Array.from({length: Math.min(count, items.length)}, () => []);
  shuffle(items, random).forEach((item, index) => groups[index % groups.length].push(item));
  return groups;
}

export type Ladder = {columns: number; bars: number[]};
export function makeLadder(columns: number, rows = 16, random = randomInteger): Ladder {
  if (!Number.isInteger(columns) || columns < 2 || columns > 30 || !Number.isInteger(rows) || rows < 1 || rows > 200) throw new Error('Invalid ladder');
  // One adjacent swap on each row: no overlapping horizontal rungs, and a bijection by construction.
  return {columns, bars: Array.from({length: rows}, () => random(columns - 1))};
}
export function ladderDestination(ladder: Ladder, start: number): number {
  if (!Number.isInteger(start) || start < 0 || start >= ladder.columns) throw new Error('Invalid start');
  return ladder.bars.reduce((column, bar) => column === bar ? column + 1 : column === bar + 1 ? column - 1 : column, start);
}
export function ladderPath(ladder: Ladder, start: number): Array<[number, number]> {
  const points: Array<[number, number]> = [[start, 0]];
  let column = start;
  ladder.bars.forEach((bar, row) => {
    points.push([column, row + 1]);
    if (column === bar) column++; else if (column === bar + 1) column--;
    points.push([column, row + 1]);
  });
  points.push([column, ladder.bars.length + 1]);
  return points;
}

export function bracketSlots<T>(items: readonly T[], random = randomInteger): Array<T | null> {
  if (items.length < 2 || items.length > 64) throw new Error('A bracket needs 2–64 participants');
  const entrants = shuffle(items, random);
  const size = 2 ** Math.ceil(Math.log2(entrants.length));
  const half = size / 2;
  return Array.from({length: half}, (_, i) => [entrants[i], entrants[i + half] ?? null]).flat();
}

export function countdownRemaining(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor(safe % 3600 / 60);
  return (hours ? `${hours}:` : '') + `${minutes}`.padStart(2, '0') + ':' + `${safe % 60}`.padStart(2, '0');
}
export function calendarDayDifference(target: string, today: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return null;
  const [year, month, day] = target.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return Math.round((parsed.getTime() - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
}
export function safeVideoUrl(value: string): {kind: 'youtube' | 'file'; url: string} | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const host = url.hostname.toLowerCase();
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
      const id = host === 'youtu.be' ? url.pathname.slice(1) : url.pathname.startsWith('/shorts/') ? url.pathname.split('/')[2] : url.searchParams.get('v');
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? {kind: 'youtube', url: `https://www.youtube-nocookie.com/embed/${id}`} : null;
    }
    if (/\.(mp4|webm|ogv)$/i.test(url.pathname)) return {kind: 'file', url: url.href};
  } catch { /* Invalid URL is shown as a field error by the caller. */ }
  return null;
}
