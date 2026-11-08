import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext},
}).outputText;
const dataUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const jsonModule = filename => dataUrl(`export default ${fs.readFileSync(new URL(filename, import.meta.url), 'utf8')}`);
const art = dataUrl(compile('../card-illustrations.ts')
  .replace("'../data/card-illustrations.json'", JSON.stringify(jsonModule('../../data/card-illustrations.json')))
  .replace("'../data/card-illustration-storage.json'", JSON.stringify(jsonModule('../../data/card-illustration-storage.json'))));
process.chdir(fileURLToPath(new URL('../../../', import.meta.url)));
try {
  await import(dataUrl(compile('../card-illustrations.test.ts')
    .replace("'./card-illustrations'", JSON.stringify(art))
    .replace("'../data/cards-base-vocab.json'", JSON.stringify(jsonModule('../../data/cards-base-vocab.json')))));
} catch (error) {
  // Data-URL stacks contain the complete data files; retain only useful failure details.
  console.error(error.name, error.message);
  process.exitCode = 1;
}
