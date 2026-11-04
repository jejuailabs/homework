import assert from 'node:assert/strict';
import test from 'node:test';
import { createContextCache } from './context-cache';

function clock(start = 1_000) {
  let current = start;
  return { now: () => current, tick: (ms: number) => { current += ms; } };
}

test('a cached context is reused within the window and reloaded after it', async () => {
  const time = clock();
  const cache = createContextCache<string>({ ttlMs: 30_000, now: time.now });
  let loads = 0;
  const load = async () => `ctx-${++loads}`;
  assert.equal(await cache.remember('u1|0|9', 'u1', load), 'ctx-1');
  time.tick(29_999);
  assert.equal(await cache.remember('u1|0|9', 'u1', load), 'ctx-1');
  time.tick(1);
  assert.equal(await cache.remember('u1|0|9', 'u1', load), 'ctx-2');
  assert.equal(loads, 2);
});

test('concurrent requests for the same session share one load', async () => {
  const cache = createContextCache<number>({ ttlMs: 30_000 });
  let loads = 0;
  const load = () => new Promise<number>(resolve => setTimeout(() => resolve(++loads), 5));
  const results = await Promise.all([cache.remember('k', 'u', load), cache.remember('k', 'u', load), cache.remember('k', 'u', load)]);
  assert.deepEqual(results, [1, 1, 1]);
});

test('different sessions of one account are cached apart and forgotten together', async () => {
  const cache = createContextCache<string>({ ttlMs: 30_000 });
  let loads = 0;
  const load = async () => `v${++loads}`;
  assert.equal(await cache.remember('u1|0|1', 'u1', load), 'v1');
  assert.equal(await cache.remember('u1|1|2', 'u1', load), 'v2');
  assert.equal(await cache.remember('u2|0|3', 'u2', load), 'v3');
  assert.equal(cache.size, 3);
  cache.forget('u1');
  assert.equal(cache.size, 1);
  assert.equal(await cache.remember('u1|0|1', 'u1', load), 'v4');
  assert.equal(await cache.remember('u2|0|3', 'u2', load), 'v3');
});

test('a failed load is not memoised', async () => {
  const cache = createContextCache<string>({ ttlMs: 30_000 });
  let attempts = 0;
  const load = async () => { if (++attempts === 1) throw new Error('disabled'); return 'ok'; };
  await assert.rejects(cache.remember('k', 'u', load), /disabled/);
  assert.equal(cache.size, 0);
  assert.equal(await cache.remember('k', 'u', load), 'ok');
});

test('a zero window disables memoisation entirely', async () => {
  const cache = createContextCache<number>({ ttlMs: 0 });
  let loads = 0;
  const load = async () => ++loads;
  assert.equal(await cache.remember('k', 'u', load), 1);
  assert.equal(await cache.remember('k', 'u', load), 2);
  assert.equal(cache.enabled, false);
  assert.equal(cache.size, 0);
});

test('the oldest entries are evicted once the cache is full', async () => {
  const cache = createContextCache<number>({ ttlMs: 30_000, maxEntries: 2 });
  await cache.remember('a', 'a', async () => 1);
  await cache.remember('b', 'b', async () => 2);
  await cache.remember('c', 'c', async () => 3);
  assert.equal(cache.size, 2);
  let reloaded = 0;
  assert.equal(await cache.remember('a', 'a', async () => ++reloaded), 1);
  assert.equal(await cache.remember('c', 'c', async () => 99), 3);
});
