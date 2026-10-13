import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const dataUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const characters = dataUrl(compile('../characters.ts'));
const submission = dataUrl(compile('../assignment-submission.ts'));
const policy = dataUrl(compile('./policy.ts').replace("'../characters'", JSON.stringify(characters)).replace("'../assignment-submission'", JSON.stringify(submission)));
const types = dataUrl(compile('../participation-types.ts'));
const participation = dataUrl(compile('./participation-policy.ts').replace("'./policy'", JSON.stringify(policy)).replace("'../participation-types'", JSON.stringify(types)).replace("'../characters'", JSON.stringify(characters)));
await import(dataUrl(compile('./participation.test.ts').replace("'./participation-policy'", JSON.stringify(participation))));
