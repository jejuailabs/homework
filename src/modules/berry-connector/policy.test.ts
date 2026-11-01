import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {trustedRedirectHost, accessConfig, accessDays, alias, authorizationServerMetadata, authorizeRequest, clientRegistration, connectorAllowed, deriveEvents, parseScopes, protectedResourceMetadata, redirectWith, scopesWithin, studentLabel, validRedirectUri, verifyPkce} from './policy';

assert.deepEqual(accessConfig(undefined), {mode: 'off', teacherUids: []});
assert.deepEqual(accessConfig({mode: 'allowlist', teacherUids: ['t1', 'bad/uid', 7]}), {mode: 'allowlist', teacherUids: ['t1']});
assert.equal(connectorAllowed({mode: 'all', teacherUids: []}, 't1', 'teacher'), true);
assert.equal(connectorAllowed({mode: 'all', teacherUids: []}, 't1', 'student'), false, 'students never connect');
assert.equal(connectorAllowed({mode: 'all', teacherUids: []}, 't1', 'teacher', 'true'), false, 'kill switch wins');
assert.equal(connectorAllowed({mode: 'allowlist', teacherUids: ['t2']}, 't1', 'teacher'), false);
assert.equal(connectorAllowed({mode: 'off', teacherUids: ['t1']}, 't1', 'teacher'), false);
assert.equal(connectorAllowed({mode: 'off', teacherUids: []}, 't1', 'teacher', undefined, 'all'), true, 'env mode override opens access');
assert.equal(connectorAllowed({mode: 'all', teacherUids: []}, 't1', 'teacher', undefined, 'off'), false, 'env mode override can close access');
assert.equal(connectorAllowed({mode: 'all', teacherUids: []}, 't1', 'teacher', undefined, 'bogus'), true, 'unknown override is ignored');

assert.deepEqual(parseScopes(undefined), ['classes:read', 'homework:read', 'events:read'], 'defaults are read-only and name-free');
assert.deepEqual(parseScopes('names homework:read classes:read'), ['classes:read', 'homework:read', 'names'], 'catalog order, de-duplicated');
assert.throws(() => parseScopes('homework:write'), /지원하지 않는 권한/);
assert.equal(scopesWithin(['classes:read', 'names'], ['names']), true);
assert.equal(scopesWithin(['classes:read'], ['names']), false, 'refresh cannot widen');

assert.equal(accessDays(undefined), 30);
assert.equal(accessDays('7'), 7);
assert.throws(() => accessDays(0));
assert.throws(() => accessDays(31));

assert.equal(validRedirectUri('https://claude.ai/api/mcp/auth_callback'), true);
assert.equal(validRedirectUri('http://localhost:6274/oauth/callback'), true);
assert.equal(validRedirectUri('http://evil.example/cb'), false, 'plain http only on loopback');
assert.equal(validRedirectUri('berry://oauth/callback'), true, 'native app scheme');
assert.equal(validRedirectUri('javascript:alert(1)'), false);
assert.equal(validRedirectUri('https://a.example/cb#frag'), false);
const client = clientRegistration({client_name: '  Claude  ', redirect_uris: ['https://claude.ai/cb', 'https://claude.ai/cb']});
assert.deepEqual(client, {name: 'Claude', redirectUris: ['https://claude.ai/cb']});
assert.throws(() => clientRegistration({redirect_uris: []}));
assert.throws(() => clientRegistration({redirect_uris: ['https://a.example/cb'], token_endpoint_auth_method: 'client_secret_post'}), /공개 클라이언트/);
assert.throws(() => clientRegistration({redirect_uris: ['https://a.example/cb'], grant_types: ['implicit']}));

const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', challenge = createHash('sha256').update(verifier).digest('base64url');
const params = new URLSearchParams({response_type: 'code', client_id: 'c1', redirect_uri: 'https://claude.ai/cb', scope: 'classes:read', state: 'xyz', code_challenge: challenge, code_challenge_method: 'S256'});
const request = authorizeRequest(params, {id: 'c1', redirectUris: ['https://claude.ai/cb']});
assert.equal(request.redirectUri, 'https://claude.ai/cb');
assert.deepEqual(request.scopes, ['classes:read']);
assert.equal(request.state, 'xyz');
assert.throws(() => authorizeRequest(params, null), /등록되지 않은/);
assert.throws(() => authorizeRequest(params, {id: 'c1', redirectUris: ['https://claude.ai/other']}), /돌아갈 주소/);
assert.throws(() => authorizeRequest(new URLSearchParams({...Object.fromEntries(params), code_challenge_method: 'plain'}), {id: 'c1', redirectUris: ['https://claude.ai/cb']}), /S256/);
assert.equal(verifyPkce(verifier, challenge), true);
assert.equal(verifyPkce(verifier + 'x', challenge), false);
assert.equal(verifyPkce('short', challenge), false);
assert.equal(redirectWith('https://claude.ai/cb?keep=1', {code: 'abc', state: 'xyz', iss: ''}), 'https://claude.ai/cb?keep=1&code=abc&state=xyz');

