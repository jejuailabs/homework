import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const dataUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const classroom = dataUrl(compile('../cards-classroom.ts'));
await import(dataUrl(compile('../cards-classroom.test.ts').replace("'./cards-classroom'", JSON.stringify(classroom))));
