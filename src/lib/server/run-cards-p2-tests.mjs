// 카드놀이 P2 순수 규칙 테스트: 다른 반 옮기기·이월, 학습 일정.
import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const dataUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const logic = dataUrl(compile('../cards-logic.ts').replace("'./cards-drill'", JSON.stringify(dataUrl(compile('../cards-drill.ts')))));
const transfer = dataUrl(compile('../cards-transfer.ts'));
await import(dataUrl(compile('../cards-transfer.test.ts').replace("'./cards-transfer'", JSON.stringify(transfer))));
const planner = dataUrl(compile('../cards-planner.ts').replace("'./cards-logic'", JSON.stringify(logic)));
await import(dataUrl(compile('../cards-planner.test.ts').replace("'./cards-planner'", JSON.stringify(planner))));
const sharing = dataUrl(compile('../cards-sharing.ts'));
await import(dataUrl(compile('../cards-sharing.test.ts').replace("'./cards-sharing'", JSON.stringify(sharing))));
const chunks = dataUrl(compile('../cards-chunks.ts'));
await import(dataUrl(compile('../cards-chunks.test.ts').replace("'./cards-chunks'", JSON.stringify(chunks))));
await import(dataUrl(compile('../cards-drill.test.ts').replace("'./cards-drill'", JSON.stringify(dataUrl(compile('../cards-drill.ts')))).replace("'./cards-logic'", JSON.stringify(logic))));
