import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve, basename} from 'node:path';
import {fileURLToPath} from 'node:url';

// Offline preparation only. SVGs stay in ignored staging, NEVER in public/.
// node scripts/sync-card-illustrations.mjs /absolute/path/to/vocabulary-svg-3000
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Pass the local vocabulary-svg-3000 artifact directory.');
const source = resolve(process.argv[2]);
const release = JSON.parse(await readFile(resolve(root, 'src/data/card-illustration-storage.json'), 'utf8'));
if (release.ready) throw new Error('Start a new unpublished version before replacing a published image pack.');
if (!/^cards\/vocabulary\/v[1-9]\d*$/.test(release.prefix)) throw new Error('Invalid image pack prefix.');
const manifest = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8'));
if (manifest.files?.length !== 3000) throw new Error('Expected exactly 3,000 illustrations.');
const entries = Object.create(null), pending = [];
for (const item of manifest.files) {
  const filename = basename(item.file), word = item.word.toLowerCase();
  if (!/^[A-Za-z]+(?:-[A-Za-z]+)*\.svg$/.test(filename) || item.file !== `svg/${filename}` || filename !== `${item.word}.svg`) throw new Error(`Unsafe illustration path: ${item.word}`);
  if (entries[word]) throw new Error(`Duplicate headword: ${word}`);
  const svg = await readFile(resolve(source, 'svg', filename));
  if (createHash('sha256').update(svg).digest('hex') !== item.sha256) throw new Error(`Changed source image: ${word}`);
  if (/<(?:script|foreignObject|image)\b|\son\w+\s*=|(?:href|xlink:href)\s*=\s*["'](?!#)/i.test(svg.toString('utf8'))) throw new Error(`Non-static image: ${word}`);
  entries[word] = {file: filename, sense: item.selectedSense, review: item.review, ...(item.meaning !== item.selectedSense ? {meaning: item.meaning} : {})};
  // Normalize authoring-only line-end spaces; the vector drawing is unchanged.
  pending.push({filename, svg: Buffer.from(svg.toString('utf8').replace(/[\t ]+$/gm, ''))});
}
const directory = resolve(root, '.qa/card-illustrations/svg');
await mkdir(directory, {recursive: true});
for (const {filename, svg} of pending) await writeFile(resolve(directory, filename), svg);
await writeFile(resolve(root, 'src/data/card-illustrations.json'), JSON.stringify(entries) + '\n');
const totalBytes = pending.reduce((sum, item) => sum + item.svg.length, 0);
await writeFile(resolve(directory, '../upload-plan.json'), JSON.stringify({
  version: 1, prefix: release.prefix, count: pending.length, totalBytes,
  files: pending.map(({filename, svg}) => ({file: filename, bytes: svg.length, sha256: createHash('sha256').update(svg).digest('hex')})),
}, null, 2) + '\n');
console.log(`Prepared ${pending.length} SVGs (${totalBytes} bytes) in ignored local staging. No upload or public asset copy.`);
