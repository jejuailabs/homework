import fs from 'node:fs';
import ts from 'typescript';

const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext},
}).outputText;
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const characters = moduleUrl(compile('../characters.ts'));
const submissions = moduleUrl(compile('../assignment-submission.ts'));
const policy = moduleUrl(compile('./policy.ts').replace("'../characters'", JSON.stringify(characters)).replace("'../assignment-submission'", JSON.stringify(submissions)));
// Authentication is replaced before importing: this suite cannot initialize
// Firebase, use real credentials or make a network request through the route.
const auth = moduleUrl('export async function requireTeacher() { throw new Error("Offline test must inject authentication"); }');
const dictionary = moduleUrl(compile('./korean-dictionary.ts')
  .replace("import 'server-only';", '')
  .replace("'./auth'", JSON.stringify(auth))
  .replace("'./policy'", JSON.stringify(policy)));
await import(moduleUrl(compile('./korean-dictionary.test.ts')
  .replace("'./policy'", JSON.stringify(policy))
  .replace("'./korean-dictionary'", JSON.stringify(dictionary))));
