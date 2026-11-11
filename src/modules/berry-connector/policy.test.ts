import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {trustedRedirectHost, accessConfig, accessDays, alias, authorizationServerMetadata, authorizeRequest, canonicalJson, checkedByDefault, clientRegistration, confirmationProblem, connectorAllowed, deriveEvents, givenName, maskNames, mergeEvents, parseScopes, payloadHash, toolAllowed, CONFIRM_SECONDS, protectedResourceMetadata, redirectWith, scopesWithin, studentLabel, validRedirectUri, verifyPkce} from './policy';

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

assert.deepEqual(parseScopes(undefined), ['classes:read', 'homework:read', 'workspace:read', 'events:read', 'classroom:read'], 'defaults are read-only and name-free');
assert.equal(checkedByDefault('classroom:read'), true, 'class activity summaries are read-only, so checked by default');
assert.equal(checkedByDefault('classroom:write'), true, 'writes are checked by default: each one still needs the confirm card');
assert.equal(toolAllowed({scope: 'classroom:read'}, ['classroom:write']), false, 'the write scope does not unlock the summaries');
assert.deepEqual(parseScopes('names homework:read classes:read'), ['classes:read', 'homework:read', 'names'], 'catalog order, de-duplicated');
assert.throws(() => parseScopes('homework:write'), /지원하지 않는 권한/);
assert.equal(scopesWithin(['classes:read', 'names'], ['names']), true);
assert.equal(scopesWithin(['classes:read'], ['names']), false, 'refresh cannot widen');

assert.equal(accessDays(undefined), 30);
assert.equal(accessDays('7'), 7);
assert.throws(() => accessDays(0));
assert.equal(accessDays('180'), 180, 'six months');
assert.equal(accessDays(365), 365, 'twelve months');
assert.throws(() => accessDays(366));
assert.throws(() => accessDays(30.5));

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
assert.ok(all.every(e => e.source === 'derived'));
const logLine = {id: 'log:x1', type: 'item.created', source: 'log' as const, at: '2026-11-02T07:00:00.000Z', ref: {collection: 'items', id: 'i1'}, summary: '업무 항목 추가 1건'};
assert.deepEqual(mergeEvents([logLine], all).map(e => e.id), ['created:a2', 'created:a1', 'created:a4', 'passed:a2', 'soon:a1', 'log:x1', 'review:a1:25'], 'log lines interleave by time');

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
assert.equal(trustedRedirectHost('https://berry-brain-x.a.run.app/cb', ['berry-brain-x.a.run.app']), true, 'our own brain host');
assert.equal(trustedRedirectHost('https://other.a.run.app/cb', ['berry-brain-x.a.run.app']), false, 'exact host only');
// Write scopes: never default, unchecked on consent, cannot be added on refresh.
assert.deepEqual(parseScopes('notebook:write calendar:write workspace:read'), ['workspace:read', 'calendar:write', 'notebook:write']);
assert.ok(parseScopes(undefined).every(scope => !scope.endsWith(':write')));
assert.deepEqual(['classes:read', 'names', 'calendar:write', 'workspace:write', 'notebook:write', 'workspace:read'].map(scope => checkedByDefault(scope as never)), [true, false, true, true, true, true]);
assert.equal(scopesWithin(['workspace:read'], ['workspace:write']), false, 'a read grant never widens to write');
assert.equal(toolAllowed({scope: ['calendar:write', 'workspace:write']}, ['workspace:write']), true);
assert.equal(toolAllowed({scope: 'workspace:read'}, ['calendar:write']), false);

