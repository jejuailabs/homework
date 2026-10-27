import ts from 'typescript';
import {readFileSync} from 'node:fs';
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext},
}).outputText;
const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const ink = url(compile('./diary-ink.ts').replace("'perfect-freehand'", JSON.stringify(import.meta.resolve('perfect-freehand'))));
await import(url(compile('./diary-ink.test.ts').replace("'./diary-ink'", JSON.stringify(ink))));
