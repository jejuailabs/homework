import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const characterUrl = 'data:text/javascript;base64,' + Buffer.from(compile('../characters.ts')).toString('base64');
const rosterUrl = 'data:text/javascript;base64,' + Buffer.from(compile('../roster.ts')).toString('base64');
const rosterTest = compile('../roster.test.ts').replace("'./roster'", JSON.stringify(rosterUrl));
await import('data:text/javascript;base64,' + Buffer.from(rosterTest).toString('base64'));
const policyUrl = 'data:text/javascript;base64,' + Buffer.from(compile('./policy.ts').replace("'../characters'", JSON.stringify(characterUrl))).toString('base64');
const testCode = compile('./policy.test.ts').replace("'./policy'", JSON.stringify(policyUrl));
await import('data:text/javascript;base64,' + Buffer.from(testCode).toString('base64'));
await import('./run-ai-tests.mjs');
await import('./run-exhibition-tests.mjs');
