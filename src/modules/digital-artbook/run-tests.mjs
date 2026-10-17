import ts from 'typescript';
import {readFileSync} from 'node:fs';
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const types = url(compile('./types.ts'));
const policy = url(compile('./policy.ts').replace("'./types'", JSON.stringify(types)));
await import(url(compile('./policy.test.ts').replace("'./policy'", JSON.stringify(policy))));
