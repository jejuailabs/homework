// Render the real components locally. No browser, cloud service or account is used.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import sharp from 'sharp';
import test from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url), root = fileURLToPath(new URL('../../../', import.meta.url)), cache = new Map();
function load(filename) {
  let file = path.resolve(root, filename);
  if (file.endsWith('.css')) return {};
  if (!path.extname(file)) file += fs.existsSync(file + '.ts') ? '.ts' : '.tsx';
  if (cache.has(file)) return cache.get(file).exports;
  const module = {exports: {}}; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require', 'module', 'exports', code)(id => id.startsWith('@/') ? load('src/' + id.slice(2)) : id.startsWith('.') ? load(path.resolve(path.dirname(file), id)) : require(id), module, module.exports);
  return module.exports;
}
const Avatar = load('src/components/character-avatar.tsx').default;
const Editor = load('src/modules/my-space/room-editor.tsx').default;
const {marinePets, marineSetItems, marineSprite} = load('src/modules/my-space/marine.ts');
const {seahorsePets, seahorseSetItems, seahorseSprite} = load('src/modules/my-space/seahorse.ts');
const {defaultRoom, starterSpaceIds} = load('src/modules/my-space/catalog.ts');
const {shopCatalog} = load('src/modules/my-space/shop-catalog.ts');

test('every complete look renders exactly one character image even with old accessory selections', () => {
  for (const pet of [...seahorsePets, ...marinePets]) for (const set of (pet.family ? marineSetItems.filter(s => s.family === pet.family) : seahorseSetItems)) {
    const html = renderToStaticMarkup(React.createElement(Avatar, {character: pet.id, spaceOutfit: {body: set.id}, outfit: {head: 'seahorse-head-beanie', face: 'seahorse-face-glasses', neck: 'seahorse-neck-scarf'}, presentation: 'scene'}));
    assert.equal((html.match(/<img /g) || []).length, 1);
    assert(html.includes(`src="${pet.family ? marineSprite(pet.id, set.id) : seahorseSprite(pet.id, 'rest', set.id)}"`));
    assert(!html.includes('data-attachment'));
    assert(!html.includes('seahorse-accessories'));
  }
});
test('friend picker shows 20 complete sets, clothing/accessory details and basic selection', () => {
  const owned = [...starterSpaceIds, ...seahorsePets.map(p => p.id), ...seahorseSetItems.map(s => s.id), ...marinePets.map(p => p.id), ...marineSetItems.map(s => s.id)];
  for (const pet of [...seahorsePets, ...marinePets]) {
    const html = renderToStaticMarkup(React.createElement(Editor, {initial: {...defaultRoom(), pet: pet.id, outfit: {body: pet.family ? pet.family+'-set-scholar' : 'seahorse-set-scholar'}}, owned, profile: {earned: 500, adopted: {}, wardrobeOwned: ['seahorse-face-glasses']}, enabled: true, mode: 'friends', onSaved() {}, onDecorate: async () => {}}));
    assert(html.includes('완성 착장 고르기')); assert(html.includes('기본 모습'));
    assert.equal((html.match(/class="ms-set-details"/g) || []).length, 20);
    assert.equal((html.match(/<dt>옷<\/dt>/g) || []).length, 20);
    assert.equal((html.match(/<dt>액세서리<\/dt>/g) || []).length, 20);
    assert(!html.includes('ms-accessory-picker')); assert(!html.includes('whiteknee-pose-picker'));
    for (const set of (pet.family ? marineSetItems.filter(s => s.family === pet.family) : seahorseSetItems)) assert(html.includes(pet.family ? marineSprite(pet.id, set.id) : seahorseSprite(pet.id, 'rest', set.id)));
  }
  const sea = shopCatalog.filter(item => item.id.startsWith('seahorse-'));
  assert.equal(sea.length, 20); assert(sea.every(item => item.id.startsWith('seahorse-set-')));
});
test('all 168 sprites preserve transparency and leave padding around their silhouettes', async () => {
  for (const pet of [...seahorsePets, ...marinePets]) for (const body of [undefined, ...(pet.family ? marineSetItems.filter(s => s.family === pet.family) : seahorseSetItems).map(s => s.id)]) {
    const file = path.join(root, 'public' + (pet.family ? marineSprite(pet.id, body) : seahorseSprite(pet.id, 'rest', body)));
    const {data, info} = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    const alpha = i => data[i * 4 + 3];
    for (let x = 0; x < info.width; x++) {assert.equal(alpha(x), 0); assert.equal(alpha((info.height - 1) * info.width + x), 0);}
    for (let y = 0; y < info.height; y++) {assert.equal(alpha(y * info.width), 0); assert.equal(alpha(y * info.width + info.width - 1), 0);}
    assert(data.some((v, i) => i % 4 === 3 && v > 240));
  }
});
