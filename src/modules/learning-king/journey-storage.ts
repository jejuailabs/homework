/** Browser-only practice records. No student records or server writes are involved. */
export const JOURNEY_STORAGE_LIMIT = 400 * 1024;
const MAX_COUNTER = 1_000_000_000;
const STATE_KEYS = new Set(['version', 'grade', 'level', 'nextSequence', 'totalAnswered', 'totalCorrect', 'completedLegs', 'bank', 'recent', 'active']);
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue};
type JsonRecord = {[key: string]: JsonValue};

export type JourneyState = {
  version: 1;
  grade: number;
  level: 'gentle' | 'standard';
  nextSequence: number;
  totalAnswered: number;
  totalCorrect: number;
  completedLegs: number;
  bank: JsonRecord[];
  recent: JsonRecord[];
  active: JsonRecord | null;
};

export type JourneyStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type JourneyStorageResult = {state: JourneyState | null; available: boolean};

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNTER;
}

/** Constrain untrusted postMessage / stored values before serializing or using them. */
export function validateJourneyState(value: unknown): JourneyState | null {
  if (!isRecord(value) || Object.keys(value).length !== STATE_KEYS.size || Object.keys(value).some(key => !STATE_KEYS.has(key))) return null;
  if (value.version !== 1 || !isCounter(value.grade) || value.grade < 1 || value.grade > 6 || (value.level !== 'gentle' && value.level !== 'standard')) return null;
  if (!isCounter(value.nextSequence) || !isCounter(value.totalAnswered) || !isCounter(value.totalCorrect) || value.totalCorrect > value.totalAnswered || !isCounter(value.completedLegs)) return null;
  if (!Array.isArray(value.bank) || value.bank.length > 300 || !value.bank.every(isRecord) || !Array.isArray(value.recent) || value.recent.length > 100 || !value.recent.every(isRecord)) return null;
  if (value.active !== null && !isRecord(value.active)) return null;

  let remainingNodes = 30_000;
  const ancestors = new Set<unknown>();
  function boundedJson(item: unknown, depth: number): boolean {
    if (--remainingNodes < 0 || depth > 10) return false;
    if (item === null || typeof item === 'boolean') return true;
    if (typeof item === 'string') return item.length <= 4_000;
    if (typeof item === 'number') return Number.isFinite(item) && Math.abs(item) <= Number.MAX_SAFE_INTEGER;
    if (typeof item !== 'object' || ancestors.has(item)) return false;
    if (!Array.isArray(item) && !isRecord(item)) return false;
    ancestors.add(item);
    const valid = Array.isArray(item)
      ? item.length <= 300 && Array.from(item).every(entry => boundedJson(entry, depth + 1))
      : Object.keys(item).length <= 64 && Object.entries(item).every(([key, entry]) => key.length <= 64 && !UNSAFE_KEYS.has(key) && boundedJson(entry, depth + 1));
    ancestors.delete(item);
    return valid;
  }
  if (!boundedJson(value, 0)) return null;
  try {
    const serialized = JSON.stringify(value);
    if (new TextEncoder().encode(serialized).byteLength > JOURNEY_STORAGE_LIMIT) return null;
    return JSON.parse(serialized) as JourneyState;
  } catch {
    return null;
  }
}

export function journeyStorageKey(uid: string): string | null {
  return typeof uid === 'string' && uid.length > 0 && uid.length <= 128
    ? `learning-king-journey-v1:${uid}`
    : null;
}

function readJourneySnapshot(storage: JourneyStorage, uid: string): JourneyStorageResult & {raw: string | null | undefined} {
  const key = journeyStorageKey(uid);
  if (!key) return {state: null, available: false, raw: undefined};
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return {state: null, available: false, raw: undefined};
  }

  // Restore readable records even if the browser has run out of space for new writes.
  let state: JourneyState | null = null;
  if (raw !== null && raw.length <= JOURNEY_STORAGE_LIMIT) {
    try {state = validateJourneyState(JSON.parse(raw));} catch {/* Ignore malformed records. */}
  }
  try {
    // Write availability is separate from whether previously saved records can be read.
    const probe = `learning-king-journey-probe-v1:${uid}`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return {state, available: true, raw};
  } catch {
    return {state, available: false, raw};
  }
}

export function readJourneyState(storage: JourneyStorage, uid: string): JourneyStorageResult {
  const {state, available} = readJourneySnapshot(storage, uid);
  return {state, available};
}

export function writeJourneyState(storage: JourneyStorage, uid: string, value: unknown): boolean {
  const key = journeyStorageKey(uid);
  const state = validateJourneyState(value);
  if (!key || !state) return false;
  try {
    storage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** Refuse a stale tab's full-state save after another tab changes the same account's record. */
export function createJourneyStorageSession(storage: JourneyStorage, uid: string) {
  const key = journeyStorageKey(uid);
  let loaded: JourneyStorageResult | null = null;
  let expectedRaw: string | null | undefined;
  let conflicted = false;
  return {
    load(): JourneyStorageResult {
      if (!loaded) {
        const snapshot = readJourneySnapshot(storage, uid);
        expectedRaw = snapshot.raw;
        loaded = {state: snapshot.state, available: snapshot.available};
      }
      return loaded;
    },
    save(value: unknown): boolean {
      if (!key || !loaded || expectedRaw === undefined || conflicted) return false;
      const state = validateJourneyState(value);
      if (!state) return false;
      try {
        if (storage.getItem(key) !== expectedRaw) {
          conflicted = true;
          return false;
        }
        const serialized = JSON.stringify(state);
        storage.setItem(key, serialized);
        expectedRaw = serialized;
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Opaque srcDoc frames have the literal origin "null". They never receive storage access. */
export function isJourneyFrameMessage(event: Pick<MessageEvent, 'source' | 'origin' | 'data'>, target: Window | null): boolean {
  return target !== null && event.source === target && event.origin === 'null' && isRecord(event.data) && typeof event.data.type === 'string';
}
