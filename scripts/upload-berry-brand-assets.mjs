import {randomUUID} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

// Uploads the BERRY DUO brand art (header logo + 8 Jeju pose cutouts) to Firebase Storage.
// Images never ship through the Vercel deploy.
//   node scripts/upload-berry-brand-assets.mjs --source <folder> --env <path to .env.local> [--upload]
// <folder> holds berry-duo-logo.png and the eight <color>-<pose>.webp cutouts.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releasePath = resolve(root, 'src/data/berry-brand-storage.json');
const PREFIX = 'branding/berry-duo/v1';
const NAMES = ['berry-duo-logo', ...['blue', 'rasp'].flatMap(color => ['hallabong', 'haenyeo', 'horse', 'hareubang'].map(pose => `${color}-${pose}`))];

const args = process.argv.slice(2);
const option = name => {const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined;};
const source = option('--source'), envPath = option('--env'), upload = args.includes('--upload');
if (!source) throw new Error('Pass --source <folder>.');

const files = [];
for (const name of NAMES) {
  let input;
  try {input = await readFile(resolve(source, `${name}.webp`));} catch {input = await readFile(resolve(source, `${name}.png`));}
  const bytes = await sharp(input).webp({quality: 90, alphaQuality: 100, effort: 6}).toBuffer();
  files.push({remote: `${PREFIX}/${name}.webp`, bytes});
}
console.log(`${files.length} files, ${(files.reduce((s, f) => s + f.bytes.length, 0) / 1024).toFixed(0)} KB -> ${PREFIX}`);
if (!upload) process.exit(0);

if (envPath) process.loadEnvFile(envPath);
const admin = await import('firebase-admin/app'), storage = await import('firebase-admin/storage');
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET;
if (!bucketName) throw new Error('Storage bucket is not set.');
const app = admin.initializeApp({credential: admin.cert(JSON.parse(raw)), storageBucket: bucketName}, 'berry-brand-upload');
const bucket = storage.getStorage(app).bucket(bucketName);
let downloadToken = randomUUID();
try {downloadToken = JSON.parse(await readFile(releasePath, 'utf8')).downloadToken || downloadToken;} catch {}
for (const file of files) {
  await bucket.file(file.remote).save(file.bytes, {resumable: false, metadata: {contentType: 'image/webp', cacheControl: 'public,max-age=31536000,immutable', metadata: {firebaseStorageDownloadTokens: downloadToken}}});
  process.stdout.write('.');
}
await writeFile(releasePath, JSON.stringify({bucket: bucketName, prefix: PREFIX, downloadToken}, null, 2) + '\n');
console.log(`\nUploaded. Wrote ${releasePath}`);
