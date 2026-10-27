import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {newPets, juniorBodyStates, juniorAttachmentIds, compatibleWearable} from './new-pets';
import {juniorAttachmentAssets, juniorPoses} from './junior-assets';
import {juniorLayout} from './junior-wardrobe';
import {wornSprite} from './appearance';
import {spaceCatalog, starterSpaceIds, defaultRoom} from './catalog';
import {validateRoom} from './policy';
import {wardrobeCatalog} from '@/lib/points-types';

test('six body products and nine accessories are shared across the ten new friends', () => {
  const clothes = spaceCatalog.filter(i => i.kind === 'clothes' && compatibleWearable(newPets[0].id, i));
  const accessories = wardrobeCatalog.filter(i => (i.slot === 'head' || i.slot === 'neck') && compatibleWearable(newPets[0].id, i));
  assert.equal(clothes.length, 6); assert.equal(accessories.length, 9);
  assert.equal(accessories.filter(i => i.slot === 'head').length, 5);
  assert.equal(accessories.filter(i => i.slot === 'neck').length, 4);
  for (const pet of newPets) {
    assert.deepEqual(spaceCatalog.filter(i => i.kind === 'clothes' && compatibleWearable(pet.id, i)).map(i => i.id), clothes.map(i => i.id));
    for (const item of [...clothes, ...accessories]) assert(!compatibleWearable('friend-cat', item));
    assert(compatibleWearable(pet.id, {id: 'background-cloud', slot: 'background'}));
    assert(compatibleWearable(pet.id, {id: 'frame-stars', slot: 'frame'}));
    assert(!compatibleWearable(pet.id, {id: 'body-knit', slot: 'body'}));
  }
});

test('all 150 alpha assets match the manifest and all 70 poses have valid face landmarks', () => {
  const manifest = JSON.parse(readFileSync('public/my-space/v5/manifest.json', 'utf8'));
  assert.equal(manifest.assets.length, 150);
  assert.equal(Object.keys(juniorAttachmentAssets).length, 90);
  assert.equal(Object.keys(juniorPoses).length, 70);
  for (const a of manifest.assets) {
    const bytes = readFileSync('public' + a.src);
    assert(a.alpha); assert.equal(bytes.length, a.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), a.sha256);
  }
  for (const pose of Object.values(juniorPoses)) {
    assert(pose.x > 35 && pose.x < 65);
    assert(pose.eyeY > 25 && pose.eyeY < 65);
    assert(pose.eyeSpan > 15 && pose.eyeSpan < 38);
  }
});

test('2100 new friend looks resolve to existing sprites and bounded head/neck attachment layouts', () => {
  let combinations = 0;
  const heads = juniorAttachmentIds.filter(id => id.startsWith('junior-head-'));
  const necks = juniorAttachmentIds.filter(id => id.startsWith('junior-neck-'));
  for (const pet of newPets) for (const state of ['bare', ...juniorBodyStates]) {
    const body = state === 'bare' ? undefined : 'junior-body-' + state;
    assert(existsSync('public' + wornSprite(pet.id, {body})));
    for (const head of [undefined, ...heads]) for (const neck of [undefined, ...necks]) {
      combinations++;
      for (const id of [head, neck]) if (id) {
        const f = juniorLayout(pet.id, id, body)!;
        assert(f, pet.id + '/' + id);
        assert(f.left >= 0 && f.top >= 0 && f.width > 0 && f.height > 0);
        assert(f.left + f.width <= 100 && f.top + f.height <= 100, `${pet.id} ${state} ${id}: ${JSON.stringify(f)}`);
        if (id.startsWith('junior-head-') && id !== 'junior-head-flower') assert(f.top + f.height <= juniorPoses[pet.id + '/' + state].eyeY - 6, 'headwear must leave the eyes visible');
        assert(existsSync('public' + f.asset.src));
      }
    }
  }
  assert.equal(combinations, 2100);
  assert.equal(juniorLayout('dog-bichon', 'head-crown'), null);
});

test('shared new clothes require ownership and persist on another adopted new friend without another purchase', () => {
  const clothes = juniorBodyStates.map(state => 'junior-body-' + state);
  for (const pet of newPets) for (const body of clothes) {
    const room = {...defaultRoom(), pet: pet.id, outfit: {body}};
    assert.throws(() => validateRoom(room, [...starterSpaceIds, pet.id]));
    const saved = validateRoom(room, [...starterSpaceIds, pet.id, body]);
    assert.equal(saved.outfit.body, body);
    const other = newPets.find(i => i.id !== pet.id)!;
    const switched = validateRoom({...saved, pet: other.id}, [...starterSpaceIds, pet.id, other.id, body]);
    assert.equal(switched.outfit.body, body);
    assert(wornSprite(other.id, switched.outfit).includes('/' + other.id + '/'));
  }
});
