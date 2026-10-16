import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const url = 'data:text/javascript;base64,' + Buffer.from(compile('./classroom-tools.ts')).toString('base64');
const tests = compile('./classroom-tools.test.ts').replace("'./classroom-tools'", JSON.stringify(url));
await import('data:text/javascript;base64,' + Buffer.from(tests).toString('base64'));
