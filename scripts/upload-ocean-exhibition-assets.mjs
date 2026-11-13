import {randomUUID} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

// Uploads the ocean-mode exhibition textures (산호 · 켈프 · 심해 · 라군) to Firebase Storage.
// Images never ship through the Vercel deploy. The file list lives in
// src/lib/ocean-exhibition/data.json; PNG maps from the kit are converted to WebP here.
//   node scripts/upload-ocean-exhibition-assets.mjs --source <ocean-museum-kit> --env <path to .env.local> [--upload]
// Without --upload it only converts and reports what would be sent.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releasePath = resolve(root, 'src/data/ocean-exhibition-storage.json');
const data = JSON.parse(await readFile(resolve(root, 'src/lib/ocean-exhibition/data.json'), 'utf8'));
const PREFIX = 'exhibition-modes/ocean/v1';

const args = process.argv.slice(2);
const option = name => {const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined;};
const source = option('--source'), envPath = option('--env'), upload = args.includes('--upload');
if (!source) throw new Error('Pass --source <ocean-museum-kit>.');

const quality = remote => remote.includes('-normal') ? 88 : remote.includes('-roughness') ? 80 : remote.startsWith('water/') ? 90 : 84;
const files = [];
for (const [remote, spec] of Object.entries(data.files)) {
  if (!/^[a-z0-9/_.-]+\.webp$/.test(remote)) throw new Error(`Unexpected name: ${remote}`);
  const input = await readFile(resolve(source, spec.from));
  let bytes = input;
  if (!spec.from.endsWith('.webp') || spec.resize) {
    let image = sharp(input);
    if (spec.resize) image = image.resize({width: spec.resize, height: spec.resize, fit: 'inside', withoutEnlargement: true});
    bytes = await image.webp({quality: quality(remote), effort: 5}).toBuffer();
  }
  if (bytes.subarray(0, 4).toString('latin1') !== 'RIFF' || bytes.subarray(8, 12).toString('latin1') !== 'WEBP') throw new Error(`Not a WebP image: ${remote}`);
  files.push({remote: `${PREFIX}/${remote}`, bytes});
}
const total = files.reduce((sum, file) => sum + file.bytes.length, 0);
console.log(`${files.length} files, ${(total / 1048576).toFixed(1)} MB -> ${PREFIX}`);
for (const theme of Object.keys(data.themes)) {
  const size = files.filter(file => file.remote.includes(`/${theme}`) || file.remote.includes(`${theme}-`)).reduce((sum, file) => sum + file.bytes.length, 0);
  console.log(`  ${theme}: ${(size / 1048576).toFixed(1)} MB`);
}
if (!upload) process.exit(0);

if (envPath) process.loadEnvFile(envPath);
const admin = await import('firebase-admin/app'), storage = await import('firebase-admin/storage');
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET;
if (!bucketName) throw new Error('Storage bucket is not set.');
const app = admin.initializeApp({credential: admin.cert(JSON.parse(raw)), storageBucket: bucketName}, 'ocean-exhibition-upload');
const bucket = storage.getStorage(app).bucket(bucketName);
let downloadToken = randomUUID();
try {downloadToken = JSON.parse(await readFile(releasePath, 'utf8')).downloadToken || downloadToken;} catch {}
for (const file of files) {
  await bucket.file(file.remote).save(file.bytes, {resumable: false, metadata: {contentType: 'image/webp', cacheControl: 'public,max-age=31536000,immutable', metadata: {firebaseStorageDownloadTokens: downloadToken}}});
  process.stdout.write('.');
}
await writeFile(releasePath, JSON.stringify({ready: true, bucket: bucketName, prefix: PREFIX, downloadToken}, null, 2) + '\n');
console.log(`\nUploaded. Wrote ${releasePath}`);
