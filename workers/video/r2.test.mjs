import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {r2Store, r2VideoPath} from './r2.mjs';

const env = {R2_ACCOUNT_ID: 'acct', R2_BUCKET: 'videos', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret'};

test('stays off until all four settings exist', () => {
  assert.equal(r2Store({...env, R2_SECRET_ACCESS_KEY: ''}), null);
  assert.ok(r2Store(env));
});

test('puts, reads back and deletes through signed requests', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'r2-test-')), file = join(dir, 'in.mp4'), out = join(dir, 'out.mp4'), objects = new Map(), seen = [];
  writeFileSync(file, 'video-bytes');
  const fake = async request => {
    const key = new URL(request.url).pathname;
    seen.push({method: request.method, signed: request.headers.get('authorization')?.startsWith('AWS4-HMAC-SHA256') ?? false});
    if (request.method === 'PUT') {objects.set(key, {body: Buffer.from(await request.arrayBuffer()), type: request.headers.get('content-type')}); return new Response(null, {status: 200});}
    const object = objects.get(key);
    if (request.method === 'DELETE') {objects.delete(key); return new Response(null, {status: 204});}
    if (!object) return new Response(null, {status: 404});
    return new Response(request.method === 'HEAD' ? null : object.body, {status: 200, headers: {'content-length': String(object.body.length), 'content-type': object.type}});
  };
  try {
    const store = r2Store(env, fake), path = r2VideoPath('user', 'job');
    assert.equal(await store.head(path), null);
    await store.put(path, file, {contentType: 'video/mp4', cacheControl: 'private,max-age=86400'});
    assert.deepEqual(await store.head(path).then(({size, contentType}) => ({size, contentType})), {size: 11, contentType: 'video/mp4'});
    await store.download(path, out);
    assert.equal(readFileSync(out, 'utf8'), 'video-bytes');
    await store.delete(path);
    await store.delete(path);
    assert.equal(await store.head(path), null);
    assert.ok(seen.every(call => call.signed));
    assert.equal(objects.size, 0);
  } finally {rmSync(dir, {recursive: true, force: true});}
});

test('a failed store call raises instead of passing silently', async () => {
  const store = r2Store(env, async () => new Response(null, {status: 403}));
  await assert.rejects(store.head('r2-videos/a'), /R2_HEAD_403/);
  await assert.rejects(store.delete('r2-videos/a'), /R2_DELETE_403/);
});
