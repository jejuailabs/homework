import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const policy = moduleUrl(compile('./policy.ts'));
await import(moduleUrl(compile('./policy.test.ts').replace("'./policy'", JSON.stringify(policy))));
// The old-Hangul reader, on a hand-built record stream: body text, then a 2x2 table.
const hwp = await import(moduleUrl(compile('./hwp.ts')));
const record = (tag, level, body) => {const head = Buffer.alloc(4); head.writeUInt32LE((tag | (level << 10) | (body.length << 20)) >>> 0); return Buffer.concat([head, body]);};
const text = value => Buffer.from(value, 'utf16le');
const cell = (col, row) => {const body = Buffer.alloc(16); body.writeUInt16LE(col, 8); body.writeUInt16LE(row, 10); return body;};
const stream = Buffer.concat([
  record(67, 1, text('주간 시간표')),
  record(71, 1, Buffer.from(' lbt')), record(77, 2, Buffer.alloc(8)),
  record(72, 2, cell(0, 0)), record(67, 3, text('월')), record(72, 2, cell(1, 0)), record(67, 3, text('화')),
  record(72, 2, cell(0, 1)), record(67, 3, text('국어')), record(72, 2, cell(1, 1)), record(67, 3, text('수학')),
  record(67, 1, text('끝')),
]);
const out = hwp.sectionText(new Uint8Array(stream));
if (out.replace(/\n+/g, '\n') !== '주간 시간표\n월\t화\n국어\t수학\n끝') throw new Error(`hwp section text: ${JSON.stringify(out)}`);
let refused = false;
try {hwp.hwpText(new Uint8Array(2000));} catch (error) {refused = error instanceof hwp.HwpError;}
if (!refused) throw new Error('a non-HWP file must be refused');
console.log('attachments hwp tests passed');
