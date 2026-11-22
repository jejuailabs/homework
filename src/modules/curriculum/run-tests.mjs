import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const engine = moduleUrl(compile('./engine.ts'));
const sample = moduleUrl(compile('./sample.ts'));
const rows = moduleUrl(compile('./feature-rows.ts'));
const features = moduleUrl(compile('./features.ts').replace("'./feature-rows'", JSON.stringify(rows)));
const zip = moduleUrl(compile('../../lib/zip-store.ts'));
const xlsx = moduleUrl(compile('./xlsx.ts').replace("'./engine'", JSON.stringify(engine)).replace("'@/lib/zip-store'", JSON.stringify(zip)));
const rulesEarly = moduleUrl(compile('./rules.ts'));
const files = moduleUrl(compile('./files.ts').replace("'./engine'", JSON.stringify(engine)).replace("'./xlsx'", JSON.stringify(xlsx)).replace("'./rules'", JSON.stringify(rulesEarly)));
const policy = moduleUrl(compile('./policy.ts'));
const sampleUrl = moduleUrl(compile('./sample.ts'));
const starter = moduleUrl(compile('./starter.ts').replace("'./sample'", JSON.stringify(sampleUrl)));
const changes = moduleUrl(compile('./changes.ts'));
const rules = moduleUrl(compile('./rules.ts'));
const berryTasks = moduleUrl(compile('./berry-tasks.ts'));
const swap = code => code.replace("'./policy'", JSON.stringify(policy)).replace("'./starter'", JSON.stringify(starter)).replace("'./changes'", JSON.stringify(changes)).replace("'./rules'", JSON.stringify(rules)).replace("'./berry-tasks'", JSON.stringify(berryTasks)).replace("'./engine'", JSON.stringify(engine)).replace("'./sample'", JSON.stringify(sample)).replace("'./features'", JSON.stringify(features)).replace("'./xlsx'", JSON.stringify(xlsx)).replace("'./files'", JSON.stringify(files));
await import(moduleUrl(swap(compile('./curriculum.test.ts'))));

// 판독: 엑셀·한글 표 읽기와 해석.
const tables = moduleUrl(compile('./tables.ts'));
const readers = moduleUrl(compile('./readers.ts'));
await import(moduleUrl(swap(compile('./readers.test.ts')).replace("'./tables'", JSON.stringify(tables)).replace("'./readers'", JSON.stringify(readers)).replace("'@/lib/zip-store'", JSON.stringify(zip))));

// 서버: 바깥 의존(Firestore·로그인·Next)을 가짜로 바꿔 저장 경로를 시험한다.
const apiPolicy = moduleUrl("export class ApiError extends Error { constructor(status, message, code = 'INVALID_REQUEST') { super(message); this.status = status; this.code = code; } }");
const {run} = await import('./server.test.mjs');
const {buildXlsx: makeXlsx} = await import(xlsx);
const sampleXlsx = makeXlsx([{name: '편제표', rows: [['구분', '교과', '3학년', ''], ['', '', '1학기', '2학기'], ['', '국어', 102, 102], ['', '사회', 51, 51], ['', '수학', 68, 68], ['', '체육', 51, 51]]}]);
await run(async ({db, user, bucket}) => {
  globalThis.__curriculumFake = {db, user, bucket};
  const fakeAdmin = moduleUrl('export const db = () => globalThis.__curriculumFake.db; export const bucket = () => globalThis.__curriculumFake.bucket;');
  const fakeAuth = moduleUrl('export const getContext = async () => ({...globalThis.__curriculumFake.user}); export const assertOrigin = () => {};');
  const fakeNext = moduleUrl('export const NextResponse = {json: (value, init = {}) => new Response(JSON.stringify(value), {status: init.status ?? 200, headers: {"content-type": "application/json"}})};');
  const server = compile('./server.ts').replace("import 'server-only';", '').replace("'next/server'", JSON.stringify(fakeNext)).replace("'@/lib/server/admin'", JSON.stringify(fakeAdmin))
    .replace("'@/lib/server/auth'", JSON.stringify(fakeAuth)).replace("'@/lib/server/policy'", JSON.stringify(apiPolicy)).replace("'./tables'", JSON.stringify(tables)).replace("'./readers'", JSON.stringify(readers));
  return import(moduleUrl(swap(server)));
}, sampleXlsx);
