import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {basename, dirname, extname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const prototypeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../prototype');
const mimeTypes = {'.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'};
const commonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'text/html; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function inlineScript(source) {
  return source.replace(/<\/script/gi, '<\\/script');
}

function replaceToken(source, token, value) {
  if (!source.includes(token)) throw new Error(`game.html에 ${token} 자리표시자가 없습니다.`);
  return source.replaceAll(token, () => value);
}

async function loadAssets() {
  const manifest = JSON.parse(await readFile(join(prototypeRoot, 'assets/manifest.json'), 'utf8'));
  if (!manifest || typeof manifest !== 'object' || !manifest.background || !manifest.player) {
    throw new Error('에셋 manifest에 background와 player가 필요합니다.');
  }
  const assets = {sprites: manifest.sprites};
  for (const key of ['background', 'player', 'npc']) {
    if (manifest[key] === undefined) continue;
    const name = manifest[key];
    if (typeof name !== 'string' || basename(name) !== name || name.includes('\\') || !mimeTypes[extname(name).toLowerCase()]) {
      throw new Error(`에셋 ${key}에는 이미지 파일 이름만 지정할 수 있습니다.`);
    }
    const image = await readFile(join(prototypeRoot, 'assets', name));
    if (image.length > 20 * 1024 * 1024) throw new Error(`에셋 ${key}가 20MB를 넘습니다.`);
    assets[key] = `data:${mimeTypes[extname(name).toLowerCase()]};base64,${image.toString('base64')}`;
  }
  if (!assets.sprites || !['frameWidth', 'frameHeight', 'columns', 'rows'].every(key => Number.isInteger(assets.sprites[key]) && assets.sprites[key] > 0 && assets.sprites[key] <= 4096)) {
    throw new Error('sprites에는 양의 정수 frameWidth/frameHeight/columns/rows가 필요합니다.');
  }
  return assets;
}

export async function buildPrototypeDocuments() {
  const [host, template, css, model, game, assets] = await Promise.all([
    readFile(join(prototypeRoot, 'host.html'), 'utf8'),
    readFile(join(prototypeRoot, 'game.html'), 'utf8'),
    readFile(join(prototypeRoot, 'game.css'), 'utf8'),
    readFile(join(prototypeRoot, 'model.js'), 'utf8'),
    readFile(join(prototypeRoot, 'game.js'), 'utf8'),
    loadAssets(),
  ]);
  let document = replaceToken(template, '__STYLE__', css.replace(/<\/style/gi, '<\\/style'));
  document = replaceToken(document, '__MODEL__', inlineScript(model));
  document = replaceToken(document, '__GAME__', inlineScript(game));
  document = replaceToken(document, '__ASSETS__', JSON.stringify(assets).replace(/</g, '\\u003c'));
  return {host, game: document};
}

export function createPrototypeServer(documents, port = 8787) {
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  return createServer((request, response) => {
    const host = request.headers.host;
    if (!allowedHosts.has(host)) {
      response.writeHead(403, {...commonHeaders, 'Content-Type': 'text/plain; charset=utf-8'});
      response.end('로컬 주소에서만 열 수 있습니다.');
      return;
    }
    const origin = request.headers.origin;
    if (origin && origin !== 'null' && origin !== `http://${host}`) {
      response.writeHead(403, commonHeaders);
      response.end('허용되지 않은 요청입니다.');
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, {...commonHeaders, Allow: 'GET, HEAD'});
      response.end();
      return;
    }
    const path = new URL(request.url, `http://${host}`).pathname;
    if (path === '/favicon.ico') {response.writeHead(204, commonHeaders); response.end(); return;}
    const isGame = path === '/game';
    if (path !== '/' && !isGame) {
      response.writeHead(404, {...commonHeaders, 'Content-Type': 'text/plain; charset=utf-8'});
      response.end('찾을 수 없는 페이지입니다.');
      return;
    }
    const csp = [
      "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'", "img-src data:",
      "connect-src 'none'", "base-uri 'none'", "form-action 'none'", "object-src 'none'",
      isGame ? `frame-ancestors http://${host}` : "frame-ancestors 'none'",
      ...(isGame ? [] : ["frame-src 'self'"]),
    ].join('; ');
    response.writeHead(200, {...commonHeaders, 'Content-Security-Policy': csp});
    response.end(request.method === 'HEAD' ? undefined : isGame ? documents.game : documents.host);
  });
}

async function main() {
  const rawPort = process.env.REGION_QUEST_PORT || '8787';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('REGION_QUEST_PORT는 1024~65535 정수여야 합니다.');
  const documents = await buildPrototypeDocuments();
  const server = createPrototypeServer(documents, port);
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `포트 ${port}를 이미 사용 중입니다. REGION_QUEST_PORT로 다른 포트를 지정해 주세요.` : error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`장난감 마을 테스트: http://127.0.0.1:${port}`);
    console.log('로컬 전용 · 외부 API/DB 연결 없음 · 종료: Ctrl+C');
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(`테스트판을 시작하지 못했습니다: ${error.message}`);
    console.error('prototype의 게임 파일과 assets/manifest.json, 이미지 파일을 확인해 주세요.');
    process.exitCode = 1;
  });
}
