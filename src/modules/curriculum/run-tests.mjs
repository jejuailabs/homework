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
const files = moduleUrl(compile('./files.ts').replace("'./engine'", JSON.stringify(engine)).replace("'./xlsx'", JSON.stringify(xlsx)));
const policy = moduleUrl(compile('./policy.ts'));
const sampleUrl = moduleUrl(compile('./sample.ts'));
const starter = moduleUrl(compile('./starter.ts').replace("'./sample'", JSON.stringify(sampleUrl)));
const changes = moduleUrl(compile('./changes.ts'));
const swap = code => code.replace("'./policy'", JSON.stringify(policy)).replace("'./starter'", JSON.stringify(starter)).replace("'./changes'", JSON.stringify(changes)).replace("'./engine'", JSON.stringify(engine)).replace("'./sample'", JSON.stringify(sample)).replace("'./features'", JSON.stringify(features)).replace("'./xlsx'", JSON.stringify(xlsx)).replace("'./files'", JSON.stringify(files));
await import(moduleUrl(swap(compile('./curriculum.test.ts'))));

// 서버: 바깥 의존(Firestore·로그인·Next)을 가짜로 바꿔 저장 경로를 시험한다.
const apiPolicy = moduleUrl("export class ApiError extends Error { constructor(status, message, code = 'INVALID_REQUEST') { super(message); this.status = status; this.code = code; } }");
const {run} = await import('./server.test.mjs');
await run(async ({db, user}) => {
  globalThis.__curriculumFake = {db, user};
  const fakeAdmin = moduleUrl('export const db = () => globalThis.__curriculumFake.db;');
  const fakeAuth = moduleUrl('export const getContext = async () => ({...globalThis.__curriculumFake.user}); export const assertOrigin = () => {};');
  const fakeNext = moduleUrl('export const NextResponse = {json: (value, init = {}) => new Response(JSON.stringify(value), {status: init.status ?? 200, headers: {"content-type": "application/json"}})};');
  const server = compile('./server.ts').replace("import 'server-only';", '').replace("'next/server'", JSON.stringify(fakeNext)).replace("'@/lib/server/admin'", JSON.stringify(fakeAdmin))
    .replace("'@/lib/server/auth'", JSON.stringify(fakeAuth)).replace("'@/lib/server/policy'", JSON.stringify(apiPolicy));
  return import(moduleUrl(swap(server)));
});
