import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const types = moduleUrl(compile('./types.ts'));
const mentions = moduleUrl(compile('./mentions.ts'));
const csv = moduleUrl(compile('./csv.ts').replace("'./mentions'", JSON.stringify(mentions)));
const policy = moduleUrl(compile('./policy.ts').replace("'./csv'", JSON.stringify(csv)).replace("'./types'", JSON.stringify(types)).replaceAll("'./mentions'", JSON.stringify(mentions)));
await import(moduleUrl(compile('./policy.test.ts').replace("'./policy'", JSON.stringify(policy))));
