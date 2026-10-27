import sharp from 'sharp';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Technical asset preparation only: alpha-preserving crop, resize and atlas packing.
// Usage: node .../prepare-prototype-assets.mjs --background FILE --player FILE --npc FILE
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!['--background', '--player', '--npc'].includes(process.argv[i]) || !process.argv[i + 1]) {
    throw new Error('Expected --background FILE --player FILE --npc FILE.');
  }
  args.set(process.argv[i], resolve(process.argv[i + 1]));
}
for (const key of ['--background', '--player', '--npc']) if (!args.has(key)) throw new Error(`Missing ${key}.`);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'prototype', 'assets');
const cache = join(root, '.cache');
await mkdir(output, {recursive: true});
await mkdir(cache, {recursive: true});

function alphaBounds(data, width, height, threshold = 16) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] <= threshold) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error('An animation cell has no visible sprite.');
  // Preserve antialiased silhouette pixels just outside the detected solid bounds.
  left = Math.max(0, left - 3); top = Math.max(0, top - 3);
  right = Math.min(width - 1, right + 3); bottom = Math.min(height - 1, bottom + 3);
  return {left, top, width: right - left + 1, height: bottom - top + 1};
}

function spriteRegions(data, width, height) {
  // Generated rows may drift across nominal cell boundaries. Detect actual
  // silhouettes instead of slicing ears/feet at exact mathematical grid lines.
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const regions = [];
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
    regions.push({left, top, width: right - left + 1, height: bottom - top + 1});
  }
  if (regions.length !== 12) throw new Error(`Expected 12 separate sprite silhouettes, found ${regions.length}.`);
  regions.sort((a, b) => a.top - b.top);
  return Array.from({length: 4}, (_, row) => regions.slice(row * 3, row * 3 + 3).sort((a, b) => a.left - b.left)).flat();
}

const playerSource = args.get('--player');
const metadata = await sharp(playerSource).metadata();
if (!metadata.hasAlpha) throw new Error('Player sheet must have a real alpha channel.');
const columns = 3, rows = 4, frameWidth = 160, frameHeight = 200;
const anchorX = 80, anchorY = 192;
const player = await sharp(playerSource).ensureAlpha().raw().toBuffer({resolveWithObject: true});
const cells = spriteRegions(player.data, metadata.width, metadata.height).map((bounds, index) => ({
  row: Math.floor(index / columns), column: index % columns,
  data: player.data, width: metadata.width, height: metadata.height, bounds,
}));
const scale = Math.min(144 / Math.max(...cells.map(cell => cell.bounds.width)), 180 / Math.max(...cells.map(cell => cell.bounds.height)));
const composites = [];
for (const cell of cells) {
  const width = Math.max(1, Math.round(cell.bounds.width * scale));
  const height = Math.max(1, Math.round(cell.bounds.height * scale));
  const input = await sharp(cell.data, {raw: {width: cell.width, height: cell.height, channels: 4}})
    .extract(cell.bounds).resize(width, height, {kernel: 'lanczos3'}).png().toBuffer();
  composites.push({input, left: cell.column * frameWidth + anchorX - Math.round(width / 2), top: cell.row * frameHeight + anchorY - height});
}
await sharp({create: {width: frameWidth * columns, height: frameHeight * rows, channels: 4, background: '#00000000'}})
  .composite(composites).png().toFile(join(output, 'player.png'));

const npcSource = args.get('--npc');
const npc = await sharp(npcSource).ensureAlpha().raw().toBuffer({resolveWithObject: true});
const npcBounds = alphaBounds(npc.data, npc.info.width, npc.info.height);
await sharp(npc.data, {raw: {width: npc.info.width, height: npc.info.height, channels: 4}})
  .extract(npcBounds).resize({height: 256}).png().toFile(join(output, 'guide.png'));
await sharp(args.get('--background')).resize(1600, 1000, {fit: 'fill'}).webp({quality: 92, effort: 5}).toFile(join(output, 'village.webp'));

const manifest = {
  background: 'village.webp', player: 'player.png', npc: 'guide.png',
  sprites: {frameWidth, frameHeight, columns, rows, anchorX, anchorY, rowKeys: ['down', 'left', 'right', 'up'], frameKeys: ['idle', 'step-left', 'step-right']},
};
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await sharp(join(output, 'player.png')).flatten({background: '#65d4a0'}).png().toFile(join(cache, 'prototype-player-check.png'));
await writeFile(join(cache, 'prototype-asset-check.json'), JSON.stringify({sourceSize: {width: metadata.width, height: metadata.height}, scale, cellBounds: cells.map(({row, column, bounds}) => ({row, column, bounds})), manifest}, null, 2));
console.log(JSON.stringify({output, frames: cells.length, scale, manifest}, null, 2));
