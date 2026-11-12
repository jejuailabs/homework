import {randomUUID} from 'node:crypto';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Uploads the space-mode exhibition textures (Earth, Moon, Saturn and the cat
// sprite) to Firebase Storage. Images never ship through the Vercel deploy.
//   node scripts/upload-space-exhibition-assets.mjs --source <kit>/assets --env <path to .env.local> [--upload]
// Without --upload it only lists what would be sent.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releasePath = resolve(root, 'src/data/space-exhibition-storage.json');
const PREFIX = 'exhibition-modes/space/v1';
const THEMES = ['earth', 'moon', 'saturn'];
const NAME = /^[A-Za-z]+\.webp$/;

const args = process.argv.slice(2);
const option = name => {const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined;};
const source = option('--source'), envPath = option('--env'), upload = args.includes('--upload');
if (!source) throw new Error('Pass --source <space-museum-kit/assets>.');

const files = [];
for (const theme of THEMES) {
  for (const name of (await readdir(resolve(source, theme))).sort()) {
    if (!NAME.test(name)) throw new Error(`Unexpected file: ${theme}/${name}`);
    files.push({local: resolve(source, theme, name), remote: `${PREFIX}/${theme}/${name}`});
  }
}
files.push({local: resolve(source, 'character', 'cat.webp'), remote: `${PREFIX}/character/cat.webp`});
for (const file of files) {
  const bytes = await readFile(file.local);
  if (bytes.subarray(0, 4).toString('latin1') !== 'RIFF' || bytes.subarray(8, 12).toString('latin1') !== 'WEBP') throw new Error(`Not a WebP image: ${file.local}`);
  file.bytes = bytes;
}
const total = files.reduce((sum, file) => sum + file.bytes.length, 0);
console.log(`${files.length} files, ${(total / 1048576).toFixed(1)} MB -> ${PREFIX}`);
if (!upload) process.exit(0);

if (envPath) process.loadEnvFile(envPath);
const admin = await import('firebase-admin/app'), storage = await import('firebase-admin/storage');
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET;
if (!bucketName) throw new Error('Storage bucket is not set.');
const app = admin.initializeApp({credential: admin.cert(JSON.parse(raw)), storageBucket: bucketName}, 'space-exhibition-upload');
const bucket = storage.getStorage(app).bucket(bucketName);
let downloadToken = randomUUID();
try {downloadToken = JSON.parse(await readFile(releasePath, 'utf8')).downloadToken || downloadToken;} catch {}
for (const file of files) {
  await bucket.file(file.remote).save(file.bytes, {resumable: false, metadata: {contentType: 'image/webp', cacheControl: 'public,max-age=31536000,immutable', metadata: {firebaseStorageDownloadTokens: downloadToken}}});
  process.stdout.write('.');
}
await writeFile(releasePath, JSON.stringify({ready: true, bucket: bucketName, prefix: PREFIX, downloadToken}, null, 2) + '\n');
console.log(`\nUploaded. Wrote ${releasePath}`);
