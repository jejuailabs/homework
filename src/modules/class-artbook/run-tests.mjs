// Standalone runner: node src/modules/class-artbook/run-tests.mjs
// Also proves the module stays self-contained: server code is not needed for its rules.
import ts from 'typescript';
import {readFileSync, readdirSync} from 'node:fs';
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const types = url(compile('./types.ts'));
const zip = url(compile('./zip.ts'));
const policy = url(compile('./policy.ts').replace("'./types'", JSON.stringify(types)));
await import(url(compile('./policy.test.ts').replace("'./policy'", JSON.stringify(policy)).replace("'./zip'", JSON.stringify(zip)).replace("'./types'", JSON.stringify(types))));

// Isolation guard: this module may read exhibitions but must never write outside its own collections and prefix.
const sources = readdirSync(new URL('.', import.meta.url)).filter(name => /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')).map(name => [name, readFileSync(new URL('./' + name, import.meta.url), 'utf8')]);
for (const [name, code] of sources) {
  for (const match of code.matchAll(/db\(\)\.(?:doc|collection)\((['`])([^'`$]+)/g)) {
    const path = match[2];
    const readOnly = /^(classes|exhibitions|assignments|submissions|participationBoards)\b/.test(path), own = /^classArtbook(s|Owners)\//.test(path);
    if (!readOnly && !own) throw new Error(`${name}: unexpected Firestore path "${path}"`);
  }
  if (name === 'source.ts' && /runTransaction|\.batch\(|\.ref\.(set|update|delete)\(|\.doc\([^)]*\)\.(set|update|delete|create)\(/.test(code)) throw new Error('source.ts must stay read-only');
  if (/bucket\(\)\.file\((['`])(?!class-artbooks\/)[a-z]/.test(code)) throw new Error(`${name}: writes outside class-artbooks/`);
}
console.log('class-artbook isolation guard passed');
