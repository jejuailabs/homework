/** Device-only beta progress. No student records or database writes. */
export const REGION_QUEST_STORAGE_LIMIT = 4 * 1024;
const STATE_KEYS = ['v', 'phase', 'position', 'facing', 'resume', 'travelMode'] as const;
const phases = new Set(['meet', 'bend', 'coast', 'done']);
const facings = new Set(['down', 'left', 'right', 'up']);
type Point = {x: number; y: number};
export type RegionQuestState = {
  v: 1;
  phase: 'meet' | 'bend' | 'coast' | 'done';
  position: Point;
  facing: 'down' | 'left' | 'right' | 'up';
  resume: Point | null;
  travelMode: 'walk' | 'car';
};
export type RegionQuestStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type RegionQuestStorageResult = {state: RegionQuestState | null; available: boolean};
export type RegionQuestFrameMessage =
  | {type: 'region-quest-load'; requestId: number}
  | {type: 'region-quest-save'; requestId: number; state: RegionQuestState}
  | {type: 'region-quest-close'};

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'));
}
function position(value: unknown): value is Point {
  return record(value) && exactKeys(value, ['x', 'y'])
    && [value.x, value.y].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 10000);
}

/** Reject unknown/prototype fields and copy only the narrow game-state schema. */
export function validateRegionQuestState(value: unknown): RegionQuestState | null {
  try {
    if (!record(value) || !exactKeys(value, STATE_KEYS) || value.v !== 1
      || typeof value.phase !== 'string' || !phases.has(value.phase)
      || typeof value.facing !== 'string' || !facings.has(value.facing)
      || !position(value.position) || (value.resume !== null && !position(value.resume))
      || (value.travelMode !== 'walk' && value.travelMode !== 'car')) return null;
    const serialized = JSON.stringify(value);
    if (new TextEncoder().encode(serialized).byteLength > REGION_QUEST_STORAGE_LIMIT) return null;
    return {
      v: 1, phase: value.phase as RegionQuestState['phase'],
      position: {x: value.position.x, y: value.position.y},
      facing: value.facing as RegionQuestState['facing'],
      resume: value.resume === null ? null : {x: value.resume.x, y: value.resume.y},
      travelMode: value.travelMode,
    };
  } catch {return null;}
}
export function regionQuestStorageKey(uid: string): string | null {
  return typeof uid === 'string' && uid.length > 0 && uid.length <= 128
    ? 'region-quest-beta-aewol-v1:' + uid : null;
}
/** A loaded snapshot owns only its UID key; stale tabs cannot replace newer progress. */
export function createRegionQuestStorageSession(storage: RegionQuestStorage, uid: string) {
  const key = regionQuestStorageKey(uid);
  let loaded: RegionQuestStorageResult | null = null;
  let expected: string | null | undefined;
  let conflicted = false;
  return {
    load(): RegionQuestStorageResult {
      if (loaded) return loaded;
      loaded = {state: null, available: false};
      if (!key) return loaded;
      try {expected = storage.getItem(key);} catch {return loaded;}
      if (expected !== null && expected.length <= REGION_QUEST_STORAGE_LIMIT) {
        try {loaded.state = validateRegionQuestState(JSON.parse(expected));} catch {/* Ignore corrupt records. */}
      }
      try {
        const probe = key + ':write-probe';
        storage.setItem(probe, '1');
        storage.removeItem(probe);
        loaded.available = true;
      } catch {/* Readable records can still be restored from read-only storage. */}
      return loaded;
    },
    save(value: unknown): boolean {
      if (!key || !loaded || expected === undefined || conflicted) return false;
      const state = validateRegionQuestState(value);
      if (!state) return false;
      try {
        if (storage.getItem(key) !== expected) {conflicted = true; return false;}
        const serialized = JSON.stringify(state);
        storage.setItem(key, serialized);
        expected = serialized;
        return true;
      } catch {return false;}
    },
  };
}
type FrameEvent = Pick<MessageEvent, 'source' | 'origin' | 'data'>;
/** Only the current opaque sandbox may request this account's beta progress. */
export function isRegionQuestFrameMessage(event: FrameEvent, target: Window | null): event is FrameEvent & {data: RegionQuestFrameMessage} {
  if (target === null || event.source !== target || event.origin !== 'null' || !record(event.data)) return false;
  const data = event.data;
  if (data.type === 'region-quest-close') return exactKeys(data, ['type']);
  if (!Number.isSafeInteger(data.requestId) || (data.requestId as number) < 1 || (data.requestId as number) > 1_000_000_000) return false;
  if (data.type === 'region-quest-load') return exactKeys(data, ['type', 'requestId']);
  return data.type === 'region-quest-save' && exactKeys(data, ['type', 'requestId', 'state'])
    && validateRegionQuestState(data.state) !== null;
}
