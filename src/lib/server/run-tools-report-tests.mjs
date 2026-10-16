import fs from 'node:fs';
import ts from 'typescript';
const compile=filename=>ts.transpileModule(fs.readFileSync(new URL(filename,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const data=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const chars=data(compile('../characters.ts')),submission=data(compile('../assignment-submission.ts'));
const policy=data(compile('./policy.ts').replace("'../characters'",JSON.stringify(chars)).replace("'../assignment-submission'",JSON.stringify(submission)));
const report=data(compile('./lesson-report-policy.ts').replace("'./policy'",JSON.stringify(policy)));
const catalog=data(compile('../tool-catalog.ts')),citations=data(compile('../ai-citations.ts'));
await import(data(compile('./tools-report.test.ts').replace("'./lesson-report-policy'",JSON.stringify(report)).replace("'../tool-catalog'",JSON.stringify(catalog)).replace("'../ai-citations'",JSON.stringify(citations))));
