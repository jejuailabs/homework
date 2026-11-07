import fs from 'node:fs';
import ts from 'typescript';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const ttsUrl = moduleUrl(compile('../tts.ts'));
const coreUrl = moduleUrl(compile('./tts-core.ts').replace("'../tts'", JSON.stringify(ttsUrl)));
const clientUrl = moduleUrl(compile('../tts-client.ts').replace("'./tts'", JSON.stringify(ttsUrl)));
const usageUrl = moduleUrl(compile('../ai-usage.ts'));
await import(moduleUrl(compile('../tts.test.ts').replace("'./tts'", JSON.stringify(ttsUrl)).replace("'./server/tts-core'", JSON.stringify(coreUrl)).replace("'./tts-client'", JSON.stringify(clientUrl)).replace("'./ai-usage'", JSON.stringify(usageUrl))));
