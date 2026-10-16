import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
import test from 'node:test';
const compile = filename => ts.transpileModule(fs.readFileSync(new URL(filename, import.meta.url), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const url = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const deck = url(compile('./matching-deck.ts'));
const assets = url(compile('./matching-assets.ts'));
await import(url(compile('./matching-deck.test.ts').replace("'./matching-deck'", JSON.stringify(deck)).replace("'./matching-assets'", JSON.stringify(assets))));
const print = url(compile('./matching-print.ts').replace("'./matching-deck'", JSON.stringify(deck)));
await import(url(compile('./matching-print.test.ts').replace("'./matching-deck'", JSON.stringify(deck)).replace("'./matching-assets'", JSON.stringify(assets)).replace("'./matching-print'", JSON.stringify(print))));
test('all packaged SVGs and license files exist and contain no external or active content', async () => {
  const {MATCHING_PACKS} = await import(assets);
  for (const asset of MATCHING_PACKS.flatMap(pack => pack.assets)) {
    const text = fs.readFileSync(new URL('../../public' + asset.src, import.meta.url), 'utf8');
    assert.ok(text.includes('<svg'), asset.id);
    assert.ok(!/<script|<foreignObject|\bon\w+=|(?:href|src)=["']https?:/i.test(text), asset.id);
  }
  for (const filename of ['NOTICE.txt', 'NOTO-LICENSE.txt', 'NOTO-README.md', 'APACHE-2.0.txt', 'FLAGS-LICENSE.txt', 'manifest.json']) assert.ok(fs.statSync(new URL('../../public/tools/matching/' + filename, import.meta.url)).size > 50);
});
