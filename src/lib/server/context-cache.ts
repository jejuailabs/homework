// Short-lived, per-instance memo for request contexts. Every API call used to
// re-fetch the Auth user record plus two or three Firestore documents before
// doing any work; at classroom scale that overhead dominates. Entries live for
// a bounded window (default 30 s), so account-state changes made on another
// instance take effect within that window, while changes made on this instance
// take effect immediately through forget(uid).
export type ContextCacheOptions = { ttlMs: number; maxEntries?: number; now?: () => number };
type Entry<T> = { uid: string; value: Promise<T>; expiresAt: number };

export function createContextCache<T>({ ttlMs, maxEntries = 5000, now = Date.now }: ContextCacheOptions) {
  const entries = new Map<string, Entry<T>>();
  const keysByUid = new Map<string, Set<string>>();
  function drop(key: string) {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    const keys = keysByUid.get(entry.uid);
    keys?.delete(key);
    if (keys && !keys.size) keysByUid.delete(entry.uid);
  }
  function evict() {
    for (const [key, entry] of entries) {
      if (entries.size <= maxEntries && entry.expiresAt > now()) break;
      drop(key);
    }
  }
  return {
    get enabled() { return ttlMs > 0; },
    get size() { return entries.size; },
    remember(key: string, uid: string, load: () => Promise<T>): Promise<T> {
      if (ttlMs <= 0) return load();
      const hit = entries.get(key);
      if (hit && hit.expiresAt > now()) return hit.value;
      if (hit) drop(key);
      const value = load();
      const entry: Entry<T> = { uid, value, expiresAt: now() + ttlMs };
      entries.set(key, entry);
      let keys = keysByUid.get(uid);
      if (!keys) keysByUid.set(uid, keys = new Set());
      keys.add(key);
      // Failures are never memoised: the next request re-checks the account.
      value.catch(() => { if (entries.get(key) === entry) drop(key); });
      evict();
      return value;
    },
    forget(uid: string) {
      for (const key of [...(keysByUid.get(uid) ?? [])]) drop(key);
    },
    clear() { entries.clear(); keysByUid.clear(); },
  };
}
