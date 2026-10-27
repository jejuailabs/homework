import test from 'node:test';
import assert from 'node:assert/strict';
import {createContinuousServer} from '../scripts/serve-continuous.mjs';

// Exercise the request handler directly: no listening socket or network calls.
const documents = {html: '<!doctype html><title>local</title>', assets: new Map([
  ['/assets/school.webp', {body: Buffer.from([1, 2, 3]), contentType: 'image/webp'}],
])};
function request(url, options = {}) {
  const server = createContinuousServer(documents);
  const result = {};
  server.emit('request', {url, method: options.method || 'GET', headers: {host: '127.0.0.1:8788', ...options.headers}}, {
    writeHead(status, headers) {result.status = status; result.headers = headers;},
    end(body) {result.body = body;},
  });
  return result;
}

test('continuous server serves only the page and allowlisted image bytes', () => {
  const page = request('/');
  assert.equal(page.status, 200);
  assert.equal(page.body.toString(), documents.html);
  assert.match(page.headers['Content-Security-Policy'], /connect-src 'none'/);
  assert.match(page.headers['Content-Security-Policy'], /img-src 'self' data:/);
  const image = request('/assets/school.webp');
  assert.equal(image.status, 200);
  assert.equal(image.headers['Content-Type'], 'image/webp');
  assert.deepEqual(image.body, Buffer.from([1, 2, 3]));
  for (const path of ['/game', '/assets/manifest.json', '/assets/unknown.png', '/assets/../game.js', '/assets/%2e%2e%2fgame.js']) {
    assert.equal(request(path).status, 404, path);
  }
});

test('continuous server rejects foreign hosts, origins, and write requests', () => {
  assert.equal(request('/', {headers: {host: 'foreign.test:8788'}}).status, 403);
  assert.equal(request('/', {headers: {origin: 'https://foreign.test'}}).status, 403);
  assert.equal(request('/', {headers: {origin: 'null'}}).status, 403);
  assert.equal(request('/', {headers: {origin: 'http://127.0.0.1:8788'}}).status, 200);
  const post = request('/', {method: 'POST'});
  assert.equal(post.status, 405);
  assert.equal(post.headers.Allow, 'GET, HEAD');
});

test('continuous server HEAD advertises length without returning page or image bodies', () => {
  const page = request('/', {method: 'HEAD'});
  assert.equal(page.status, 200);
  assert.equal(page.headers['Content-Length'], Buffer.byteLength(documents.html));
  assert.equal(page.body, undefined);
  const image = request('/assets/school.webp', {method: 'HEAD'});
  assert.equal(image.headers['Content-Length'], 3);
  assert.equal(image.body, undefined);
});