assert.equal(alias(7), '학생 07');
assert.equal(studentLabel({number: 7, name: '김민준'}, ['classes:read'], true), '학생 07', 'no names scope → alias even when asked');
assert.equal(studentLabel({number: 7, name: '김민준'}, ['classes:read', 'names'], false), '학생 07', 'names scope but not asked → alias');
assert.equal(studentLabel({number: 7, name: '김민준'}, ['classes:read', 'names'], true), '김민준');

const now = '2026-11-03T09:00:00.000Z';
const tasks = [
  {id: 'a1', classId: 'c1', title: '수학 익힘', dueAt: '2026-11-04T06:00:00.000Z', createdAt: '2026-11-01T00:00:00.000Z', targetCount: 30, submittedCount: 25, reviewedCount: 20},
  {id: 'a2', classId: 'c1', title: '일기', dueAt: '2026-11-02T06:00:00.000Z', createdAt: '2026-10-30T00:00:00.000Z', targetCount: 30, submittedCount: 30, reviewedCount: 30},
  {id: 'a3', classId: 'c1', title: '숨김', dueAt: null, createdAt: '2026-11-01T00:00:00.000Z', targetCount: 30, submittedCount: 0, reviewedCount: 0, visibility: 'hidden'},
  {id: 'a4', classId: 'c1', title: '미래', dueAt: '2026-11-20T06:00:00.000Z', createdAt: '2026-11-02T00:00:00.000Z', targetCount: 30, submittedCount: 0, reviewedCount: 0},
];
const all = deriveEvents(tasks, null, now);
assert.deepEqual(all.map(e => e.id), ['created:a2', 'created:a1', 'created:a4', 'passed:a2', 'soon:a1', 'review:a1:25'], 'sorted by time; hidden skipped; far future not "soon"');
assert.deepEqual(all.find(e => e.id === 'soon:a1')!.data, {dueAt: '2026-11-04T06:00:00.000Z', missing: 5});
assert.deepEqual(all.find(e => e.id === 'review:a1:25')!.data, {pending: 5});
assert.deepEqual(deriveEvents(tasks, '2026-11-02T05:00:00.000Z', now).map(e => e.id), ['passed:a2', 'soon:a1', 'review:a1:25'], 'cursor drops older events');
assert.deepEqual(deriveEvents(tasks, '2026-11-02T07:00:00.000Z', now).map(e => e.id), ['review:a1:25'], 'soon fired at due-48h, before this cursor');
assert.deepEqual(deriveEvents(tasks, now, now).map(e => e.id), [], 'nothing after now');

const meta = authorizationServerMetadata('https://ourclass.co.kr');
assert.equal(meta.authorization_endpoint, 'https://ourclass.co.kr/oauth/authorize');
assert.equal(meta.token_endpoint, 'https://ourclass.co.kr/api/oauth/token');
assert.deepEqual(meta.code_challenge_methods_supported, ['S256']);
assert.equal(protectedResourceMetadata('https://ourclass.co.kr').resource, 'https://ourclass.co.kr/api/mcp');
assert.equal(trustedRedirectHost('https://claude.ai/api/mcp/auth_callback'), true);
assert.equal(trustedRedirectHost('https://app.claude.com/cb'), true);
assert.equal(trustedRedirectHost('https://chatgpt.com/connector_platform_oauth_redirect'), true);
assert.equal(trustedRedirectHost('https://claude.ai.evil.example/cb'), false, 'suffix must be a real domain boundary');
assert.equal(trustedRedirectHost('https://evilclaude.ai/cb'), false);
assert.equal(trustedRedirectHost('http://localhost:3999/cb'), false, 'loopback is allowed but never trusted');
console.log('berry-connector policy tests passed');
