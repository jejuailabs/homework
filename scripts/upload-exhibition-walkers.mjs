import {randomUUID} from 'node:crypto';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Uploads the 3D visitor models of the exhibition rooms (one .glb per pet, each with a `walk` clip)
// to Firebase Storage. Models never ship through the Vercel deploy.
//   node scripts/upload-exhibition-walkers.mjs --source <folder of web-sized .glb> --env <path to .env.local> [--upload]
// Without --upload it only lists what would be sent.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releasePath = resolve(root, 'src/data/exhibition-walker-storage.json');
const PREFIX = 'exhibition-modes/walkers/v1';
const NAME = /^[a-z]+(-[a-z]+)+\.glb$/;
const EXPECTED = 33, MAX_BYTES = 3 * 1048576;

const args = process.argv.slice(2);
const option = name => {const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined;};
const source = option('--source'), envPath = option('--env'), upload = args.includes('--upload');
if (!source) throw new Error('Pass --source <folder of web-sized .glb files>.');

const files = [];
for (const name of (await readdir(source)).sort()) {
  if (!NAME.test(name)) throw new Error(`Unexpected file: ${name}`);
  const bytes = await readFile(resolve(source, name));
  if (bytes.subarray(0, 4).toString('latin1') !== 'glTF') throw new Error(`Not a binary glTF: ${name}`);
  if (bytes.length > MAX_BYTES) throw new Error(`Too large for the web (${(bytes.length / 1048576).toFixed(1)} MB): ${name}`);
  files.push({remote: `${PREFIX}/${name}`, bytes});
}
if (files.length !== EXPECTED) throw new Error(`Expected ${EXPECTED} models, found ${files.length}.`);
const total = files.reduce((sum, file) => sum + file.bytes.length, 0);
console.log(`${files.length} files, ${(total / 1048576).toFixed(1)} MB -> ${PREFIX}`);
if (!upload) process.exit(0);

if (envPath) process.loadEnvFile(envPath);
const admin = await import('firebase-admin/app'), storage = await import('firebase-admin/storage');
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET;
if (!bucketName) throw new Error('Storage bucket is not set.');
const app = admin.initializeApp({credential: admin.cert(JSON.parse(raw)), storageBucket: bucketName}, 'exhibition-walker-upload');
const bucket = storage.getStorage(app).bucket(bucketName);
let downloadToken = randomUUID();
try {downloadToken = JSON.parse(await readFile(releasePath, 'utf8')).downloadToken || downloadToken;} catch {}
for (const file of files) {
  await bucket.file(file.remote).save(file.bytes, {resumable: false, metadata: {contentType: 'model/gltf-binary', cacheControl: 'public,max-age=31536000,immutable', metadata: {firebaseStorageDownloadTokens: downloadToken}}});
  process.stdout.write('.');
}
await writeFile(releasePath, JSON.stringify({ready: true, bucket: bucketName, prefix: PREFIX, downloadToken}, null, 2) + '\n');
console.log(`\nUploaded. Wrote ${releasePath}`);
