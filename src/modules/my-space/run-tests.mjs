import ts from 'typescript';
import {readFileSync} from 'node:fs';

const compile = p => ts.transpileModule(readFileSync(new URL(p, import.meta.url), 'utf8'), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext},
}).outputText;
const url = s => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const replaceImports = (source, imports) => Object.entries(imports).reduce((code, [name, target]) =>
  code.replaceAll(`'${name}'`, JSON.stringify(target)).replaceAll(`"${name}"`, JSON.stringify(target)), source);
const module = (path, imports = {}) => url(replaceImports(compile(path), imports));

const whiteknee = module('./whiteknee.ts');
const newPets = module('./new-pets.ts', {'./whiteknee': whiteknee});
const diaryStickers = module('./diary-stickers.ts');
const chars = module('../../lib/characters.ts');
const catalog = module('./catalog.ts', {
  '@/lib/characters': chars, './whiteknee': whiteknee, './new-pets': newPets, './diary-stickers': diaryStickers,
});
const policy = module('./policy.ts', {'./catalog': catalog, './whiteknee': whiteknee});
const profile = module('./profile.ts', {'./catalog': catalog, './policy': policy, './whiteknee': whiteknee});
await import(module('./policy.test.ts', {'./catalog': catalog, './policy': policy}));
await import(module('./whiteknee.test.ts', {'./catalog': catalog, './policy': policy, './profile': profile, './whiteknee': whiteknee}));

const assets = module('./attachment-assets.ts');
const rig = module('./attachment-rig.ts', {'./attachment-assets': assets});
const juniorAssets = module('./junior-assets.ts');
const juniorWardrobe = module('./junior-wardrobe.ts', {'./junior-assets': juniorAssets, './new-pets': newPets});
const appearance = module('./appearance.ts', {
  '@/lib/characters': chars, './attachment-assets': assets, './attachment-rig': rig,
  './whiteknee': whiteknee, './new-pets': newPets, './junior-assets': juniorAssets,
});
const points = module('../../lib/points-types.ts', {'../modules/my-space/whiteknee': whiteknee});
await import(module('./appearance.test.ts', {
  '@/lib/characters': chars, '@/lib/points-types': points, './catalog': catalog, './policy': policy,
  './appearance': appearance, './attachment-rig': rig, './attachment-assets': assets,
}));

const personality = module('./personality.ts', {'./new-pets': newPets, './whiteknee': whiteknee});
await import(module('./new-pets.test.ts', {
  './new-pets': newPets, './catalog': catalog, './policy': policy, './appearance': appearance, './personality': personality,
}));
await import(module('./junior-wardrobe.test.ts', {
  './new-pets': newPets, './junior-assets': juniorAssets, './junior-wardrobe': juniorWardrobe,
  '@/lib/points-types': points, './appearance': appearance, './catalog': catalog, './policy': policy,
}));

const groups = module('./wardrobe-groups.ts', {'./catalog': catalog, './new-pets': newPets, './whiteknee': whiteknee});
await import(module('./wardrobe-groups.test.ts', {'./wardrobe-groups': groups}));

const diaryCalendar = module('./diary-calendar.ts');
await import(module('./diary-policy.test.ts', {'./catalog': catalog, './policy': policy, './diary-calendar': diaryCalendar}));
