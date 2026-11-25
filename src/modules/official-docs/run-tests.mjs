// Standalone runner: node src/modules/official-docs/run-tests.mjs [out.hwpx]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const compile = url => ts.transpileModule(fs.readFileSync(new URL(url, import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const zip = moduleUrl(compile('../../lib/zip-store.ts'));
const blank = moduleUrl(compile('./hwpx-blank.ts'));
const hwpx = await import(moduleUrl(compile('./hwpx.ts').replace("'@/lib/zip-store'", JSON.stringify(zip)).replace("'./hwpx-blank'", JSON.stringify(blank))));
const policy = await import(moduleUrl(compile('./policy.ts')));

// HWPX: one paragraph per line on Hancom's own blank document; markup in the text is escaped.
const text = '제출 문서\n\n1. 참가 희망: 5학년 2반 <24명>\n2. 담당: 교사 & 부장';
const bytes = hwpx.hwpxBytes(text), raw = Buffer.from(bytes).toString('latin1');
assert.equal(raw.slice(0, 2), 'PK');
assert.ok(raw.indexOf('mimetype') < raw.indexOf('version.xml'), 'mimetype is the first entry');
const section = Buffer.from(bytes).toString('utf8');
assert.ok(section.includes('<hp:t>제출 문서</hp:t>') && section.includes('5학년 2반 &lt;24명&gt;') && section.includes('교사 &amp; 부장'));
assert.equal(section.split('<hp:p ').length - 1, 4, 'four lines, four paragraphs');
assert.ok(!section.includes('linesegarray'));
if (process.argv[2]) fs.writeFileSync(process.argv[2], bytes);

// Analysis answers are trimmed to real dates and bounded lists.
const analysis = policy.officialAnalysis({title: ' 2026 독서 행사 참가 신청 안내 ', sender: '○○교육지원청', doc_number: '교육과-1234', summary: '요약', deadlines: [{what: '참가 신청서 제출', date: '2026-12-05', time: '17:00'}, {what: '잘못된 날짜', date: '12월 5일', time: null}, {what: '', date: '2026-12-01', time: null}], actions: [{title: '신청서 작성', detail: '붙임 양식', ai_can_draft: true}], submission: {needed: true, to: '교육과', method: '공문 회신', form: '붙임 1 신청서'}});
assert.equal(analysis.title, '2026 독서 행사 참가 신청 안내');
assert.deepEqual(analysis.deadlines, [{what: '참가 신청서 제출', date: '2026-12-05', time: '17:00'}]);
assert.equal(analysis.actions.length, 1);
assert.equal(analysis.submission.needed, true);
assert.deepEqual(policy.officialAnalysis(null).deadlines, []);

// Only text that reads like an official document is routed from a Berry attachment.
assert.equal(policy.looksOfficial('수신 수신자 참조\n(경유)\n제목 2026학년도 학교폭력 예방교육 실적 제출 안내\n1. 관련: 생활교육과-1234\n시행 생활교육과-5678 (2026. 11. 20.)'), true);
assert.equal(policy.looksOfficial('3교시 국어 비유 표현 찾기. 모둠 발표까지 마침.'), false);
assert.equal(policy.deadlineTitle('신청서 제출', '독서 행사 안내'), '[공문] 신청서 제출 · 독서 행사 안내');
assert.ok(policy.deadlineTitle('가'.repeat(100), '나'.repeat(100)).length <= 120);
console.log('official-docs tests passed');
