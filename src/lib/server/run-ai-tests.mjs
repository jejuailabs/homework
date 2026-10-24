import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext},
}).outputText;
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const usageUrl=moduleUrl(compile('../ai-usage.ts'));
await import(moduleUrl(compile('../ai-usage.test.ts').replace("'./ai-usage'",JSON.stringify(usageUrl))));
const characterUrl = moduleUrl(compile('../characters.ts'));
const submissionUrl = moduleUrl(compile('../assignment-submission.ts'));
const policyUrl = moduleUrl(compile('./policy.ts').replace("'../characters'", JSON.stringify(characterUrl)).replace("'../assignment-submission'", JSON.stringify(submissionUrl)));
const aiPolicyUrl = moduleUrl(compile('./ai-policy.ts').replace("'./policy'", JSON.stringify(policyUrl)));
const handwritingUrl=moduleUrl(compile('../handwriting.ts'));
const handwritingPolicyUrl=moduleUrl(compile('./handwriting-policy.ts').replace("'./policy'",JSON.stringify(policyUrl)).replace("'../handwriting'",JSON.stringify(handwritingUrl)));
await import(moduleUrl(compile('./handwriting.test.ts').replace("'../handwriting'",JSON.stringify(handwritingUrl)).replace("'./handwriting-policy'",JSON.stringify(handwritingPolicyUrl))));
const sharpUrl=import.meta.resolve('sharp');
const handwritingImageUrl=moduleUrl(compile('./handwriting-image.ts').replace("'sharp'",JSON.stringify(sharpUrl)).replace("'./policy'",JSON.stringify(policyUrl)).replace("'./handwriting-policy'",JSON.stringify(handwritingPolicyUrl)));
await import(moduleUrl(compile('./handwriting-image.test.ts').replace("'sharp'",JSON.stringify(sharpUrl)).replace("'./handwriting-image'",JSON.stringify(handwritingImageUrl))));
await import(moduleUrl(compile('./ai.test.ts').replace("'./ai-policy'", JSON.stringify(aiPolicyUrl))));
