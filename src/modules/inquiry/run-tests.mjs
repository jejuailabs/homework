// Standalone runner: node src/modules/inquiry/run-tests.mjs
import ts from 'typescript';
import {readFileSync, readdirSync} from 'node:fs';
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const policy = url(compile('./policy.ts'));
await import(url(compile('./policy.test.ts').replace("'./policy'", JSON.stringify(policy))));

// Isolation guard: the public inquiry may only touch its own collections (plus the shared rate limiter and the admin audit log).
for (const name of readdirSync(new URL('.', import.meta.url)).filter(n => /\.(ts|tsx)$/.test(n) && !n.endsWith('.test.ts'))) {
  const code = readFileSync(new URL('./' + name, import.meta.url), 'utf8');
  for (const match of code.matchAll(/(?:db\(\)\.(?:doc|collection)|\b(?:collection|doc))\((['`])([^'`$]+)/g)) {
    if (!/^(inquiries|inquiryStats\/|adminAudit)/.test(match[2])) throw new Error(`${name}: unexpected Firestore path "${match[2]}"`);
  }
  if (/bucket\(\)|firebase-admin\/storage/.test(code)) throw new Error(`${name}: must not use Storage`);
  if (name !== 'server.ts' && /server-only|@\/lib\/server/.test(code)) throw new Error(`${name}: browser file imports server code`);
  if (/jejuailabs|@gmail\.com|@naver\.com/.test(code)) throw new Error(`${name}: an address is hard-coded; use INQUIRY_MAIL_TO`);
}
console.log('inquiry isolation guard passed');
