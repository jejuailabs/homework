// Builds the demo's sample artbook with the real class artbook renderer, from the 25 sample works.
//   node scripts/try-demo/make-artbook.mjs <assets dir>     (the folder that holds art/, made by make-art.mjs)
// Writes <assets dir>/artbook/class-artbook.pdf. Page previews (page-01.webp ...) are made from it
// with any PDF rasteriser at about 110 dpi; see TRY_DEMO_IMPLEMENTATION.md.
import ts from 'typescript';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), assets = resolve(process.argv[2] || '.qa/try-demo');
// The build folder stays inside the project so the compiled modules can find pdf-lib.
const build = resolve(root, '.qa/try-demo/build');
mkdirSync(build, {recursive: true}); mkdirSync(resolve(assets, 'artbook'), {recursive: true});
const compile = (from, to, edit = code => code) => writeFileSync(resolve(build, to), edit(ts.transpileModule(readFileSync(resolve(root, from), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText).replace(/from '\.\/(\w+)'/g, "from './$1.mjs'"));
for (const name of ['types', 'policy', 'pdf']) compile(`src/modules/class-artbook/${name}.ts`, name + '.mjs');
compile('src/modules/try-demo/data.ts', 'data.mjs', code => code.replace(/import storage from [^;]+;/, "const storage = {bucket: '', prefix: '', downloadToken: '', ready: false};"));
const load = name => import(pathToFileURL(resolve(build, name)).href);
const {renderClassBook} = await load('pdf.mjs'), {planOutputs, sections} = await load('policy.mjs'), {DEMO_CLASS, rooms, student, works} = await load('data.mjs');

const options = {mode: 'class', title: `${DEMO_CLASS.name} 우리 반 작품집`, cover: 'sage', order: 'student', perPage: 2, names: 'name', story: true, feedback: false, unlinked: false, dedication: '한 해 동안 그린 그림을 한 권에 모았어요. 그림마다 담긴 생각과 마음을 오래 간직해 주세요.'};
const items = works.map(w => {
  const s = student(w.studentId);
  return {key: `${w.roomId}:${w.id}`, roomId: w.roomId, artworkId: w.id, roomTitle: rooms.find(r => r.id === w.roomId).title, title: w.title, description: w.story, feedback: '', date: w.date,
    studentId: s.id, studentName: s.name, studentNumber: s.number, artistName: '', sourcePath: '', version: '', width: 1200, height: 900};
});
const plan = planOutputs(items, options)[0];
const book = {
  title: options.title, className: `${DEMO_CLASS.school} ${DEMO_CLASS.name}`, period: '2026-03-02 ~ 2026-12-31', volumeLabel: '', cover: options.cover, perPage: options.perPage, dedication: options.dedication, createdAt: '2026-11-20T00:00:00.000Z',
  sections: sections(items, plan.indexes, options).map(section => ({heading: section.heading, sub: section.sub, cells: section.indexes.map(i => ({image: i, title: items[i].title, story: items[i].description, feedback: '', meta: [items[i].date, items[i].roomTitle].filter(Boolean).join(' · ')}))})),
};
const font = readFileSync(resolve(root, 'src/modules/digital-artbook/assets/NanumGothic-Regular.ttf'));
// Smaller than the server's 1400px copies: the sample is opened on phones, so it stays light.
const pdf = await renderClassBook(book, font, async i => sharp(resolve(assets, 'art', `${items[i].artworkId}.webp`)).flatten({background: '#ffffff'}).resize({width: 1000}).jpeg({quality: 70}).toBuffer());
writeFileSync(resolve(assets, 'artbook/class-artbook.pdf'), pdf);
console.log(`class-artbook.pdf ${(pdf.length / 1048576).toFixed(1)} MB`);
