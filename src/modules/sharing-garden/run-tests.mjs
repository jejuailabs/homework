import ts from 'typescript';
import {readFileSync} from 'node:fs';
const compile = p => ts.transpileModule(readFileSync(new URL(p, import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const url = s => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const policy = url(compile('./policy.ts'));
await import(url(compile('./policy.test.ts').replace("'./policy'", JSON.stringify(policy))));
