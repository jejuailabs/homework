import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const dataUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const logic = dataUrl(compile('../cards-logic.ts'));
const print = dataUrl(compile('../cards-print.ts').replace("'./cards-logic'", JSON.stringify(logic)));
await import(dataUrl(compile('../cards-print.test.ts').replace("'./cards-print'", JSON.stringify(print)).replace("'./cards-logic'", JSON.stringify(logic))));
const report = dataUrl(compile('../cards-print-report.ts').replace("'./cards-print'", JSON.stringify(print)));
await import(dataUrl(compile('../cards-print-report.test.ts').replace("'./cards-print-report'", JSON.stringify(report)).replace("'./cards-print'", JSON.stringify(print))));
