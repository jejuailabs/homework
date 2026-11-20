import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

// Cuts the BERRY DUO wardrobe sheets into 34 companion sprites and uploads them to Firebase Storage.
// Images never ship through the Vercel deploy; cells keep their native 512px size (no resampling).
//   node scripts/upload-berry-pet-assets.mjs --source <folder> [--out <folder>] [--env <.env.local>] [--upload]
// <folder> holds blueberry-01.png, blueberry-02.png, raspberry-01.png, raspberry-02.png and base/berry-duo-base.png.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = resolve(root, 'src/modules/my-space/berry.ts');
const manifestPath = resolve(root, 'docs/berry-pet-assets.json');
const brandPath = resolve(root, 'src/data/berry-brand-storage.json');
const PREFIX = 'my-space/berry/v1', CELL = 512;
const SHEETS = [['haenyeo', 'hallabong', 'horse', 'hareubang', 'canola', 'camellia', 'olle', 'gotjawal'], ['pampas', 'kite', 'overalls', 'cardigan', 'beret', 'hairpin', 'bowtie', 'scarf']];
const PETS = [['berry-blue', 'blueberry', 0], ['berry-rasp', 'raspberry', 1]];

const args = process.argv.slice(2);
const option = name => {const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined;};
const source = option('--source'), out = option('--out'), envPath = option('--env'), upload = args.includes('--upload');
if (!source) throw new Error('Pass --source <folder>.');

const cell = (file, index, cols) => sharp(file).extract({left: (index % cols) * CELL, top: Math.floor(index / cols) * CELL, width: CELL, height: CELL}).webp({quality: 92, alphaQuality: 100, effort: 4}).toBuffer();
const files = [];
for (const [pet, sheet, baseCell] of PETS) {
  files.push({pet, state: 'bare', source: 'base/berry-duo-base.png', cell: baseCell, bytes: await cell(resolve(source, 'base/berry-duo-base.png'), baseCell, 2)});
  for (const [n, states] of SHEETS.entries()) for (const [index, state] of states.entries()) {
    const name = `${sheet}-0${n + 1}.png`;
    files.push({pet, state, source: name, cell: index, bytes: await cell(resolve(source, name), index, 4)});
  }
}
for (const file of files) {
  const meta = await sharp(file.bytes).metadata();
  if (meta.width !== CELL || meta.height !== CELL || !meta.hasAlpha) throw new Error(`${file.pet}/${file.state} is not a ${CELL}px transparent cell.`);
  file.remote = `${PREFIX}/${file.pet}/${file.state}.webp`;
  if (out) {await mkdir(resolve(out, file.pet), {recursive: true}); await writeFile(resolve(out, file.pet, `${file.state}.webp`), file.bytes);}
}
await writeFile(manifestPath, JSON.stringify({version: 1, prefix: PREFIX, files: files.map(f => ({path: f.remote, width: CELL, height: CELL, bytes: f.bytes.length, sha256: createHash('sha256').update(f.bytes).digest('hex'), source: f.source, cell: f.cell}))}, null, 2) + '\n');
console.log(`${files.length} files, ${(files.reduce((s, f) => s + f.bytes.length, 0) / 1024).toFixed(0)} KB -> ${PREFIX}`);
if (!upload) process.exit(0);

if (envPath) process.loadEnvFile(envPath);
const admin = await import('firebase-admin/app'), storage = await import('firebase-admin/storage');
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET;
if (!bucketName) throw new Error('Storage bucket is not set.');
const app = admin.initializeApp({credential: admin.cert(JSON.parse(raw)), storageBucket: bucketName}, 'berry-pet-upload');
const bucket = storage.getStorage(app).bucket(bucketName);
// Share the brand art's download token so the app carries one public token for all berry images.
let token = randomUUID();
try {token = JSON.parse(await readFile(brandPath, 'utf8')).downloadToken || token;} catch {}
for (const file of files) {
  await bucket.file(file.remote).save(file.bytes, {resumable: false, metadata: {contentType: 'image/webp', cacheControl: 'public,max-age=31536000,immutable', metadata: {firebaseStorageDownloadTokens: token}}});
  process.stdout.write('.');
}
const code = await readFile(modulePath, 'utf8');
const line = `export const BERRY_STORAGE = {bucket: '${bucketName}', prefix: '${PREFIX}', token: '${token}'} as const;`;
if (!/^export const BERRY_STORAGE = .*$/m.test(code)) throw new Error('BERRY_STORAGE line not found in berry.ts.');
await writeFile(modulePath, code.replace(/^export const BERRY_STORAGE = .*$/m, line));
console.log(`\nUploaded. Updated ${modulePath}`);
