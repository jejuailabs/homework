import {createHash, randomUUID} from 'node:crypto';
import {readFile, writeFile, readdir, lstat, mkdir, open, rename, rm} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

// Offline by default. --approve-billing records the operator's explicit gate;
// it does not replace the user's prior informed approval of costs and scope.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staging = resolve(root, '.qa/card-illustrations');
const receiptPath = resolve(staging, 'receipt.json');
const releasePath = resolve(root, 'src/data/card-illustration-storage.json');
const CONTENT_TYPE = 'image/svg+xml';
const CACHE_CONTROL = 'public,max-age=31536000,immutable';
const FILE_PATTERN = /^[A-Za-z]+(?:-[A-Za-z]+)*\.svg$/;
const PREFIX_PATTERN = /^cards\/vocabulary\/v[1-9]\d*$/;
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_PATTERN = /^[a-f0-9]{64}$/;
class SafeError extends Error {}
const fail = message => {throw new SafeError(message);};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const validBucket = value => typeof value === 'string' && value.length >= 3 && value.length <= 222
  && !/^\d+\.\d+\.\d+\.\d+$/.test(value)
  && value.split('.').every(label => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));

function argumentsOf(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (!['--bucket', '--prefix', '--upload', '--approve-billing', '--help'].includes(name) || Object.hasOwn(options, name)) fail('Unknown or duplicate option. Use --help.');
    if (name === '--bucket' || name === '--prefix') {
      const value = args[++index];
      if (!value || value.startsWith('--')) fail(`Missing value for ${name}.`);
      options[name] = value;
    } else options[name] = true;
  }
  if (options['--help']) return options;
  if (!validBucket(options['--bucket'])) fail('Pass --bucket with a valid bucket name, without gs:// or a URL.');
  if (options['--prefix'] && !PREFIX_PATTERN.test(options['--prefix'])) fail('Prefix must be cards/vocabulary/vN.');
  if (options['--upload'] !== options['--approve-billing']) fail('Uploading requires both --upload and --approve-billing after prior user cost approval.');
  return options;
}

