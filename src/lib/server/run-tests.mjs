import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const characterUrl = 'data:text/javascript;base64,' + Buffer.from(compile('../characters.ts')).toString('base64');
const submissionUrl = 'data:text/javascript;base64,' + Buffer.from(compile('../assignment-submission.ts')).toString('base64');
const rosterUrl = 'data:text/javascript;base64,' + Buffer.from(compile('../roster.ts')).toString('base64');
const rosterTest = compile('../roster.test.ts').replace("'./roster'", JSON.stringify(rosterUrl));
await import('data:text/javascript;base64,' + Buffer.from(rosterTest).toString('base64'));
const worldLayoutUrl = 'data:text/javascript;base64,' + Buffer.from(compile('../exhibition-world-layout.ts')).toString('base64');
const worldLayoutTest = compile('../exhibition-world-layout.test.ts').replace("'./exhibition-world-layout'", JSON.stringify(worldLayoutUrl));
await import('data:text/javascript;base64,' + Buffer.from(worldLayoutTest).toString('base64'));
const policyUrl = 'data:text/javascript;base64,' + Buffer.from(compile('./policy.ts').replace("'../characters'", JSON.stringify(characterUrl)).replace("'../assignment-submission'", JSON.stringify(submissionUrl))).toString('base64');
const testCode = compile('./policy.test.ts').replace("'./policy'", JSON.stringify(policyUrl)).replace("'../assignment-submission'", JSON.stringify(submissionUrl));
await import('data:text/javascript;base64,' + Buffer.from(testCode).toString('base64'));
await import('./run-ai-tests.mjs');
await import('./run-exhibition-tests.mjs');
await import('./run-teacher-dashboard-tests.mjs');
const dashboardPeriodUrl = 'data:text/javascript;base64,' + Buffer.from(compile('../teacher-dashboard-period.ts')).toString('base64');
const dashboardPeriodTest = compile('../teacher-dashboard-period.test.ts').replace("'./teacher-dashboard-period'", JSON.stringify(dashboardPeriodUrl));
await import('data:text/javascript;base64,' + Buffer.from(dashboardPeriodTest).toString('base64'));
