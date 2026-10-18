import ts from 'typescript';import{readFileSync}from'node:fs';
const compile=p=>ts.transpileModule(readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const chars=url(compile('../../lib/characters.ts')),catalog=url(compile('./catalog.ts').replace("'@/lib/characters'",JSON.stringify(chars))),policy=url(compile('./policy.ts').replace("'./catalog'",JSON.stringify(catalog)));
await import(url(compile('./policy.test.ts').replace("'./catalog'",JSON.stringify(catalog)).replace("'./policy'",JSON.stringify(policy))));
