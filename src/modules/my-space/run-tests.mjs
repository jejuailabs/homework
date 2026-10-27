import ts from 'typescript';import{readFileSync}from'node:fs';
const compile=p=>ts.transpileModule(readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const newPets=url(compile('./new-pets.ts')),juniorAssets=url(compile('./junior-assets.ts'));
const juniorWardrobe=url(compile('./junior-wardrobe.ts').replace("'./junior-assets'",JSON.stringify(juniorAssets)).replace("'./new-pets'",JSON.stringify(newPets)));
const chars=url(compile('../../lib/characters.ts')),catalog=url(compile('./catalog.ts').replace("'./new-pets'",JSON.stringify(newPets)).replace("'@/lib/characters'",JSON.stringify(chars))),policy=url(compile('./policy.ts').replace("'./catalog'",JSON.stringify(catalog)));
await import(url(compile('./policy.test.ts').replace("'./catalog'",JSON.stringify(catalog)).replace("'./policy'",JSON.stringify(policy))));
const assets=url(compile('./attachment-assets.ts')),rig=url(compile('./attachment-rig.ts').replace("'./attachment-assets'",JSON.stringify(assets))),appearance=url(compile('./appearance.ts').replace("'./junior-assets'",JSON.stringify(juniorAssets)).replace("'./new-pets'",JSON.stringify(newPets)).replace("'@/lib/characters'",JSON.stringify(chars)).replace("'./attachment-assets'",JSON.stringify(assets)).replace("'./attachment-rig'",JSON.stringify(rig))),points=url(compile('../../lib/points-types.ts'));
await import(url(compile('./appearance.test.ts').replace("'@/lib/characters'",JSON.stringify(chars)).replace("'@/lib/points-types'",JSON.stringify(points)).replace("'./catalog'",JSON.stringify(catalog)).replace("'./policy'",JSON.stringify(policy)).replace("'./appearance'",JSON.stringify(appearance)).replace("'./attachment-rig'",JSON.stringify(rig)).replace("'./attachment-assets'",JSON.stringify(assets))));
const personality=url(compile('./personality.ts').replace("'./new-pets'",JSON.stringify(newPets)));
await import(url(compile('./new-pets.test.ts').replace("'./new-pets'",JSON.stringify(newPets)).replace("'./catalog'",JSON.stringify(catalog)).replace("'./policy'",JSON.stringify(policy)).replace("'./appearance'",JSON.stringify(appearance)).replace("'./personality'",JSON.stringify(personality))));

await import(url(compile('./junior-wardrobe.test.ts').replace("'./new-pets'",JSON.stringify(newPets)).replace("'./junior-assets'",JSON.stringify(juniorAssets)).replace("'./junior-wardrobe'",JSON.stringify(juniorWardrobe)).replace("'@/lib/points-types'",JSON.stringify(points)).replace("'./appearance'",JSON.stringify(appearance)).replace("'./catalog'",JSON.stringify(catalog)).replace("'./policy'",JSON.stringify(policy))));

const groups=url(compile('./wardrobe-groups.ts').replace("'./catalog'",JSON.stringify(catalog)).replace("'./new-pets'",JSON.stringify(newPets)));
await import(url(compile('./wardrobe-groups.test.ts').replace("'./wardrobe-groups'",JSON.stringify(groups))));
