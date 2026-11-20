import {readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

// Composes the 1200x630 link preview (KakaoTalk, search, social cards) from the BERRY DUO
// brand art already in Firebase Storage, and uploads it next to that art.
// Images never ship through the Vercel deploy.
//   node scripts/upload-link-preview.mjs --font <bold Korean .ttf> [--out <preview.png>] [--env <.env.local> --upload]
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const release = JSON.parse(await readFile(resolve(root, 'src/data/berry-brand-storage.json'), 'utf8'));
const NAME = 'link-preview';
const W = 1200, H = 630;

const args = process.argv.slice(2);
const option = name => {const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined;};
const fontfile = option('--font'), out = option('--out'), envPath = option('--env'), upload = args.includes('--upload');
if (!fontfile) throw new Error('Pass --font <bold Korean .ttf>.');

const art = async (name, height) => {
  const url = `https://firebasestorage.googleapis.com/v0/b/${release.bucket}/o/${encodeURIComponent(`${release.prefix}/${name}.webp`)}?alt=media&token=${release.downloadToken}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  return sharp(Buffer.from(await response.arrayBuffer())).trim().resize({height}).png().toBuffer();
};
const text = (value, size, color) => sharp({text: {text: `<span foreground="${color}">${value}</span>`, font: `Malgun Gothic Bold ${size}`, fontfile: resolve(fontfile), rgba: true, dpi: 72}}).png().toBuffer();

const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6e3"/><stop offset="1" stop-color="#ffe3e1"/></linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="900" cy="300" r="330" fill="url(#glow)"/>
  <ellipse cx="900" cy="492" rx="280" ry="62" fill="#cdeedd"/>
  <rect x="80" y="486" width="318" height="64" rx="32" fill="#2f6f66"/>
</svg>`);

const [logo, hero, left, right, farLeft, farRight] = await Promise.all([art('berry-duo-logo', 132), art('blue-hallabong', 360), art('rasp-haenyeo', 150), art('blue-horse', 150), art('rasp-hareubang', 120), art('blue-haenyeo', 120)]);
const [title, line1, line2, address] = await Promise.all([
  text('모두의 교실', 100, '#23423d'),
  text('숙제 · 작품 전시 · AI 비서 베리', 34, '#3f5f59'),
  text('우리 반이 함께 쓰는 온라인 교실', 34, '#3f5f59'),
  text('ourclass.co.kr', 34, '#ffffff'),
]);
const heroMeta = await sharp(hero).metadata();
const addressMeta = await sharp(address).metadata();

const image = await sharp(background).composite([
  {input: farLeft, left: 668, top: 236},
  {input: farRight, left: 1052, top: 236},
  {input: left, left: 664, top: 392},
  {input: right, left: 1022, top: 392},
  {input: hero, left: Math.round(900 - heroMeta.width / 2), top: 150},
  {input: logo, left: 80, top: 62},
  {input: title, left: 78, top: 226},
  {input: line1, left: 82, top: 366},
  {input: line2, left: 82, top: 418},
  {input: address, left: Math.round(239 - addressMeta.width / 2), top: Math.round(518 - addressMeta.height / 2)},
]).png({compressionLevel: 9, palette: false}).toBuffer();
console.log(`${NAME}.png ${W}x${H}, ${(image.length / 1024).toFixed(0)} KB`);
if (out) await writeFile(resolve(out), image);
if (!upload) process.exit(0);

if (envPath) process.loadEnvFile(envPath);
const admin = await import('firebase-admin/app'), storage = await import('firebase-admin/storage');
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
const app = admin.initializeApp({credential: admin.cert(JSON.parse(raw)), storageBucket: release.bucket}, 'link-preview-upload');
// Link scrapers cache by URL, so a redesign should bump the file name rather than overwrite.
await storage.getStorage(app).bucket(release.bucket).file(`${release.prefix}/${NAME}.png`).save(image, {resumable: false, metadata: {contentType: 'image/png', cacheControl: 'public,max-age=86400', metadata: {firebaseStorageDownloadTokens: release.downloadToken}}});
console.log(`Uploaded ${release.prefix}/${NAME}.png`);