// Confirmation tokens
assert.equal(canonicalJson({b: 1, a: {d: [2, {f: 1, e: 0}], c: undefined}}), '{"a":{"d":[2,{"e":0,"f":1}]},"b":1}');
const payload = {date: '2026-11-03', entry: {subject: '국어', note: '비유'}};
const hash = payloadHash('add_lesson_log', payload);
assert.equal(hash, payloadHash('add_lesson_log', {entry: {note: '비유', subject: '국어'}, date: '2026-11-03'}), 'key order does not matter');
assert.notEqual(hash, payloadHash('add_lesson_log', {...payload, date: '2026-11-04'}), 'content is bound');
assert.notEqual(hash, payloadHash('add_work_item', payload), 'the tool is bound');
const t0 = 1_800_000_000_000, ctx = {uid: 't1', grantId: 'g1', clientId: 'c1', scopes: ['workspace:write'] as const};
const record = {uid: 't1', grantId: 'g1', clientId: 'c1', tool: 'add_lesson_log', payloadHash: hash, expiresAtMs: t0 + CONFIRM_SECONDS * 1000, usedAt: null};
assert.equal(confirmationProblem(record, {...ctx, scopes: [...ctx.scopes]}, t0, hash), null);
assert.equal(confirmationProblem(record, {...ctx, scopes: [...ctx.scopes]}, t0, hash, hash), null, 'the preview hash may be echoed back');
assert.match(confirmationProblem(null, {...ctx, scopes: [...ctx.scopes]}, t0, hash)!, /찾을 수 없/);
assert.match(confirmationProblem(record, {...ctx, uid: 't2', scopes: [...ctx.scopes]}, t0, hash)!, /이 연결/, 'another teacher');
assert.match(confirmationProblem(record, {...ctx, grantId: 'g2', scopes: [...ctx.scopes]}, t0, hash)!, /이 연결/, 'another connection');
assert.match(confirmationProblem(record, {...ctx, clientId: 'c2', scopes: [...ctx.scopes]}, t0, hash)!, /이 연결/, 'another app');
assert.match(confirmationProblem({...record, usedAt: '2026-11-01T00:00:00Z'}, {...ctx, scopes: [...ctx.scopes]}, t0, hash)!, /이미/, 'single use');
assert.match(confirmationProblem(record, {...ctx, scopes: [...ctx.scopes]}, t0 + CONFIRM_SECONDS * 1000, hash)!, /시간이 지났/, 'ten minutes');
assert.match(confirmationProblem(record, {...ctx, scopes: ['workspace:read']}, t0, hash)!, /쓰기 권한/, 'scope narrowed after preview');
assert.match(confirmationProblem(record, {...ctx, scopes: [...ctx.scopes]}, t0, payloadHash('add_lesson_log', {...payload, date: '2026-11-09'}))!, /바뀌었/, 'stored payload altered');
assert.match(confirmationProblem(record, {...ctx, scopes: [...ctx.scopes]}, t0, hash, 'other')!, /달라요/, 'different content presented');

// Names typed into free text leave as aliases
const people = [{name: '김민준', number: 1}, {name: '김민준호', number: 2}, {name: '이서연', number: 3}, {name: '이서연', number: 9}, {name: '김', number: 4}];
assert.equal(maskNames('김민준호와 김민준, 이서연 상담 김밥', people), '학생 02와 학생 01, 학생 상담 김밥', 'longest first; shared names lose the number; one-letter names are left alone');
// Given names alone are masked too; a one-syllable given name is not.
const named = [{name: '김민준', number: 1}, {name: '김민준호', number: 2}, {name: '이서연', number: 3}, {name: '박서연', number: 9}, {name: '남궁민수', number: 5}, {name: '김결', number: 6}, {name: 'Alex Kim', number: 7}];
assert.equal(maskNames('민준이가 서연이랑 민준호에게 줬어요', named), '학생 01이가 학생이랑 학생 02에게 줬어요', 'given names are masked, longest first; a shared given name loses the number');
assert.equal(maskNames('민수 결과 결석 Alex Kim', named), '학생 05 결과 결석 학생 07', 'a compound surname leaves its given name; a one-syllable given name stays');
assert.deepEqual(['김민준', '남궁민수', '이하은별', '김결', 'Alex', '김a준'].map(givenName), ['민준', '민수', '하은별', null, null, null], 'given names of Hangul names of three or four syllables');
console.log('berry-connector policy tests passed');
