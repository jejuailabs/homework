// Downloads only the explicitly selected, pinned open-source SVG assets and licenses.
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const root = path.resolve(import.meta.dirname, '..');
const source = await fs.readFile(path.join(root, 'src/lib/matching-assets.ts'), 'utf8');
const js = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const {MATCHING_PACKS, NOTO_VERSION, FLAGS_VERSION} = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const assets = [...new Map(MATCHING_PACKS.flatMap(pack => pack.assets).map(asset => [asset.id, asset])).values()];
const outputRoot = path.join(root, 'public/tools/matching');
await fs.mkdir(path.join(outputRoot, 'noto'), {recursive: true});
await fs.mkdir(path.join(outputRoot, 'flags'), {recursive: true});
const jobs = assets.map(asset => ({url: asset.source.sourceUrl.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/'), path: path.join(root, 'public', asset.src), svg: true}));
jobs.push({url: `https://raw.githubusercontent.com/googlefonts/noto-emoji/${NOTO_VERSION}/LICENSE`, path: path.join(outputRoot, 'NOTO-LICENSE.txt')}, {url: `https://raw.githubusercontent.com/lipis/flag-icons/${FLAGS_VERSION}/LICENSE`, path: path.join(outputRoot, 'FLAGS-LICENSE.txt')});
jobs.push({url: 'https://www.apache.org/licenses/LICENSE-2.0.txt', path: path.join(outputRoot, 'APACHE-2.0.txt')}, {url: `https://raw.githubusercontent.com/googlefonts/noto-emoji/${NOTO_VERSION}/README.md`, path: path.join(outputRoot, 'NOTO-README.md')});
let next = 0;
const failures = [];
await Promise.all(Array.from({length: 6}, async () => {
  while (next < jobs.length) {
    const job = jobs[next++];
    try {
      const response = await fetch(job.url, {signal: AbortSignal.timeout(20000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (job.svg && (!text.includes('<svg') || /<script|<foreignObject|\bon\w+=|(?:href|src)=["']https?:/i.test(text))) throw new Error('Unexpected SVG content');
      await fs.writeFile(job.path, text);
    } catch (error) { failures.push({url: job.url, error: error.message}); }
  }
}));
if (failures.length) {console.error(failures); process.exitCode = 1;}
else {
  await fs.writeFile(path.join(outputRoot, 'manifest.json'), JSON.stringify({version: 1, assets}, null, 2));
  console.log(`Downloaded and checked ${assets.length} SVG assets and both licenses.`);
}
