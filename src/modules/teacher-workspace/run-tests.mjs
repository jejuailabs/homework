import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const types = moduleUrl(compile('./types.ts'));
const shared = moduleUrl(compile('./shared.ts'));
const policy = moduleUrl(compile('./policy.ts').replace("'./types'", JSON.stringify(types)).replaceAll("'./shared'", JSON.stringify(shared)));
await import(moduleUrl(compile('./policy.test.ts').replace("'./policy'", JSON.stringify(policy))));
