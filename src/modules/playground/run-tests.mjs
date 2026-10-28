import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const cache = new Map();
function moduleUrl(filename) {
  const absolute = path.resolve(filename);
  if (cache.has(absolute)) return cache.get(absolute);
  const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
  const resolved = compiled.replace(/(from\s+)(['"])(\.[^'"]+)\2/g, (_all, prefix, _quote, specifier) => {
    let target = path.resolve(path.dirname(absolute), specifier);
    if (!path.extname(target)) target += '.ts';
    return prefix + JSON.stringify(moduleUrl(target));
  });
  const url = 'data:text/javascript;base64,' + Buffer.from(resolved).toString('base64');
  cache.set(absolute, url); return url;
}
const root = path.dirname(fileURLToPath(import.meta.url));
await import(moduleUrl(path.join(root, 'engine.test.ts')));
await import(moduleUrl(path.join(root, 'room-machine.test.ts')));
await import(moduleUrl(path.join(root, 'ai-questions.test.ts')));
