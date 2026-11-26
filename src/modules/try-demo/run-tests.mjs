// Standalone runner: node src/modules/try-demo/run-tests.mjs
// The login-free tour must stay sealed off from the real service. This fails the moment it stops being so.
import ts from 'typescript';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url)), page = fileURLToPath(new URL('../../app/try/', import.meta.url));
const walk = dir => readdirSync(dir).flatMap(name => {const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path];});
const sources = [...walk(here), ...walk(page)].filter(path => /\.(ts|tsx)$/.test(path));
assert.ok(sources.length >= 7, 'demo sources not found');

// The tour may talk to the server only through /api/try (one demo teacher, limited per visitor; see modules/try-live).
const forbidden = [
  [/XMLHttpRequest|WebSocket|sendBeacon|EventSource/, 'opens another kind of connection'],
  [/@\/lib\/server|server-only|@\/modules\/try-live\/(server|seed)/, 'imports server code'],
  [/from ['"]firebase|firebase-admin|@\/lib\/firebase-client/, 'imports Firebase'],
  [/document\.cookie|sessionStorage|indexedDB/, 'uses browser storage other than the one allowed key'],
  [/AccessGate|useVerifiedViewer/, 'depends on a signed-in viewer'],
];
for (const path of sources) {
  const code = readFileSync(path, 'utf8');
  for (const [pattern, why] of forbidden) assert.ok(!pattern.test(code), `${path}: ${why}`);
  for (const match of code.matchAll(/fetch\s*\(\s*(['"`])([^'"`]*)/g)) assert.ok(match[2].startsWith('/api/try/'), `${path}: fetch outside /api/try (${match[2]})`);
  for (const match of code.matchAll(/['"`](\/api\/[^'"`]*)/g)) assert.ok(match[1].startsWith('/api/try/'), `${path}: names an app API route (${match[1]})`);
  // The only thing kept in the browser is the list of opened corners, under a key no other screen uses.
  for (const match of code.matchAll(/localStorage\.(?:get|set|remove)Item\(([^,)]+)/g)) assert.equal(match[1].trim(), 'SEEN', `${path}: unexpected localStorage key`);
  if (/const SEEN\s*=/.test(code)) assert.match(code, /const SEEN = 'try:seen'/, `${path}: storage key must start with try:`);
}

// Sample data must describe itself consistently: every work has its room, its student and a story.
const compiled = ts.transpileModule(readFileSync(join(here, 'data.ts'), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText
  .replace(/import storage from [^;]+;/, "const storage = {bucket: 'b', prefix: 'try-demo/v1', downloadToken: 't', ready: true};");
const data = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
assert.equal(data.works.length, 25);
assert.equal(new Set(data.works.map(w => w.id)).size, 25);
for (const work of data.works) {
  assert.ok(data.rooms.some(r => r.id === work.roomId) || work.roomId === 'spring', work.id); // spring works stay for the 평어 sample
  assert.ok(data.students.some(s => s.id === work.studentId), work.id);
  assert.ok(work.title && work.story && /^\d{4}-\d{2}-\d{2}$/.test(work.date), work.id);
}
for (const room of data.rooms.filter(r => r.id !== 'forest')) assert.ok(data.roomWorks(room.id).length >= 8, room.id);
for (const id of Object.keys(data.guestbook)) assert.ok(data.works.some(w => w.id === id), id);
assert.equal(new Set(data.students.map(s => s.number)).size, data.students.length);
assert.equal(data.workImage('spring-01', true), 'https://firebasestorage.googleapis.com/v0/b/b/o/try-demo%2Fv1%2Fart%2Fspring-01-thumb.webp?alt=media&token=t');
assert.ok(data.isCorner('gallery') && data.isCorner('review') && !data.isCorner('flow') && !data.isCorner('teacher'));
assert.equal(data.corners.length, 4);
console.log(`try-demo isolation and data checks passed (${sources.length} files)`);
