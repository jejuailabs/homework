import sharp from 'sharp';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Technical alpha-preserving crop/resize only. No generated scene is repainted.
// Usage: --school FILE --postoffice FILE --homes FILE --props FILE
const inputs = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!['--school', '--postoffice', '--homes', '--props'].includes(process.argv[i]) || !process.argv[i + 1]) {
    throw new Error('Expected --school FILE --postoffice FILE --homes FILE --props FILE.');
  }
  inputs.set(process.argv[i], resolve(process.argv[i + 1]));
}
for (const key of ['--school', '--postoffice', '--homes', '--props']) if (!inputs.has(key)) throw new Error(`Missing ${key}.`);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'continuous/assets'), cache = join(root, '.cache');
await mkdir(output, {recursive: true});
await mkdir(cache, {recursive: true});

function silhouettes(data, width, height, expected, columns) {
  const visited = new Uint8Array(width * height), queue = new Int32Array(width * height), found = [];
  // Ignore detached sub-pixel alpha specks when finding each sprite's boundary.
  // The extracted image keeps its original alpha and RGB inside that boundary.
  for (let start = 0; start < width * height; start++) {
    if (visited[start] || data[start * 4 + 3] < 64) continue;
    let head = 0, tail = 1, left = width, top = height, right = -1, bottom = -1;
    queue[0] = start; visited[start] = 1;
    while (head < tail) {
      const index = queue[head++], x = index % width, y = Math.floor(index / width);
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
          const next = ny * width + nx;
          if (visited[next] || data[next * 4 + 3] < 64) continue;
          visited[next] = 1; queue[tail++] = next;
        }
      }
    }
    if (tail < width * height * 0.001) continue;
    left = Math.max(0, left - 3); top = Math.max(0, top - 3);
    right = Math.min(width - 1, right + 3); bottom = Math.min(height - 1, bottom + 3);
    found.push({left, top, width: right - left + 1, height: bottom - top + 1});
  }
  if (found.length !== expected) throw new Error(`Expected ${expected} separate silhouettes; found ${found.length}.`);
  found.sort((a, b) => a.top - b.top);
  return Array.from({length: expected / columns}, (_, row) => found.slice(row * columns, (row + 1) * columns).sort((a, b) => a.left - b.left)).flat();
}

const groups = [
  {input: '--school', keys: ['school'], columns: 1, height: 640},
  {input: '--postoffice', keys: ['postoffice'], columns: 1, height: 640},
  {input: '--homes', keys: ['homeLavender', 'homePeach', 'shop', 'homeTeal'], columns: 2, height: 420},
  {input: '--props', keys: ['tree', 'mandarin', 'lamp', 'bench', 'planter', 'mailbox'], columns: 3, height: 320},
];
const manifest = {files: {}, dimensions: {}, anchors: {}, preparation: 'Alpha-connected silhouettes, 3px source padding, Lanczos resize; original alpha preserved.'};
const checks = [];
for (const group of groups) {
  const metadata = await sharp(inputs.get(group.input)).metadata();
  if (!metadata.hasAlpha) throw new Error(`${group.input} requires genuine transparency.`);
  const {data, info} = await sharp(inputs.get(group.input)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const regions = silhouettes(data, info.width, info.height, group.keys.length, group.columns);
  for (let i = 0; i < group.keys.length; i++) {
    const key = group.keys[i], filename = `${key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}.webp`;
    const result = await sharp(data, {raw: {width: info.width, height: info.height, channels: 4}})
      .extract(regions[i]).resize({height: group.height, kernel: 'lanczos3'}).webp({quality: 94, alphaQuality: 100, effort: 5}).toFile(join(output, filename));
    manifest.files[key] = filename;
    manifest.dimensions[key] = {width: result.width, height: result.height};
    manifest.anchors[key] = {x: result.width / 2, y: result.height - 2};
    checks.push({key, sourceBounds: regions[i], width: result.width, height: result.height, bytes: result.size});
  }
}
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const previewColumns = 4, cellWidth = 300, cellHeight = 300;
const previews = [];
for (let i = 0; i < checks.length; i++) {
  const entry = checks[i], input = await sharp(join(output, manifest.files[entry.key])).resize(276, 266, {fit: 'inside'}).png().toBuffer({resolveWithObject: true});
  previews.push({input: input.data, left: i % previewColumns * cellWidth + Math.round((cellWidth - input.info.width) / 2), top: Math.floor(i / previewColumns) * cellHeight + Math.round((cellHeight - input.info.height) / 2)});
}
await sharp({create: {width: previewColumns * cellWidth, height: Math.ceil(checks.length / previewColumns) * cellHeight, channels: 4, background: '#75cbb1'}})
  .composite(previews).png().toFile(join(cache, 'continuous-assets-check.png'));
await writeFile(join(cache, 'continuous-assets-check.json'), JSON.stringify(checks, null, 2) + '\n');
console.log(JSON.stringify({output, files: manifest.files, totalBytes: checks.reduce((sum, entry) => sum + entry.bytes, 0)}, null, 2));
