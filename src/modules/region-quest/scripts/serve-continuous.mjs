import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname, extname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const continuousRoot = join(moduleRoot, 'continuous');
const mimeTypes = {'.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'};
const csp = [
  "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'", "img-src 'self' data:",
  "connect-src 'none'", "base-uri 'none'", "form-action 'none'", "object-src 'none'", "frame-ancestors 'none'",
].join('; ');
const commonHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': csp,
};

function inlineScript(source) {return source.replace(/<\/script/gi, '<\\/script');}
function inlineJSON(value) {return JSON.stringify(value).replace(/</g, '\\u003c');}
function replaceToken(source, token, value) {
  if (!source.includes(token)) throw new Error(`continuous/game.html에 ${token} 자리표시자가 없습니다.`);
  return source.replaceAll(token, () => value);
}

async function loadAssets() {
  const manifest = JSON.parse(await readFile(join(continuousRoot, 'assets/manifest.json'), 'utf8'));
  if (!manifest || !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) {
    throw new Error('continuous/assets/manifest.json에 files 객체가 필요합니다.');
  }
  const urls = Object.create(null), assets = new Map();
  async function include(key, name, root) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) || !mimeTypes[extname(name).toLowerCase()]) {
      throw new Error(`허용되지 않는 에셋 이름: ${key}`);
    }
    const url = `/assets/${name}`;
    if (assets.has(url)) {urls[key] = url; return;}
    const body = await readFile(join(root, name));
    if (body.length > 20 * 1024 * 1024) throw new Error(`에셋 ${key}가 20MB를 넘습니다.`);
    assets.set(url, {body, contentType: mimeTypes[extname(name).toLowerCase()]});
    urls[key] = url;
  }
  for (const [key, name] of Object.entries(manifest.files)) {
    if (typeof name !== 'string' || ['player', 'guide'].includes(key) || ['player.png', 'guide.png'].includes(name.toLowerCase())) {
      throw new Error(`에셋 ${key}는 예약된 캐릭터 이름이거나 올바른 파일 이름이 아닙니다.`);
    }
    await include(key, name, join(continuousRoot, 'assets'));
  }
  await include('player', 'player.png', join(moduleRoot, 'prototype/assets'));
  await include('guide', 'guide.png', join(moduleRoot, 'prototype/assets'));
  return {urls, assets};
}

export async function buildContinuousDocuments() {
  const [template, css, motion, world, game, dataJSON, bundle] = await Promise.all([
    readFile(join(continuousRoot, 'game.html'), 'utf8'),
    readFile(join(continuousRoot, 'game.css'), 'utf8'),
    readFile(join(continuousRoot, 'motion.js'), 'utf8'),
    readFile(join(continuousRoot, 'world.js'), 'utf8'),
    readFile(join(continuousRoot, 'game.js'), 'utf8'),
    readFile(join(continuousRoot, 'data/aewol.json'), 'utf8'),
    loadAssets(),
  ]);
  const values = {
    __STYLE__: css.replace(/<\/style/gi, '<\\/style'),
    __MOTION__: inlineScript(motion),
    __WORLD__: inlineScript(world),
    __GAME__: inlineScript(game),
    __DATA__: inlineJSON(JSON.parse(dataJSON)),
    __ASSETS__: inlineJSON(bundle.urls),
  };
  let html = template;
  for (const [token, value] of Object.entries(values)) html = replaceToken(html, token, value);
  return {html, assets: bundle.assets};
}

export function createContinuousServer(documents, port = 8788) {
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  return createServer((request, response) => {
    function send(status, body = '', contentType = 'text/plain; charset=utf-8', extraHeaders = {}) {
      const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
      response.writeHead(status, {...commonHeaders, 'Content-Type': contentType, 'Content-Length': bytes.length, ...extraHeaders});
      response.end(request.method === 'HEAD' ? undefined : bytes);
    }
    const host = request.headers.host;
    if (!allowedHosts.has(host)) {send(403, '로컬 주소에서만 열 수 있습니다.'); return;}
    if (request.headers.origin && request.headers.origin !== `http://${host}`) {send(403, '허용되지 않은 요청입니다.'); return;}
    if (!['GET', 'HEAD'].includes(request.method)) {send(405, '', undefined, {Allow: 'GET, HEAD'}); return;}
    let path;
    try {path = new URL(request.url, `http://${host}`).pathname;}
    catch {send(400, '올바르지 않은 주소입니다.'); return;}
    if (path === '/') {send(200, documents.html, 'text/html; charset=utf-8'); return;}
    if (path === '/favicon.ico') {send(204); return;}
    // Exact in-memory allowlist only: no arbitrary directory/file serving.
    const asset = documents.assets.get(path);
    if (asset) {send(200, asset.body, asset.contentType); return;}
    send(404, '찾을 수 없는 페이지입니다.');
  });
}

async function main() {
  const rawPort = process.env.REGION_QUEST_CONTINUOUS_PORT || '8788';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('REGION_QUEST_CONTINUOUS_PORT는 1024~65535 정수여야 합니다.');
  }
  const documents = await buildContinuousDocuments();
  const server = createContinuousServer(documents, port);
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `포트 ${port}를 이미 사용 중입니다. REGION_QUEST_CONTINUOUS_PORT로 다른 포트를 지정해 주세요.` : error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`애월 길 따라 걷기: http://127.0.0.1:${port}`);
    console.log('로컬 전용 · 외부 API/DB 연결 없음 · 종료: Ctrl+C');
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(`연속 지도 테스트를 시작하지 못했습니다: ${error.message}`);
    console.error('continuous 게임 파일, data/aewol.json, assets/manifest.json과 이미지를 확인해 주세요.');
    process.exitCode = 1;
  });
}
