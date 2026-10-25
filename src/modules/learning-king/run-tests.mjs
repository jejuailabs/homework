import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const routeSource = fs.readFileSync(new URL('../../app/api/learning-king-beta/route.ts', import.meta.url), 'utf8');
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const policyUrl = moduleUrl(`
  export class ApiError extends Error {
    constructor(status, message, code = 'INVALID_REQUEST') {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
`);
let harnessId = 0;

async function createRoute({ loadError = false, authError = false } = {}) {
  const harnessUrl = moduleUrl(`
    export const id = ${++harnessId};
    export const calls = [];
    export const requests = [];
    export const html = '<!doctype html><title>학습왕 베타</title><main>fictional demo records only</main>';
  `);
  const authUrl = moduleUrl(`
    import { ApiError } from ${JSON.stringify(policyUrl)};
    import { calls, requests } from ${JSON.stringify(harnessUrl)};
    export async function requireTeacher(request) {
      calls.push('auth');
      requests.push(request);
      if (${authError}) throw new Error('private authentication failure details');
      const role = request.headers.get('x-test-role');
      if (!role) throw new ApiError(401, '로그인이 필요해요.', 'UNAUTHENTICATED');
      if (role === 'student') throw new ApiError(403, '선생님만 사용할 수 있어요.', 'FORBIDDEN');
      return { uid: 'test-account', role };
    }
  `);
  const previewUrl = moduleUrl(`
    import { calls, html } from ${JSON.stringify(harnessUrl)};
    export async function loadLearningKingPreview() {
      calls.push('preview');
      if (${loadError}) throw new Error('private preview path /private/assets/secret.html');
      return html;
    }
  `);
  const compiled = ts.transpileModule(routeSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const code = compiled
    .replace(/(['"])@\/lib\/server\/auth\1/g, JSON.stringify(authUrl))
    .replace(/(['"])@\/lib\/server\/policy\1/g, JSON.stringify(policyUrl))
    .replace(/(['"])@\/modules\/learning-king\/server\/preview\1/g, JSON.stringify(previewUrl));
  assert.doesNotMatch(code, /from\s+['"](?:@\/|firebase|next\/)/, 'route tests must not import live services');
  const handler = await import(moduleUrl(code));
  return { ...handler, ...(await import(harnessUrl)) };
}

function requestFor(role) {
  return new Request('https://local.test/api/learning-king-beta', {
    headers: role ? { 'x-test-role': role, cookie: '__session=local-test-only' } : {},
  });
}

function assertPrivateResponse(response) {
  const cacheControl = response.headers.get('cache-control') ?? '';
  assert.match(cacheControl, /(?:^|,)\s*private(?:\s*,|$)/i);
  assert.match(cacheControl, /(?:^|,)\s*no-store(?:\s*,|$)/i);
  assert.ok((response.headers.get('vary') ?? '').split(',').some(value => value.trim().toLowerCase() === 'cookie'));
}

test('학습왕 beta denies unauthenticated requests before reading preview content', async () => {
  const route = await createRoute();
  const request = requestFor();
  const response = await route.GET(request);
  assert.equal(response.status, 401);
  assertPrivateResponse(response);
  assert.deepEqual(route.calls, ['auth']);
  assert.equal(route.requests[0], request);
  assert.doesNotMatch(await response.text(), /fictional demo records only/);
});

test('학습왕 beta denies student requests before reading preview content', async () => {
  const route = await createRoute();
  const response = await route.GET(requestFor('student'));
  assert.equal(response.status, 403);
  assertPrivateResponse(response);
  assert.deepEqual(route.calls, ['auth']);
  assert.doesNotMatch(await response.text(), /fictional demo records only/);
});

for (const role of ['teacher', 'admin', 'superadmin']) {
  test(`학습왕 beta serves private HTML to ${role} after authorization`, async () => {
    const route = await createRoute();
    const request = requestFor(role);
    const response = await route.GET(request);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^text\/html\b/i);
    assertPrivateResponse(response);
    assert.deepEqual(route.calls, ['auth', 'preview']);
    assert.equal(route.requests[0], request);
    assert.equal(await response.text(), route.html);
  });
}

test('학습왕 beta preview failures stay private and do not expose internal paths', async () => {
  const route = await createRoute({ loadError: true });
  const response = await route.GET(requestFor('teacher'));
  assert.equal(response.status, 500);
  assertPrivateResponse(response);
  assert.deepEqual(route.calls, ['auth', 'preview']);
  const body = await response.text();
  assert.doesNotMatch(body, /private preview path|secret\.html|\/private\/assets|fictional demo records only/);
});

test('학습왕 beta unexpected authentication failures never read preview or leak details', async () => {
  const route = await createRoute({ authError: true });
  const response = await route.GET(requestFor('teacher'));
  assert.equal(response.status, 500);
  assertPrivateResponse(response);
  assert.deepEqual(route.calls, ['auth']);
  assert.doesNotMatch(await response.text(), /private authentication failure details|fictional demo records only/);
});

await import('./model.test.mjs');
await import('./preview.test.mjs');
