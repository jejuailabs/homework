// 카드놀이 P2 순수 규칙 테스트: 다른 반 옮기기·이월.
import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const dataUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const transfer = dataUrl(compile('../cards-transfer.ts'));
await import(dataUrl(compile('../cards-transfer.test.ts').replace("'./cards-transfer'", JSON.stringify(transfer))));
