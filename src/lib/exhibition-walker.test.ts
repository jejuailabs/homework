import test from 'node:test';
import assert from 'node:assert/strict';
import {walkerModelUrl, walkerPet, walkerPetIds} from './exhibition-walker';

test('every pet a pupil can pick has a 3D walker', () => {
  assert.equal(walkerPetIds.length, 33);
  for (const id of ['friend-cat', 'friend-otter', 'cat-siamese', 'dog-corgi', 'animal-seal', 'animal-crab-lilac', 'animal-seahorse-butter', 'berry-blue', 'berry-rasp', 'animal-whiteknee']) assert(walkerPetIds.includes(id), id);
});

test('a pupil without a My Space pet walks as the basic friend, and unknown values fall back to the cat friend', () => {
  assert.equal(walkerPet('dog-corgi', 'otter'), 'dog-corgi');
  assert.equal(walkerPet(null, 'otter'), 'friend-otter');
  assert.equal(walkerPet('not-a-pet', undefined), 'friend-cat');
  assert.equal(walkerPet('constructor', 'toString'), 'friend-cat');
});

test('model addresses come only from the known file list', () => {
  const before = process.env.NEXT_PUBLIC_EXHIBITION_WALKER_ASSET_BASE;
  process.env.NEXT_PUBLIC_EXHIBITION_WALKER_ASSET_BASE = '/walkers/';
  try {
    assert.equal(walkerModelUrl('friend-cat'), '/walkers/friend-cat-mochi.glb');
    assert.equal(walkerModelUrl('berry-blue'), '/walkers/berry-blue-jerry.glb');
    assert.equal(walkerModelUrl('animal-whiteknee'), '/walkers/animal-whiteknee.glb');
    assert.equal(walkerModelUrl('../secret'), null);
    assert.equal(walkerModelUrl('constructor'), null);
    assert.equal(walkerModelUrl(null), null);
  } finally { if (before === undefined) delete process.env.NEXT_PUBLIC_EXHIBITION_WALKER_ASSET_BASE; else process.env.NEXT_PUBLIC_EXHIBITION_WALKER_ASSET_BASE = before; }
});
