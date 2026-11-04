import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import test from 'node:test';
import {courtyardDecor, decorTheme, galleryDecor, lobbyDecor, nineSlice, plaqueSize} from './exhibition-decor';

const files = (value: Record<string, string | string[]>) => Object.values(value).flat();

test('every decor image the scene asks for exists in public, for every room theme', () => {
  const names = [...files(lobbyDecor()), ...files(courtyardDecor()), ...(['cozy', 'forest', 'sky', 'ocean'] as const).flatMap(theme => files(galleryDecor(theme)))];
  for (const name of new Set(names)) assert(existsSync(`public/exhibition-world/v1/${name}.webp`), name);
  assert.equal(decorTheme('volcano'), 'cozy');
  assert.equal(galleryDecor('sky').stickers.length, 5);
});

test('nine-slice keeps the band width in metres and the corners in the image', () => {
  const {positions, uvs, indices} = nineSlice(4, 2, 0.3, 0.3, 0.2, 0.2);
  assert.equal(positions.length, 16 * 3);
  assert.equal(indices.length, 9 * 6);
  const xs = [0, 1, 2, 3].map(col => positions[col * 3]);
  assert.deepEqual(xs.map(v => Math.round(v * 100) / 100), [-2, -1.7, 1.7, 2]);
  assert.deepEqual([0, 1, 2, 3].map(col => uvs[col * 2]), [0, 0.2, 0.8, 1]);
  // A frame smaller than two bands never folds over itself.
  const tiny = nineSlice(0.4, 0.4, 0.3, 0.3, 0.2, 0.2).positions;
  assert(tiny[3] <= tiny[6]);
  // Zero vertical band: a three-slice plaque.
  const plaque = nineSlice(6, 1, 0.5, 0, 0.3, 0);
  assert.equal(plaque.positions[1], plaque.positions[4 * 3 + 1]);
});

test('plaques grow with the title and keep their caps', () => {
  const small = plaqueSize(4, 2, 0.3), wide = plaqueSize(8, 2, 0.3);
  assert(wide.width > small.width);
  assert.equal(wide.cap, small.cap);
});
