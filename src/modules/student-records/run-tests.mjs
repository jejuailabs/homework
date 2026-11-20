// Standalone runner: node src/modules/student-records/run-tests.mjs
import ts from 'typescript';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const {recordPeriod, recordsCsv, cell, RecordInputError} = await import('data:text/javascript;base64,' + Buffer.from(compile('./policy.ts')).toString('base64'));

const now = Date.parse('2026-11-20T03:00:00Z');
assert.deepEqual(recordPeriod(null, null, now), {from: '2026-05-24', to: '2026-11-20'});
assert.deepEqual(recordPeriod('2026-03-02', '2026-07-20', now), {from: '2026-03-02', to: '2026-07-20'});
for (const [from, to] of [['2026-13-01', null], ['2026-07-01', '2026-06-01'], ['2025-01-01', '2026-11-20'], ['x', null]]) assert.throws(() => recordPeriod(from, to, now), RecordInputError);

assert.equal(cell('=SUM(A1)'), "'=SUM(A1)");
assert.equal(cell('-10점'), "'-10점");
assert.equal(cell('말, "따옴표"'), '"말, ""따옴표"""');
assert.equal(cell('두 줄\n기록'), '두 줄 기록');
const labels = {homework: '숙제 말씀', artwork: '작품 한마디', points: '보말 칭찬'};
const csv = recordsCsv([{id: 's1', name: '김하늘', number: 1, records: [{kind: 'homework', date: '2026-05-10', title: '독서 감상문', text: '주인공 마음을 잘 적었어요'}, {kind: 'points', date: '2026-05-11', title: '보말 +5', text: '친구를 도와줌'}]}], ['homework'], labels);
assert.ok(csv.startsWith('﻿번호,이름,날짜,종류,제목,내용\r\n'));
assert.ok(csv.includes('1,김하늘,2026-05-10,숙제 말씀,독서 감상문,주인공 마음을 잘 적었어요'));
assert.ok(!csv.includes('보말 칭찬'));

// Read-only guard: this module must not write to the database or storage.
const server = readFileSync(new URL('./server.ts', import.meta.url), 'utf8');
assert.ok(!/\.(set|update|delete|create|add)\(|runTransaction|\.batch\(|bucket\(/.test(server.replace(/records\.get\([^)]*\)|new Map|\.add\(/g, '')), 'server.ts must stay read-only');
console.log('student-records tests passed');
