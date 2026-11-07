import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const dataUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const plan = dataUrl(compile('../cards-class-plan.ts'));
await import(dataUrl(compile('../cards-class-plan.test.ts').replace("'./cards-class-plan'", JSON.stringify(plan))));