// Accept only the static SVG vocabulary used by this vetted pack. No CSS,
// event handlers, external resources, entity declarations, or executable tags.
const tags = new Set(['svg', 'g', 'defs', 'title', 'desc', 'path', 'rect', 'circle', 'ellipse', 'clipPath', 'linearGradient', 'radialGradient', 'stop']);
const attributes = new Set(['xmlns', 'viewBox', 'width', 'height', 'id', 'role', 'aria-labelledby', 'clip-path', 'cx', 'cy', 'd', 'fill', 'gradientTransform', 'gradientUnits', 'offset', 'opacity', 'r', 'rx', 'ry', 'stop-color', 'stop-opacity', 'stroke', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'stroke-width', 'transform', 'x', 'x1', 'x2', 'y', 'y1', 'y2']);
function decoded(value, file) {
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(value)) fail(`Invalid SVG entity: ${file}`);
  return value.replace(/&(#x[\da-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, code) => {
    if (!code.startsWith('#')) return {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"}[code];
    const number = code.startsWith('#x') ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    if (!number || number > 0x10ffff || number >= 0xd800 && number <= 0xdfff) fail(`Invalid SVG character: ${file}`);
    return String.fromCodePoint(number);
  });
}
function staticSvg(bytes, file) {
  let text;
  try {text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);} catch {fail(`SVG is not UTF-8: ${file}`);}
  text = text.replace(/<!--[\s\S]*?-->/g, comment => {if (comment.slice(4, -3).includes('--')) fail(`Malformed SVG comment: ${file}`); return '';});
  if (/<!|<\?|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) fail(`Non-static SVG declaration: ${file}`);
  const chunks = text.match(/<[^>]*>|[^<]+/g) ?? [], stack = [], ids = new Set(), refs = [];
  if (chunks.join('') !== text) fail(`Malformed SVG: ${file}`);
  let roots = 0;
  for (const chunk of chunks) {
    if (!chunk.startsWith('<')) {
      decoded(chunk, file);
      if (chunk.trim() && !['title', 'desc'].includes(stack.at(-1))) fail(`Unexpected SVG text: ${file}`);
      continue;
    }
    const closing = chunk.match(/^<\/([A-Za-z][\w:-]*)\s*>$/);
    if (closing) {if (stack.pop() !== closing[1]) fail(`Unbalanced SVG: ${file}`); continue;}
    const opening = chunk.match(/^<([A-Za-z][\w:-]*)([\s\S]*?)(\/?)>$/);
    if (!opening || !tags.has(opening[1])) fail(`Unsupported SVG element: ${file}`);
    const [, tag, raw, selfClosing] = opening, values = {};
    const matcher = /\s+([A-Za-z_][\w:.-]*)\s*=\s*(["'])(.*?)\2/gy;
    let end = 0, match;
    while ((match = matcher.exec(raw))) {
      const name = match[1], value = decoded(match[3], file);
      if (!attributes.has(name) || Object.hasOwn(values, name) || /[<>\\]|\/\*/.test(value)) fail(`Unsupported SVG attribute: ${file}`);
      if (name !== 'xmlns' && /(?:https?:|data:|javascript:|\/\/|@import)/i.test(value)) fail(`External SVG resource: ${file}`);
      if (/url\s*\(/i.test(value)) {
        const reference = value.match(/^url\(\s*#([A-Za-z_][\w:.-]*)\s*\)$/);
        if (!reference || !['fill', 'stroke', 'clip-path'].includes(name)) fail(`Unsafe SVG reference: ${file}`);
        refs.push(reference[1]);
      }
      values[name] = value; end = matcher.lastIndex;
    }
    if (raw.slice(end).trim()) fail(`Malformed SVG attributes: ${file}`);
    if (values.id) {if (ids.has(values.id)) fail(`Duplicate SVG ID: ${file}`); ids.add(values.id);}
    if (!stack.length) {
      if (tag !== 'svg' || ++roots !== 1 || values.xmlns !== 'http://www.w3.org/2000/svg' || values.viewBox?.trim().replace(/\s+/g, ' ') !== '0 0 512 512') fail(`Invalid SVG root: ${file}`);
    } else if (tag === 'svg' || values.xmlns) fail(`Nested SVG namespace: ${file}`);
    if (!selfClosing) stack.push(tag);
  }
  if (roots !== 1 || stack.length || refs.some(id => !ids.has(id))) fail(`Incomplete SVG: ${file}`);
}

async function localPack(options) {
  const plan = JSON.parse(await readFile(resolve(staging, 'upload-plan.json'), 'utf8'));
  const catalog = JSON.parse(await readFile(resolve(root, 'src/data/card-illustrations.json'), 'utf8'));
  if (plan.version !== 1 || plan.count !== 3000 || !Array.isArray(plan.files) || plan.files.length !== 3000 || !PREFIX_PATTERN.test(plan.prefix)) fail('Expected the version-1 upload plan with exactly 3,000 SVGs.');
  if (options['--prefix'] && options['--prefix'] !== plan.prefix) fail('Requested prefix differs from the upload plan.');
  const listed = new Set(), catalogFiles = new Set(Object.values(catalog).map(entry => entry.file));
  if (Object.keys(catalog).length !== 3000 || catalogFiles.size !== 3000) fail('The illustration catalog must map exactly 3,000 unique files.');
  const files = [];
  for (const item of plan.files) {
    if (!FILE_PATTERN.test(item.file) || listed.has(item.file) || !catalogFiles.has(item.file) || !Number.isSafeInteger(item.bytes) || item.bytes <= 0 || !SHA_PATTERN.test(item.sha256)) fail('Invalid or duplicate upload-plan entry.');
    listed.add(item.file);
    const path = resolve(staging, 'svg', item.file), stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== item.bytes) fail(`Changed or unsafe source file: ${item.file}`);
    const bytes = await readFile(path);
    if (bytes.length !== item.bytes || hash(bytes) !== item.sha256) fail(`Source hash/size mismatch: ${item.file}`);
    staticSvg(bytes, item.file);
    files.push({file: item.file, bytes: item.bytes, sha256: item.sha256, content: bytes});
  }
  const contents = await readdir(resolve(staging, 'svg'), {withFileTypes: true});
  if (contents.length !== 3000 || contents.some(entry => !entry.isFile() || !listed.has(entry.name))) fail('The staging SVG directory differs from the exact upload plan.');
  const totalBytes = files.reduce((sum, item) => sum + item.bytes, 0);
  if (plan.totalBytes !== totalBytes) fail('Upload-plan totalBytes differs from the local files.');
  files.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  const manifestHash = hash(JSON.stringify({version: 1, prefix: plan.prefix, count: 3000, totalBytes, files: files.map(({file, bytes, sha256}) => ({file, bytes, sha256}))}));
  return {files, totalBytes, prefix: plan.prefix, manifestHash};
}

async function atomicJson(path, value) {
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value, null, 2) + '\n', {flag: 'wx', mode: 0o600});
    // Windows: renaming over a file an indexer or antivirus just opened fails with EPERM/EBUSY for a moment.
    for (let attempt = 0; ; attempt++) {
      try {await rename(temp, path); break;}
      catch (error) {if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error; await delay(50 * (attempt + 1));}
    }
  }
  finally {await rm(temp, {force: true}).catch(() => {});}
}
async function readReceipt(bucket, pack) {
  let receipt;
  try {receipt = JSON.parse(await readFile(receiptPath, 'utf8'));}
  catch (error) {if (error.code !== 'ENOENT') fail('Cannot read the existing local upload receipt; it was not replaced.');}
  if (receipt) {
    if (receipt.version !== 1 || receipt.bucket !== bucket || receipt.prefix !== pack.prefix || receipt.manifestHash !== pack.manifestHash || !TOKEN_PATTERN.test(receipt.downloadToken) || !receipt.files || typeof receipt.files !== 'object' || Array.isArray(receipt.files)) fail('Receipt target, token, or manifest differs. Do not reuse this release prefix.');
    const byFile = new Map(pack.files.map(file => [file.file, file]));
    for (const [name, record] of Object.entries(receipt.files)) {
      const file = byFile.get(name);
      if (!file || record.sha256 !== file.sha256 || record.bytes !== file.bytes || !/^\d+$/.test(record.generation)) fail('The local upload receipt has inconsistent object records.');
    }
    return receipt;
  }
  return {version: 1, bucket, prefix: pack.prefix, manifestHash: pack.manifestHash, downloadToken: randomUUID(), createdAt: new Date().toISOString(), files: {}};
}
function metadataMatches(metadata, item, receipt) {
  if (String(metadata.size) !== String(item.bytes) || metadata.contentType !== CONTENT_TYPE || metadata.cacheControl !== CACHE_CONTROL
    || metadata.metadata?.sha256 !== item.sha256 || metadata.metadata?.firebaseStorageDownloadTokens !== receipt.downloadToken || !/^\d+$/.test(String(metadata.generation))) fail(`Remote object mismatch; nothing was overwritten: ${item.file}`);
  return String(metadata.generation);
}
async function retried(operation, file) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {return await operation();}
    catch (error) {
      if (error instanceof SafeError || Number(error.code) === 412) throw error;
      if (attempt < 2 && [408, 429, 500, 502, 503, 504, 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(typeof error.code === 'string' && /^\d+$/.test(error.code) ? Number(error.code) : error.code)) {await delay(500 * 2 ** attempt); continue;}
      fail(`Cloud operation failed for ${file} (${error?.code ?? error?.name ?? 'unknown'}); stopped without publishing the release. Check credentials, permissions, and connectivity.`);
    }
  }
}

