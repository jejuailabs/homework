import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const dataUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const logic = JSON.stringify(dataUrl(compile('../cards-logic.ts')));
const load = dataUrl(compile('../cards-load.ts').replace("'./cards-logic'", logic));
const guard = dataUrl(compile('../cards-guard.ts').replace("'./cards-logic'", logic));
await import(dataUrl(compile('../cards-load.test.ts').replace("'./cards-load'", JSON.stringify(load)).replace("'./cards-guard'", JSON.stringify(guard))));
