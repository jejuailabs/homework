import fs from 'node:fs';
import ts from 'typescript';
const compile=path=>ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const transfer=url(compile('../upload-transfer.ts'));
await import(url(compile('../upload-transfer.test.ts').replace("'./upload-transfer'",JSON.stringify(transfer))));
