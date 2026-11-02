// Existing suites isolate TypeScript with data URLs. Resolve the new leaf modules
// once so those suites continue exercising the real catalog and server policies.
import fs from 'node:fs';
import ts from 'typescript';
const cache = new Map();
const root = new URL('../src/modules/my-space/', import.meta.url);
export function seahorseTestImports(code) {
  return code.replace(/(['"])([^'"]*\/(?:seahorse|seahorse-assets|seahorse-layout|wardrobe-compatibility))\1/g, (match, quote, specifier) => {
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return match;
    const name = specifier.split('/').at(-1);
    if (!cache.has(name)) {
      const source = fs.readFileSync(new URL(name + '.ts', root), 'utf8');
      const compiled = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
      cache.set(name, 'data:text/javascript;base64,' + Buffer.from(seahorseTestImports(compiled)).toString('base64'));
    }
    return JSON.stringify(cache.get(name));
  });
}
