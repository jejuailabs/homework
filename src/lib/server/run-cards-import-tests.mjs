import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const dataUrl=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const moduleUrl=dataUrl(compile('../cards-import.ts').replace("'./cards-ai-draft'",JSON.stringify(dataUrl(compile('../cards-ai-draft.ts')))).replace("'./cards-logic'",JSON.stringify(dataUrl(compile('../cards-logic.ts')))));
const testCode=compile('../cards-import.test.ts').replace("'./cards-import'",JSON.stringify(moduleUrl));
await import('data:text/javascript;base64,'+Buffer.from(testCode).toString('base64'));
