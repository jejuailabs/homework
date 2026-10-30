// Permission regression tests are local: no Firebase, preview asset reads, or network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url), React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
function load(file, imports) {
  const url = new URL(file, import.meta.url);
  const source = ts.transpileModule(fs.readFileSync(url, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true}}).outputText;
  const module = {exports: {}};
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, {filename: url.href})(name => name in imports ? imports[name] : require(name), module, module.exports);
  return module.exports;
}
const access = load('../beta/access.ts', {});
class ApiError extends Error {constructor(status, message) {super(message); this.status = status;}}
function handler(role) {
  let current = role, previews = 0;
  const route = load('../beta/handler.ts', {
    '@/lib/server/auth': {getContext: async () => {if (!current) throw new ApiError(401, '로그인이 필요해요.'); return {uid: 'fixture', role: current};}},
    '@/lib/server/policy': {ApiError}, './access': access,
    './preview': {loadRegionQuestPreview: async () => {previews++; return '<!doctype html><title>private preview</title>'; }},
  });
  return {...route, setRole: role => current = role, get previews() {return previews;}};
}
const request = () => new Request('https://local.test/api/region-quest/beta');

for (const role of [null, 'student', 'teacher', 'ADMIN']) {
  test(`region preview denies ${role || 'anonymous'} before loading private game assets`, async () => {
    const route = handler(role), response = await route.GET(request());
    assert.equal(response.status, role ? 403 : 401); assert.equal(route.previews, 0);
    assert.doesNotMatch(await response.text(), /private preview/);
    assert.match(response.headers.get('cache-control'), /private.*no-store/);
    assert.equal(response.headers.get('vary'), 'Cookie');
  });
}
for (const role of ['admin', 'superadmin']) {
  test(`region preview permits ${role}, then denies the same UID after demotion`, async () => {
    const route = handler(role), response = await route.GET(request());
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /^text\/html/);
    assert.equal(route.previews, 1); route.setRole('teacher');
    assert.equal((await route.GET(request())).status, 403); assert.equal(route.previews, 1);
  });
}

function markup(file, role) {
  const viewer = {useVerifiedViewer: () => ({viewer: role ? {uid: 'fixture', role} : null})};
  const component = load(file, {
    './viewer-context': viewer, '@/components/viewer-context': viewer,
    '@/modules/region-quest/beta/access': access, './access': access,
    '@/styles/test-zone.css': {}, './launcher.module.css': {launcher: 'region-launcher'},
    '@/lib/body-scroll-lock': {}, './storage': {},
    './learning-king-beta': () => React.createElement('button', null, '학습왕 베타'),
    'next/dynamic': () => () => React.createElement('button', null, '우리동네 탐험'),
  }).default;
  return renderToStaticMarkup(React.createElement(component, {embedded: true}));
}
for (const role of [null, 'student', 'teacher', 'admin', 'superadmin']) {
  test(`Test Zone and standalone launcher follow administrator access for ${role || 'unverified viewer'}`, () => {
    const menu = markup('../../../components/test-zone.tsx', role), launcher = markup('../beta/launcher.tsx', role);
    if (role === 'admin' || role === 'superadmin') {assert.match(menu, /우리동네 탐험/); assert.match(launcher, /우리동네 탐험/);}
    else {assert.doesNotMatch(menu, /우리동네 탐험/); assert.equal(launcher, '');}
    if (role === 'teacher') assert.match(menu, /학습왕 베타/);
  });
}
