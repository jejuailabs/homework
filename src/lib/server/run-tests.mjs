import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const policyUrl = 'data:text/javascript;base64,' + Buffer.from(compile('./policy.ts')).toString('base64');
const testCode = compile('./policy.test.ts').replace("'./policy'", JSON.stringify(policyUrl));
await import('data:text/javascript;base64,' + Buffer.from(testCode).toString('base64'));
