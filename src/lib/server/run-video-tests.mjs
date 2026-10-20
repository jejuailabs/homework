import fs from 'node:fs';import ts from 'typescript';
const compile=path=>ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
await import(url(compile('../video-submission.test.ts').replace("'./video-submission'",JSON.stringify(url(compile('../video-submission.ts'))))));
await import('../../../workers/video/media.test.mjs');
await import('../../../workers/video/exporter.test.mjs');
