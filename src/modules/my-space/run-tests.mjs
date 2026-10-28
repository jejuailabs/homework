import ts from 'typescript';
import {readFileSync} from 'node:fs';

const compile = p => ts.transpileModule(readFileSync(new URL(p, import.meta.url), 'utf8'), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext},
}).outputText;
const url = s => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const whiteknee = url(compile('./whiteknee.ts'));
const chars = url(compile('../../lib/characters.ts'));
const catalog = url(compile('./catalog.ts').replace("'@/lib/characters'", JSON.stringify(chars)).replace("'./whiteknee'", JSON.stringify(whiteknee)));
const policy = url(compile('./policy.ts').replace("'./catalog'", JSON.stringify(catalog)).replace("'./whiteknee'", JSON.stringify(whiteknee)));
const profile = url(compile('./profile.ts').replace("'./catalog'", JSON.stringify(catalog)).replace("'./policy'", JSON.stringify(policy)).replace("'./whiteknee'", JSON.stringify(whiteknee)));
await import(url(compile('./policy.test.ts').replace("'./catalog'", JSON.stringify(catalog)).replace("'./policy'", JSON.stringify(policy))));
await import(url(compile('./whiteknee.test.ts').replace("'./catalog'", JSON.stringify(catalog)).replace("'./policy'", JSON.stringify(policy)).replace("'./profile'", JSON.stringify(profile)).replace("'./whiteknee'", JSON.stringify(whiteknee))));

const assets = url(compile('./attachment-assets.ts'));
const rig = url(compile('./attachment-rig.ts').replace("'./attachment-assets'", JSON.stringify(assets)));
const appearance = url(compile('./appearance.ts').replace("'@/lib/characters'", JSON.stringify(chars)).replace("'./attachment-assets'", JSON.stringify(assets)).replace("'./attachment-rig'", JSON.stringify(rig)).replace("'./whiteknee'", JSON.stringify(whiteknee)));
const points = url(compile('../../lib/points-types.ts').replace("'../modules/my-space/whiteknee'", JSON.stringify(whiteknee)));
await import(url(compile('./appearance.test.ts').replace("'@/lib/characters'", JSON.stringify(chars)).replace("'@/lib/points-types'", JSON.stringify(points)).replace("'./catalog'", JSON.stringify(catalog)).replace("'./policy'", JSON.stringify(policy)).replace("'./appearance'", JSON.stringify(appearance)).replace("'./attachment-rig'", JSON.stringify(rig)).replace("'./attachment-assets'", JSON.stringify(assets))));
