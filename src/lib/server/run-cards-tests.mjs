import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const dataUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const characters = dataUrl(compile('../characters.ts'));
const submission = dataUrl(compile('../assignment-submission.ts'));
const policy = dataUrl(compile('./policy.ts').replace("'../characters'", JSON.stringify(characters)).replace("'../assignment-submission'", JSON.stringify(submission)));
const logic = dataUrl(compile('../cards-logic.ts'));
const planner = dataUrl(compile('../cards-planner.ts').replace("'./cards-logic'", JSON.stringify(logic)));
const cards = dataUrl(compile('./cards-policy.ts').replace("'./policy'", JSON.stringify(policy)).replace("'../cards-logic'", JSON.stringify(logic)).replace("'../cards-planner'", JSON.stringify(planner)));
await import(dataUrl(compile('../cards-review.test.ts').replace("'./cards-logic'", JSON.stringify(logic))));
await import(dataUrl(compile('../cards-summary.test.ts').replace("'./cards-summary'", JSON.stringify(dataUrl(compile('../cards-summary.ts').replace("'./cards-logic'", JSON.stringify(logic)))))));
await import(dataUrl(compile('./cards-policy.test.ts').replace("'./cards-policy'", JSON.stringify(cards)).replace("'../cards-logic'", JSON.stringify(logic))));
const draftRules = dataUrl(compile('../cards-ai-draft.ts'));
await import(dataUrl(compile('../cards-ai-draft.test.ts').replace("'./cards-ai-draft'", JSON.stringify(draftRules))));
const aiPolicy = dataUrl(compile('./ai-policy.ts').replace("'./policy'", JSON.stringify(policy)));
globalThis.__cardsAiMeter = { calls: [] };
const meter = dataUrl('export async function runMeteredAi(uid, tool, model, fingerprint, operation, classId) { globalThis.__cardsAiMeter.calls.push({ uid, tool, classId }); return operation(() => {}); }');
const cardsAi = dataUrl(compile('./cards-ai.ts').replace("import 'server-only';", '').replace("'../cards-ai-draft'", JSON.stringify(draftRules)).replace("'./ai'", JSON.stringify(meter)).replace("'./ai-policy'", JSON.stringify(aiPolicy)).replace("'./policy'", JSON.stringify(policy)));
await import(dataUrl(compile('./cards-ai.test.ts').replace("'./cards-ai'", JSON.stringify(cardsAi))));
await import(dataUrl(compile('../cards-games.test.ts').replace("'./cards-games'", JSON.stringify(dataUrl(compile('../cards-games.ts').replace("'./cards-logic'", JSON.stringify(logic)))))));
