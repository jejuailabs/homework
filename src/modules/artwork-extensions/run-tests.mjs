import ts from 'typescript';import {readFileSync} from 'node:fs';
const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const types=url(compile('./types.ts')),wav=url(compile('../voice-caption/wav.ts')),policy=url(compile('../warm-guestbook/policy.ts').replace("'../artwork-extensions/types'",JSON.stringify(types)));
await import(url(compile('./policy.test.ts').replace("'./types'",JSON.stringify(types)).replace("'../warm-guestbook/policy'",JSON.stringify(policy)).replace("'../voice-caption/wav'",JSON.stringify(wav))));

await import('./run-review-tests.mjs');
await import('../voice-caption/run-tests.mjs');
