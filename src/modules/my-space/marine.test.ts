import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {marinePets, marineFamilies, marineSetItems, marineSprite} from './marine';
import {compatibleWearable, supportsSharedWearables} from './new-pets';
import {avatarPet, wornSprite} from './appearance';
import {defaultRoom, starterSpaceIds} from './catalog';
import {validateRoom} from './policy';
import {companionProfile} from './profile';
import {groupFriends, itemFriends} from './wardrobe-groups';

test('six selected identities have 20 complete looks each and share only within their species', () => {
  assert.deepEqual(marinePets.map(p => p.concept), [1, 2, 3, 5, 3, 6]);
  assert.equal(marineSetItems.length, 60);
  for (const family of marineFamilies) assert.equal(groupFriends(family.id).length, 2);
  for (const pet of marinePets) {
    const sets = marineSetItems.filter(s => s.family === pet.family);
    assert.equal(sets.length, 20); assert.equal(supportsSharedWearables(pet.id), false);
    assert.equal(avatarPet('otter', marineSprite(pet.id)), pet.id);
    for (const set of marineSetItems) {
      assert.equal(compatibleWearable(pet.id, set), pet.family === set.family);
      if (pet.family === set.family) {
        assert(set.clothes && set.accessories);
        assert.equal(wornSprite(pet.id, {body: set.id}), marineSprite(pet.id, set.id));
        assert.equal(itemFriends(set).length, 2);
      } else assert.equal(marineSprite(pet.id, set.id), marineSprite(pet.id));
      assert.equal(compatibleWearable('animal-seahorse-butter', set), false);
      assert.equal(compatibleWearable('friend-cat', set), false);
    }
  }
});
test('owned sets persist on profiles, reject cross-species clothing, and clear to basic', () => {
  const owned = [...starterSpaceIds, ...marinePets.map(p => p.id), ...marineSetItems.map(s => s.id)];
  for (const pet of marinePets) {
    const room = {...defaultRoom(), pet: pet.id, pose: 'raised', outfit: {body: `${pet.family}-set-scholar`}};
    const saved = validateRoom(room, owned, pet.id);
    assert.equal(saved.pose, 'rest');
    assert.equal(companionProfile({spaceOwned: owned}, saved)?.outfit.body, room.outfit.body);
    assert.deepEqual(validateRoom({...room, outfit: {}}, owned, pet.id).outfit, {});
    assert.throws(() => validateRoom({...room, outfit: {body: pet.family === 'crab' ? 'dolphin-set-scholar' : 'crab-set-scholar'}}, owned, pet.id));
    assert.throws(() => validateRoom(room, [...starterSpaceIds, pet.id], pet.id));
  }
});
test('126 versioned marine sprites and seven source sheets are bundled with valid hashes', () => {
  const root = 'public/my-space/marine/v1/';
  const manifest = JSON.parse(fs.readFileSync(root + 'manifest.json', 'utf8'));
  assert.equal(manifest.files.length, 126);
  assert.equal(new Set(manifest.files.map((f: {sha256: string}) => f.sha256)).size, 126);
  for (const file of manifest.files) {
    const bytes = fs.readFileSync('public' + file.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    assert.equal(file.bytes, bytes.length); assert.equal(file.width, 768); assert.equal(file.height, 768);
  }
  assert(fs.existsSync(root + 'sheets/selected-base.png'));
  for (const pet of marinePets) assert(fs.existsSync(root + 'sheets/' + pet.id + '.png'));
});
