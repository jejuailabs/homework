import fs from 'node:fs';
import ts from 'typescript';
const compile=filename=>ts.transpileModule(fs.readFileSync(new URL(filename,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const url=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
const core=url(compile('./neighborhood.ts'));
await import(url(compile('./neighborhood.test.ts').replace("'./neighborhood'",JSON.stringify(core))));
await import('./server/neighborhood.test.mjs');
