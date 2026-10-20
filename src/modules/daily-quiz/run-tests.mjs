import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const vocabulary = moduleUrl(compile('./vocabulary.ts'));
const curriculum = moduleUrl(compile('./curriculum.ts'));
const engine = moduleUrl(compile('./engine.ts').replace("'./vocabulary'", JSON.stringify(vocabulary)).replace("'./curriculum'", JSON.stringify(curriculum)));
await import(moduleUrl(compile('./engine.test.ts').replace("'./curriculum'", JSON.stringify(curriculum)).replace("'./engine'", JSON.stringify(engine)).replace("'./vocabulary'", JSON.stringify(vocabulary))));
