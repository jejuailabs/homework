import {randomUUID} from 'node:crypto';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Uploads the login-free demo's sample pictures and sample artbook to Firebase Storage.
// Images never ship through the Vercel deploy.
//   node scripts/try-demo/upload-assets.mjs --source <assets dir> --env <path to .env.local> [--only shots] [--upload]
// <assets dir> holds art/*.webp (make-art.mjs), artbook/* (make-artbook.mjs) shots/*.webp (3D room screenshots) and video/* (screen recordings).
// --only <folder> sends just that folder with the existing token. Without --upload it only lists.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const releasePath = resolve(root, 'src/data/try-demo-storage.json');
const PREFIX = 'try-demo/v1';
const TYPES = {webp: 'image/webp', pdf: 'application/pdf', mp4: 'video/mp4', m4a: 'audio/mp4'};

const args = process.argv.slice(2);
const option = name => {const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined;};
const source = option('--source'), envPath = option('--env'), only = option('--only'), upload = args.includes('--upload');
if (!source) throw new Error('Pass --source <assets dir>.');

const files = [];
for (const folder of only ? [only] : ['art', 'artbook']) {
  if (!['art', 'artbook', 'shots', 'video', 'docent'].includes(folder)) throw new Error(`Unknown folder: ${folder}`);
  for (const name of (await readdir(resolve(source, folder))).sort()) {
    const type = TYPES[name.split('.').pop()];
    if (!type || !/^[a-z0-9-]+\.(webp|pdf|mp4|m4a)$/.test(name)) throw new Error(`Unexpected file: ${folder}/${name}`);
    files.push({remote: `${PREFIX}/${folder}/${name}`, type, bytes: await readFile(resolve(source, folder, name))});
  }
}
if (!only && files.filter(f => f.remote.includes('/art/')).length !== 50) throw new Error('Expected 25 pictures and 25 thumbnails in art/.');
const total = files.reduce((sum, file) => sum + file.bytes.length, 0);
console.log(`${files.length} files, ${(total / 1048576).toFixed(1)} MB -> ${PREFIX}`);
if (!upload) process.exit(0);

if (envPath) process.loadEnvFile(envPath);
const admin = await import('firebase-admin/app'), storage = await import('firebase-admin/storage');
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET;
if (!bucketName) throw new Error('Storage bucket is not set.');
const app = admin.initializeApp({credential: admin.cert(JSON.parse(raw)), storageBucket: bucketName}, 'try-demo-upload');
const bucket = storage.getStorage(app).bucket(bucketName);
let downloadToken = randomUUID();
try {downloadToken = JSON.parse(await readFile(releasePath, 'utf8')).downloadToken || downloadToken;} catch {}
for (const file of files) {
  // A new version gets a new prefix (v2), so these can be cached for good.
  await bucket.file(file.remote).save(file.bytes, {resumable: false, metadata: {contentType: file.type, cacheControl: 'public,max-age=31536000,immutable', metadata: {firebaseStorageDownloadTokens: downloadToken}}});
  process.stdout.write('.');
}
await writeFile(releasePath, JSON.stringify({ready: true, bucket: bucketName, prefix: PREFIX, downloadToken}, null, 2) + '\n');
console.log(`\nUploaded. Wrote ${releasePath}`);
