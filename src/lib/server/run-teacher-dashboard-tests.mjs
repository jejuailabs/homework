import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const characterUrl = moduleUrl(compile('../characters.ts'));
const submissionUrl = moduleUrl(compile('../assignment-submission.ts'));
const policyUrl = moduleUrl(compile('./policy.ts').replace("'../characters'", JSON.stringify(characterUrl)).replace("'../assignment-submission'", JSON.stringify(submissionUrl)));
const dashboardUrl = moduleUrl(compile('./teacher-dashboard-policy.ts').replace("'./policy'", JSON.stringify(policyUrl)).replace("'../assignment-submission'", JSON.stringify(submissionUrl)));
await import(moduleUrl(compile('./teacher-dashboard-policy.test.ts').replace("'./teacher-dashboard-policy'", JSON.stringify(dashboardUrl))));
const periodUrl = moduleUrl(compile('../teacher-dashboard-period.ts'));
const detailsUrl = moduleUrl(compile('./teacher-dashboard-details-policy.ts').replace("'../characters'", JSON.stringify(characterUrl)).replace("'../teacher-dashboard-period'", JSON.stringify(periodUrl)).replace("'./policy'", JSON.stringify(policyUrl)).replace("'./teacher-dashboard-policy'", JSON.stringify(dashboardUrl)));
await import(moduleUrl(compile('./teacher-dashboard-details-policy.test.ts').replace("'./teacher-dashboard-details-policy'", JSON.stringify(detailsUrl))));