async function upload(pack, bucketName) {
  await mkdir(staging, {recursive: true});
  const lockPath = resolve(staging, 'upload.lock');
  let lock;
  try {lock = await open(lockPath, 'wx', 0o600);} catch {fail('An upload lock already exists. Confirm the earlier process has stopped before removing that local lock.');}
  let adminApp, deleteApp;
  try {
    await lock.writeFile(JSON.stringify({pid: process.pid, startedAt: new Date().toISOString()}));
    const receipt = await readReceipt(bucketName, pack);
    await atomicJson(receiptPath, receipt); // The shared token survives a stopped upload.
    try {process.loadEnvFile(resolve(root, '.env.local'));} catch (error) {if (error.code !== 'ENOENT') fail('Cannot load local upload credentials.');}
    if (process.env.FIREBASE_STORAGE_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST) fail('Storage emulator configuration is set. A cloud release cannot be verified against an emulator.');
    const admin = await import('firebase-admin/app'), storage = await import('firebase-admin/storage');
    deleteApp = admin.deleteApp;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON, credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const credential = raw ? admin.cert(JSON.parse(raw)) : credentialPath ? admin.cert(credentialPath) : admin.applicationDefault();
    adminApp = admin.initializeApp({credential, projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, storageBucket: bucketName}, 'card-illustrations-upload');
    const bucket = storage.getStorage(adminApp).bucket(bucketName);
    // The public client setting prevents layered automatic retries. Our own
    // bounded retry loop and create-only generation condition remain in charge.
    Object.assign(bucket.storage.retryOptions, {autoRetry: false, maxRetries: 0});
    let position = 0, completed = 0, failure, writes = Promise.resolve();
    const worker = async () => {
      while (!failure && position < pack.files.length) {
        const item = pack.files[position++], file = bucket.file(`${pack.prefix}/${item.file}`);
        try {
          let metadata;
          if (receipt.files[item.file]) {
            [metadata] = await retried(() => file.getMetadata(), item.file);
            if (String(metadata.generation) !== receipt.files[item.file].generation) fail(`Remote generation changed: ${item.file}`);
          } else {
            try {
              await retried(() => file.save(item.content, {resumable: false, validation: 'crc32c', timeout: 30000, preconditionOpts: {ifGenerationMatch: 0}, metadata: {contentType: CONTENT_TYPE, cacheControl: CACHE_CONTROL, storageClass: 'STANDARD', metadata: {sha256: item.sha256, firebaseStorageDownloadTokens: receipt.downloadToken}}}), item.file);
              metadata = file.metadata;
              if (!metadata?.generation) [metadata] = await retried(() => file.getMetadata(), item.file);
            } catch (error) {
              if (Number(error.code) !== 412) throw error;
              [metadata] = await retried(() => file.getMetadata(), item.file);
            }
          }
          const generation = metadataMatches(metadata, item, receipt);
          receipt.files[item.file] = {bytes: item.bytes, sha256: item.sha256, generation, verifiedAt: new Date().toISOString()};
          receipt.updatedAt = new Date().toISOString();
          writes = writes.then(() => atomicJson(receiptPath, receipt));
          await writes;
          if (++completed % 100 === 0) console.log(`Verified ${completed}/3000 objects.`);
        } catch (error) {failure ??= error;}
      }
    };
    await Promise.all(Array.from({length: 4}, () => worker()));
    await writes;
    if (failure) throw failure;
    if (completed !== 3000 || Object.keys(receipt.files).length !== 3000) fail('Incomplete upload; the release config was not published.');
    await atomicJson(releasePath, {ready: true, bucket: bucketName, prefix: pack.prefix, downloadToken: receipt.downloadToken});
    console.log('Verified all 3,000 objects and published the local ready config. No application deployment was performed.');
  } finally {
    if (adminApp && deleteApp) await deleteApp(adminApp).catch(() => {});
    await lock.close();
    await rm(lockPath, {force: true});
  }
}

async function main() {
  const options = argumentsOf(process.argv.slice(2));
  if (options['--help']) {
    console.log('Offline validation: node scripts/upload-card-illustrations.mjs --bucket <bucket> [--prefix cards/vocabulary/v1]\nApproved upload only: add --upload --approve-billing after the user approves the specific storage, operations, and ongoing download costs.\nReads .qa/card-illustrations/upload-plan.json and svg/. Dry-run never loads credentials, imports Firebase, or contacts the network.');
    return;
  }
  const pack = await localPack(options);
  console.log(`Offline validation passed: ${pack.files.length} SVGs, ${pack.totalBytes} bytes, bucket ${options['--bucket']}, prefix ${pack.prefix}.`);
  if (!options['--upload']) {console.log('Dry-run only. No credentials loaded, remote operations, receipt changes, or ready-config changes.'); return;}
  await upload(pack, options['--bucket']);
}
main().catch(error => {console.error(error instanceof SafeError ? error.message : `Local validation or upload failed (${error?.code ?? error?.name ?? 'unknown'}). No credentials or server error payloads are printed. The release is published only after all objects are verified.`); process.exitCode = 1;});
